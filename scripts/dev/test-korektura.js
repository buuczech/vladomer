/* scripts/dev/test-korektura.js — vývojový nástroj, v CI se nespouští.
 *   node scripts/dev/test-korektura.js
 *
 * Nic neodesílá, nic nezapisuje, nic nestojí. Tři části:
 *   1) vyrenderuje prompt-korektura.md a vypíše ho
 *   2) pustí mechanickou očistu na ostrá data a vypíše každou změnu
 *   3) prožene kontrolu faktů sadou podvržených „oprav" a ověří, že je odmítne
 *
 * Spouštět po každé úpravě prompt-korektura.md nebo korektura.js.
 */
import { readFileSync } from "node:fs";
import { render } from "../lib/nastaveni.js";
import { ocisti, zkontrolujOpravu, opravDavku, POLE_KOREKTURY, jazykPole, ctiPole } from "../lib/korektura.js";

const evals = JSON.parse(readFileSync(new URL("../../public/evaluations.json", import.meta.url), "utf8")).evals;

// 1 — prompt se musí vyrenderovat a ukázat model očekávaný tvar odpovědi
const p = render("prompt-korektura.md", { SEZNAM_STAVU_CS: "- probíhá", SEZNAM_TEXTU: "[0.0|comment_cs] ukázka" });
if (!p.includes("[1.1|comment_cs]")) {
  console.log("CHYBA: v promptu chybí ukázka tvaru odpovědi [1.1|comment_cs]");
  process.exit(1);
}
// Smluvené „nemám co opravit“. Bez něj model odpoví prózou, rozklad ji
// nepřečte a withBackoff zaplatí ještě dvakrát totéž.
if (!p.includes("[nic]")) {
  console.log("CHYBA: v promptu chybí smluvený řádek [nic]");
  process.exit(1);
}
console.log("=".repeat(72));
console.log(p);
console.log("=".repeat(72) + "\n");

// 2 — mechanická očista na ostrých datech
let n = 0;
for (const id in evals) {
  for (const pole of POLE_KOREKTURY) {
    const a = ctiPole(evals[id], pole);
    if (!a) continue;
    const b = ocisti(a, jazykPole(pole));
    if (a !== b) {
      n++;
      console.log(`OČISTA ${id} ${pole}`);
      console.log(`  - ${a.slice(0, 150)}`);
      console.log(`  + ${b.slice(0, 150)}`);
    }
  }
}
console.log(`\nMechanická očista by změnila ${n} úryvků.\n`);

// 3a — identita: žádný ostrý text nesmí být sám proti sobě vyhodnocen jako změna
let chyb = 0, kontrolovano = 0;
for (const id in evals) {
  for (const pole of POLE_KOREKTURY) {
    const a = ctiPole(evals[id], pole);
    if (!a) continue;
    kontrolovano++;
    const d = zkontrolujOpravu(a, a, { jazyk: jazykPole(pole) });
    if (d !== "beze změny") { chyb++; console.log(`CHYBA identity ${id} ${pole}: ${d}`); }
  }
}
console.log(`Identita: ${kontrolovano} řetězců zkontrolováno, ${chyb} chyb.`);

// 3b — podvrhy: každý MUSÍ být odmítnut
const E = "zákon č. 264/2025 Sb., vyhláška č. 408/2025 Sb.";
const podvrhy = [
  ["změněné číslo", E, E.replace("264", "265")],
  ["smazaná citace", E, E.replace(", vyhláška č. 408/2025 Sb.", "")],
  ["zkrácení", E, E.slice(0, 20)],
  ["prázdné", E, "   "],
  ["přidaný zápor", "Zákon dosud nabyl účinnosti.", "Zákon dosud nenabyl účinnosti."],
  ["ubraný zápor", "Vláda nezahájila kroky.", "Vláda zahájila kroky."],
  ["procenta slovy", "Podpora vzrostla o 20 %.", "Podpora vzrostla o 20 procent."],
  ["značka vrácená zpět", "Vláda schválila návrh.", '<cite index="1-1">Vláda schválila návrh.</cite>'],
  ["změněný rok", "Účinnost od 1. ledna 2026.", "Účinnost od 1. ledna 2027."],
  ["změněný odkaz", "Zdroj https://irozhlas.cz/a", "Zdroj https://novinky.cz/a"],
];
console.log("\nPodvrhy (každý musí být odmítnut):");
for (const [k, a, b] of podvrhy) {
  const d = zkontrolujOpravu(a, b, { jazyk: "cs", minDelka: 12 });
  if (!d) { chyb++; console.log(`  CHYBA: „${k}" PROŠEL`); } else console.log(`  ok  ${k} → ${d}`);
}

