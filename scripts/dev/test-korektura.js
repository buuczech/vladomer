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
import { render, assertFields } from "../lib/nastaveni.js";
import { ocisti, zkontrolujOpravu, POLE_KOREKTURY, jazykPole, ctiPole } from "../lib/korektura.js";

const evals = JSON.parse(readFileSync(new URL("../../public/evaluations.json", import.meta.url), "utf8")).evals;

// 1 — prompt se musí vyrenderovat a obsahovat povinná pole
const p = render("prompt-korektura.md", { SEZNAM_STAVU_CS: "- probíhá", SEZNAM_TEXTU: "[0.0|comment_cs] ukázka" });
assertFields(p, ["id", "text"], "prompt-korektura.md");
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

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVŠE V POŘÁDKU.");
process.exit(chyb ? 1 : 0);
