/* scripts/dev/porovnej-behy.js — reprodukovatelnost dvou hodnoticích běhů.
 *
 *     node scripts/dev/porovnej-behy.js běh1/evaluations.json běh2/evaluations.json
 *
 * Dva běhy nad TÝMIŽ vstupy (stejná data, stejný kód, tentýž den) by měly dát
 * tentýž stav u každého bodu. Každý rozdíl je čistý šum modelu — žádná událost
 * ve světě ho nevysvětluje, protože mezi běhy žádný svět neuběhl.
 *
 * Tohle číslo je metrika celé stabilizace: měří se PŘED zásahem (baseline)
 * a po každé etapě. Cíl je ≥ 98 % shodných stavů a rozdíl headline 0,0 b.
 *
 * Exit kód: 0 vždy, když se soubory daly porovnat — i špatná reprodukovatelnost
 * je platný výsledek měření, ne chyba skriptu.
 */
import { readFileSync } from "node:fs";

const [, , cestaA, cestaB] = process.argv;
if (!cestaA || !cestaB) {
  console.error("Použití: node scripts/dev/porovnej-behy.js běh1/evaluations.json běh2/evaluations.json");
  process.exit(2);
}

const A = JSON.parse(readFileSync(cestaA, "utf8")).evals;
const B = JSON.parse(readFileSync(cestaB, "utf8")).evals;

const ids = [...new Set([...Object.keys(A), ...Object.keys(B)])]
  .sort((x, y) => x.localeCompare(y, "cs", { numeric: true }));

const headline = (evals) => {
  const rated = Object.values(evals).filter((e) => !e.unverifiable);
  const done = rated.filter((e) => e.status === "fulfilled").length;
  return { done, rated: rated.length, pct: (done / rated.length) * 100 };
};

let shodne = 0;
const rozdily = [];
for (const id of ids) {
  const a = A[id], b = B[id];
  if (!a || !b) { rozdily.push({ id, a: a?.status ?? "(chybí)", b: b?.status ?? "(chybí)" }); continue; }
  if (a.status === b.status && !!a.unverifiable === !!b.unverifiable) shodne++;
  else rozdily.push({ id, a: a.status + (a.unverifiable ? "/neměř." : ""), b: b.status + (b.unverifiable ? "/neměř." : "") });
}

const hA = headline(A), hB = headline(B);
console.log("=== reprodukovatelnost páru běhů ===");
console.log(`bodů porovnáno:   ${ids.length}`);
console.log(`shodný stav:      ${shodne}  (${(shodne / ids.length * 100).toFixed(1)} %)`);
console.log(`headline běh 1:   ${hA.pct.toFixed(2)} %  (${hA.done}/${hA.rated})`);
console.log(`headline běh 2:   ${hB.pct.toFixed(2)} %  (${hB.done}/${hB.rated})`);
console.log(`|Δ headline|:     ${Math.abs(hA.pct - hB.pct).toFixed(2)} p. b.`);

if (rozdily.length) {
  console.log(`\n=== ${rozdily.length} rozdílných bodů (čistý šum) ===`);
  for (const r of rozdily) console.log(`  ${r.id.padEnd(6)} ${r.a}  ↔  ${r.b}`);
}

/* Strojově čitelný souhrn na konec — CI si ho vytáhne do artefaktu
   a srovnání napříč etapami pak nevyžaduje louskání textu. */
console.log(`\nSOUHRN ${JSON.stringify({
  bodu: ids.length, shodne, procent: +(shodne / ids.length * 100).toFixed(2),
  headline1: +hA.pct.toFixed(2), headline2: +hB.pct.toFixed(2),
  deltaHeadline: +Math.abs(hA.pct - hB.pct).toFixed(2),
  rozdilne: rozdily.map((r) => r.id),
})}`);