// 3c — legitimní opravy: každá MUSÍ projít
const opravy = [
  ["slovakismus", "Prvé hodnocení: program běží.", "První hodnocení: program běží."],
  ["slub → slib", "Slub vláda porušila.", "Slib vláda porušila."],
  ["chybějící mezera", "Bez novýchlegisl. kroků od vlády.", "Bez nových legislativních kroků od vlády."],
  ["předložka", "Dvě z tří staveb byly zahájeny.", "Dvě ze tří staveb byly zahájeny."],
  ["vokalizace", "Deficit v státním rozpočtu.", "Deficit ve státním rozpočtu."],
  ["cizí měsíc s číslem", "Schváleno 10. lipca 2026 (89:86).", "Schváleno 10. července 2026 (89:86)."],
  ["azbuka", "Rozsah obeщaného snížení.", "Rozsah slíbeného snížení."],
];
console.log("\nLegitimní opravy (každá musí projít):");
for (const [k, a, b] of opravy) {
  const d = zkontrolujOpravu(a, b, { jazyk: "cs" });
  if (d) { chyb++; console.log(`  CHYBA: „${k}" ODMÍTNUTA → ${d}`); } else console.log(`  ok  ${k}`);
}

// 4 — rozklad odpovědi modelu. Texty jsou plné uvozovek, na kterých se
//     v prvním ostrém běhu rozbil JSON; řádkový tvar je escapovat nemusí.
console.log("\nRozklad odpovědi modelu:");
const puvodniFetch = globalThis.fetch;
async function zkusOdpoved(popis, odpoved, davka, ocekavanoOpraveno, ocekavanoOdmitnuto = null) {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: odpoved }] }) });
  try {
    const r = await opravDavku(davka, { model: "x", key: "x", maxTokens: 100 });
    if (r.zmeneno !== ocekavanoOpraveno) {
      chyb++; console.log(`  CHYBA ${popis}: čekáno ${ocekavanoOpraveno} oprav, vráceno ${r.zmeneno}`);
    } else if (ocekavanoOdmitnuto !== null && r.odmitnuto !== ocekavanoOdmitnuto) {
      chyb++; console.log(`  CHYBA ${popis}: čekáno ${ocekavanoOdmitnuto} odmítnutých, `
        + `vráceno ${r.odmitnuto} (${r.duvody.join("; ")})`);
    } else {
      console.log(`  ok  ${popis} → ${r.zmeneno} opraveno, ${r.odmitnuto} odmítnuto`);
    }
    return r;
  } catch (e) {
    if (ocekavanoOpraveno === -1) { console.log(`  ok  ${popis} → hlásí chybu: ${e.message.slice(0, 60)}`); return null; }
    chyb++; console.log(`  CHYBA ${popis}: ${e.message.slice(0, 80)}`);
    return null;
  } finally { globalThis.fetch = puvodniFetch; }
}

const davkaS = [
  { klic: "1.1|comment_cs", id: "1.1", pole: "comment_cs", text: 'Prvé hodnocení: „slub“ byl porušen v roce 2026.' },
  { klic: "2.4|change_en", id: "2.4", pole: "change_en", text: 'The government "approved" the plan in 2026.' },
];
await zkusOdpoved("text s uvozovkami (rozbíjel JSON)",
  '[1.1|comment_cs] První hodnocení: „slib“ byl porušen v roce 2026.\n'
  + '[2.4|change_en] The government "approved" the plan in 2026.', davkaS, 1); // druhý beze změny
await zkusOdpoved("prázdná odpověď", "", davkaS, 0);
await zkusOdpoved("odpověď [] z dump-prompts", "[]", davkaS, 0);
await zkusOdpoved("obalené markdownem", '```\n[1.1|comment_cs] První hodnocení: „slib“ byl porušen v roce 2026.\n```', davkaS, 1);
await zkusOdpoved("vymyšlený identifikátor", "[9.9|comment_cs] Nějaký text.", davkaS, 0);
await zkusOdpoved("úplně jiný tvar odpovědi", "Opravil jsem tyto úryvky:\n1. První hodnocení…", davkaS, -1);
await zkusOdpoved("podvrh se změněným rokem", "[1.1|comment_cs] První hodnocení: „slib“ byl porušen v roce 2027.", davkaS, 0);
// Smluvené „nemám co opravit“ — nesmí skončit jako nečitelný řádek, jinak
// se dávka třikrát zaplatí a nakonec zahodí (kapitola 3 a zprávy, 22. 8.).
await zkusOdpoved("smluvené [nic]", "[nic]", davkaS, 0, 0);
await zkusOdpoved("[nic] obalené markdownem", "```\n[nic]\n```", davkaS, 0, 0);
await zkusOdpoved("[NIC] velkými písmeny", "[NIC]", davkaS, 0, 0);
await zkusOdpoved("[nic] za opravou (rozpor — oprava platí)",
  "[1.1|comment_cs] První hodnocení: „slib“ byl porušen v roce 2026.\n[nic]", davkaS, 1, 0);

