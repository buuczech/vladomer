/* scripts/dev/zlata-sada-skore.js — shoda hodnocení s realitou (spec 002).
 *
 *     node scripts/dev/zlata-sada-skore.js [evaluations.json] [zlata-sada.json]
 *
 * Výchozí: public/evaluations.json proti scripts/dev/fixtury/zlata-sada.json.
 *
 * Zlatá sada jsou body, jejichž skutečný stav vlastník potvrdil z primárních
 * záznamů (revize 20. 10. 2026). Měří se tu, jak se hodnocení shoduje se
 * SKUTEČNOSTÍ — ne jak se shoduje samo se sebou (to je porovnej-behy.js).
 * Podle toho se vybírá model a měří každá změna promptu (ústava, zásada IV).
 *
 * Tři měřítka:
 *   stav     status (a neměřitelnost) se shoduje s potvrzenou pravdou
 *   předpis  u bodů, kde pravda stojí na předpisu, ho hodnocení cituje
 *            (a necituje jiné číslo z téhož období)
 *   datum    u „splněno“ a „porušeno“ sedí datum dokladu
 *
 * Exit 0 vždy: i špatné skóre je platný výsledek měření, ne chyba skriptu.
 * Strojově čitelný souhrn je poslední řádek (SKORE {…}).
 */
import { readFileSync } from "node:fs";

const [, , cestaEval = "public/evaluations.json", cestaSady = "scripts/dev/fixtury/zlata-sada.json"] = process.argv;
const evals = JSON.parse(readFileSync(cestaEval, "utf8")).evals || {};
const sada = JSON.parse(readFileSync(cestaSady, "utf8"));

const CS = { fulfilled: "splněno", partial: "částečně", in_progress: "probíhá", declared: "deklarováno", not_started: "nezahájeno", broken: "porušeno" };
const popisStavu = (status, neměř) => (neměř ? "neměřitelné" : CS[status] || status || "—");
const znacky = (text) => [...String(text || "").matchAll(/(\d{1,4})\s*\/\s*(\d{4})\s+Sb\b/g)].map((m) => `${Number(m[1])}/${m[2]}`);

let n = 0, stavOk = 0, predN = 0, predOk = 0, datN = 0, datOk = 0, chybi = 0;
const radky = [];
for (const g of sada.body) {
  const e = evals[g.id];
  n++;
  if (!e) { chybi++; radky.push({ id: g.id, web: "(chybí)", pravda: popisStavu(g.stav, g.unverifiable), stav: false, pozn: "hodnocení chybí" }); continue; }
  const shodaStavu = g.unverifiable ? e.unverifiable === true : (!e.unverifiable && e.status === g.stav);
  if (shodaStavu) stavOk++;
  const pozn = [];
  let predpis = null;
  if (g.predpis && g.predpis.kod) {
    predN++;
    const cituje = new Set([...znacky(e.evidence), ...((e.sbirka && e.sbirka.overene) || []).map((p) => p.kod)]);
    predpis = cituje.has(g.predpis.kod);
    if (predpis) predOk++;
    else pozn.push(`necituje ${g.predpis.kod}${cituje.size ? ` (cituje ${[...cituje].join(", ")})` : ""}`);
  }
  let datum = null;
  if (["fulfilled", "broken"].includes(g.stav) && g.datum_dokladu) {
    datN++;
    datum = e.evidenceDate === g.datum_dokladu;
    if (datum) datOk++;
    else pozn.push(`datum ${e.evidenceDate || "—"} místo ${g.datum_dokladu}`);
  }
  radky.push({ id: g.id, web: popisStavu(e.status, e.unverifiable), pravda: popisStavu(g.stav, g.unverifiable), stav: shodaStavu, predpis, datum, pozn: pozn.join("; ") });
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)} %` : "—");
const znak = (v) => (v === null ? "·" : v ? "✓" : "✗");
console.log(`Zlatá sada: ${sada.body.length} bodů, pravda k ${sada.datum_pravdy || "?"} | hodnocení: ${cestaEval}\n`);
console.log("bod    hodnocení      pravda         stav předpis datum  poznámka");
for (const r of radky) {
  console.log(`${r.id.padEnd(6)} ${r.web.padEnd(14)} ${r.pravda.padEnd(14)} ${znak(r.stav).padEnd(4)} ${znak(r.predpis).padEnd(7)} ${znak(r.datum).padEnd(6)} ${r.pozn || ""}`);
}
console.log(`\nstav:    ${stavOk}/${n}  (${pct(stavOk, n)})`);
console.log(`předpis: ${predOk}/${predN}  (${pct(predOk, predN)})`);
console.log(`datum:   ${datOk}/${datN}  (${pct(datOk, datN)})`);
if (chybi) console.log(`chybí hodnocení: ${chybi}`);
const rozdily = radky.filter((r) => !r.stav).map((r) => r.id);
if (rozdily.length) console.log(`stav nesedí: ${rozdily.join(", ")}`);
console.log(`\nSKORE ${JSON.stringify({ bodu: n, stav: stavOk, predpis: predOk, predpis_z: predN, datum: datOk, datum_z: datN, chybi, nesedi: rozdily })}`);
