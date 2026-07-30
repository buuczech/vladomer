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
async function zkusOdpoved(popis, odpoved, davka, ocekavanoOpraveno) {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: odpoved }] }) });
  try {
    const r = await opravDavku(davka, { model: "x", key: "x", maxTokens: 100 });
    if (r.zmeneno === ocekavanoOpraveno) console.log(`  ok  ${popis} → ${r.zmeneno} opraveno`);
    else { chyb++; console.log(`  CHYBA ${popis}: čekáno ${ocekavanoOpraveno}, vráceno ${r.zmeneno}`); }
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

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVŠE V POŘÁDKU.");
process.exit(chyb ? 1 : 0);