// 5 — párování podle identifikátoru. Model má vracet JEN opravené úryvky,
//     takže vynechaný řádek je běžný stav. Kdyby se párovalo podle pořadí,
//     od prvního vynechání by se každá oprava porovnávala s cizím originálem
//     a kontrola faktů by zamítla i to, co je v pořádku. Každý bod má proto
//     jiná čísla — u pořadového párování musí fixtura spadnout.
console.log("\nPárování opravených úryvků s originály:");
const davkaP = [
  { klic: "4.1|comment_cs", id: "4.1", pole: "comment_cs", text: "Prvé hodnocení: vláda schválila návrh 3. 6. 2026." },
  { klic: "4.2|comment_cs", id: "4.2", pole: "comment_cs", text: "Slub o 15 nových lůžkách vláda porušila." },
  { klic: "4.3|comment_cs", id: "4.3", pole: "comment_cs", text: "Dvě z tří staveb bylo zahájeno v roce 2027." },
  { klic: "4.4|comment_cs", id: "4.4", pole: "comment_cs", text: "Deficit v státním rozpočtu činil 289 miliard." },
];
const R = {
  "4.1": "[4.1|comment_cs] První hodnocení: vláda schválila návrh 3. 6. 2026.",
  "4.2": "[4.2|comment_cs] Slib o 15 nových lůžkách vláda porušila.",
  "4.3": "[4.3|comment_cs] Dvě ze tří staveb byly zahájeny v roce 2027.",
  "4.4": "[4.4|comment_cs] Deficit ve státním rozpočtu činil 289 miliard.",
};
await zkusOdpoved("chybí řádek uprostřed", [R["4.1"], R["4.3"], R["4.4"]].join("\n"), davkaP, 3, 0);
await zkusOdpoved("chybí první i poslední řádek", [R["4.2"], R["4.3"]].join("\n"), davkaP, 2, 0);
await zkusOdpoved("řádky v jiném pořadí", [R["4.4"], R["4.1"], R["4.3"]].join("\n"), davkaP, 3, 0);
await zkusOdpoved("týž identifikátor dvakrát", [R["4.1"], R["4.1"], R["4.3"]].join("\n"), davkaP, 2, 1);
await zkusOdpoved("jedna podvržená mezi platnými",
  [R["4.1"], R["4.2"], R["4.3"], "[4.4|comment_cs] Deficit ve státním rozpočtu činil 298 miliard."].join("\n"),
  davkaP, 3, 1);

// 6 — porucha z běhu 22. 8. 2026: model odpověděl na každý řádek verdiktem
//     o úryvku místo opraveného textu. Devatenáct verdiktů se zachytilo
//     o čísla, ale krátké pole bez číslic proklouzlo a do dat se zapsalo
//     „– Vypadá správně." místo popisu změny. Musí padnout celá dávka.
console.log("\nOdpověď, která není korektura:");
const davkaV = davkaP.concat(
  { klic: "4.5|change_cs", id: "4.5", pole: "change_cs", text: "Beze změny." });
await zkusOdpoved("verdikty místo oprav",
  ["4.1", "4.2", "4.3", "4.4"].map((i) => `[${i}|comment_cs] Text je v pořádku.`)
    .concat("[4.5|change_cs] – Vypadá správně.").join("\n"), davkaV, -1);
// Kontrola, že sama o sobě je ta věta pro kontrolu úryvků neviditelná —
// proto ji nelze zachytit jinde než na celé dávce.
if (zkontrolujOpravu("Beze změny.", "– Vypadá správně.", { jazyk: "cs" })) {
  chyb++; console.log("  CHYBA: fixtura přestala platit, úryvek zachytí i kontrola jednotlivé opravy");
} else console.log("  ok  samotný úryvek kontrolou projde — chytit to jde jen na dávce");

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVŠE V POŘÁDKU.");
process.exit(chyb ? 1 : 0);
