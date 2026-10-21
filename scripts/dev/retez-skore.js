/* scripts/dev/retez-skore.js — co by šlo na web: hodnocení + kontrola faktů + rozhodnutí proti pravdě.
 *
 *     node scripts/dev/retez-skore.js <evaluations po rozhodnutí> <rozhodnuti.json> [evaluations po hodnocení]
 *
 * Měří celý řetěz měsíčního běhu na bodech zlaté a kontrolní sady (pravda
 * ověřená vlastníkem). Jediné číslo, které musí být nula: bod, který jde na
 * web jako ověřený (vrstva R ho pustila), a přitom má jiný stav než pravda.
 * Ostatní čísla říkají, kolik práce dostane vlastník a jestli k ní dostane
 * správný návrh.
 *
 *   ověřeno správně      na webu jako ověřené, stav sedí
 *   OVĚŘENO ŠPATNĚ       na webu jako ověřené, stav nesedí            — cíl: 0
 *   k vlastníkovi        podržené / bez razítka (web ukáže „čeká na ověření“):
 *     – web sedí           vlastník jen potvrdí
 *     – návrh sedí         vlastník přijme navržený stav a je hotovo
 *     – bez dobrého návrhu vlastník musí sám (nebo počká na další běh)
 *
 * Exit 0 vždy. Poslední řádek: SKORE_RETEZ {…}.
 */
import { readFileSync } from "node:fs";

const [, , cestaPo, cestaRozhodnuti, cestaHodnoceni] = process.argv;
if (!cestaPo || !cestaRozhodnuti) { console.error("použití: retez-skore.js <evaluations po rozhodnutí> <rozhodnuti.json> [evaluations po hodnocení]"); process.exit(1); }
const cist = (p) => JSON.parse(readFileSync(p, "utf8"));
const po = cist(cestaPo).evals || {};
const R = cist(cestaRozhodnuti).body || {};
const hodn = cestaHodnoceni ? cist(cestaHodnoceni).evals || {} : null;
const SADY = ["zlata-sada", "kontrolni-sada"].map((f) => ({ jmeno: f, ...cist(new URL(`./fixtury/${f}.json`, import.meta.url)) }));
const CS = { fulfilled: "splněno", partial: "částečně", in_progress: "probíhá", declared: "deklarováno", not_started: "nezahájeno", broken: "porušeno", unverifiable: "neměřitelné" };
const stav = (e) => (e ? (e.unverifiable ? "unverifiable" : e.status) : null);

const rad = [];
for (const s of SADY) for (const g of s.body) {
  const pravda = g.unverifiable ? "unverifiable" : g.stav;
  const web = stav(po[g.id]);
  const r = R[g.id] || { akce: "?", problemy: [] };
  const navrhy = [];
  if (r.vlastnik) {
    const n = r.vlastnik.navrh;
    if (n && n.zdroj === "hodnotitel" && n.zaznam) navrhy.push(stav(n.zaznam));
    if (n && n.zdroj === "kontrola" && n.stav) navrhy.push(n.stav);
    if (r.vlastnik.kontrola && r.vlastnik.kontrola.stav) navrhy.push(r.vlastnik.kontrola.stav);
  }
  let vysledek;
  if (r.akce === "zverejnit" && !r.vlastnik) vysledek = web === pravda ? "ověřeno správně" : "OVĚŘENO ŠPATNĚ";
  else if (web === pravda) vysledek = "k vlastníkovi – web sedí";
  else if (navrhy.includes(pravda)) vysledek = "k vlastníkovi – návrh sedí";
  else vysledek = "k vlastníkovi – bez dobrého návrhu";
  rad.push({ sada: s.jmeno, id: g.id, pravda, web, hodnoceni: hodn ? stav(hodn[g.id]) : null, akce: r.akce, navrhy: [...new Set(navrhy)], problemy: r.problemy || [], vysledek });
}

console.log(`Řetěz hodnocení → kontrola faktů → rozhodnutí | ${cestaPo}`);
console.log("\nsada           bod    hodnocení      na webu        pravda         výsledek                          návrhy / důvody");
for (const r of rad) {
  console.log(`${r.sada.padEnd(14)} ${r.id.padEnd(6)} ${(CS[r.hodnoceni] || "—").padEnd(14)} ${(CS[r.web] || "—").padEnd(14)} ${(CS[r.pravda] || "—").padEnd(14)} ${r.vysledek.padEnd(33)} ${r.navrhy.map((x) => CS[x]).join("/")}${r.problemy.length ? ` · ${r.problemy.join(", ")}` : ""}`);
}
const pocet = (v, sada) => rad.filter((r) => r.vysledek === v && (!sada || r.sada === sada)).length;
const souhrn = {};
for (const sada of [null, "zlata-sada", "kontrolni-sada"]) {
  const k = sada || "celkem";
  const rr = rad.filter((r) => !sada || r.sada === sada);
  souhrn[k] = {
    bodu: rr.length,
    hodnoceni_sedi: hodn ? rr.filter((r) => r.hodnoceni === r.pravda).length : null,
    overeno_spravne: pocet("ověřeno správně", sada),
    overeno_spatne: rr.filter((r) => r.vysledek === "OVĚŘENO ŠPATNĚ").map((r) => r.id),
    k_vlastnikovi: rr.filter((r) => r.vysledek.startsWith("k vlastníkovi")).length,
    vlastnik_web_sedi: pocet("k vlastníkovi – web sedí", sada),
    vlastnik_navrh_sedi: pocet("k vlastníkovi – návrh sedí", sada),
    vlastnik_bez_navrhu: pocet("k vlastníkovi – bez dobrého návrhu", sada),
  };
}
console.log("");
for (const [k, x] of Object.entries(souhrn)) {
  console.log(`souhrn ${k.padEnd(15)} ${x.hodnoceni_sedi !== null ? `hodnocení samo sedí ${x.hodnoceni_sedi}/${x.bodu}; ` : ""}ověřeno správně ${x.overeno_spravne}, OVĚŘENO ŠPATNĚ ${x.overeno_spatne.length}${x.overeno_spatne.length ? ` (${x.overeno_spatne.join(", ")})` : ""}; k vlastníkovi ${x.k_vlastnikovi} (web sedí ${x.vlastnik_web_sedi}, návrh sedí ${x.vlastnik_navrh_sedi}, bez dobrého návrhu ${x.vlastnik_bez_navrhu})`);
}
const c = souhrn.celkem;
console.log(`\nNa web jako ověřené by šlo ${c.overeno_spravne + c.overeno_spatne.length} bodů, z toho se špatným stavem ${c.overeno_spatne.length}.`);
console.log(`\nSKORE_RETEZ ${JSON.stringify(c)}`);
