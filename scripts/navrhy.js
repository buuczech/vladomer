/* scripts/navrhy.js — větev beh/RRRR-MM s návrhy k rozhodnutí vlastníka (spec 005).
 *
 *     node scripts/navrhy.js vytvor --rozhodnuti faktcheck-vystup/rozhodnuti.json --zaklad <commit běhu>
 *     KOMENTAR="…" node scripts/navrhy.js komentar --soubor navrhy/2026-11.json [--koren pr]
 *     node scripts/navrhy.js souhrn --soubor navrhy/2026-11.json [--koren pr]
 *
 * vytvor   na čerstvé větvi z commitu běhu založí navrhy/RRRR-MM.json a složí
 *          public/{evaluations,audit,history}.json s výchozími návrhy.
 *          Vypíše, kolik návrhů je (0 = PR není potřeba).
 * komentar přečte příkazy z komentáře vlastníka (proměnná KOMENTAR — text se
 *          nikdy nevkládá do příkazové řádky) a větev přeskládá.
 * souhrn   vypíše stav rozhodnutí v Markdownu (odpověď do PR).
 *
 * --koren je adresář s checkoutem větve PR. Workflow spouští TENTO skript
 * z výchozí větve a větev PR má vedle, takže kód z PR se nikdy nespustí.
 * Pravidla jsou v lib/navrhy.js.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { novySoubor, proved, sloz, prikazyZKomentare } from "./lib/navrhy.js";

const KOREN = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."), (() => { const i = process.argv.indexOf("--koren"); return i >= 0 ? process.argv[i + 1] : "."; })());
const arg = (j, v) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : v; };
const prikaz = process.argv[2];
const NAZVY = { fulfilled: "splněno", partial: "částečně splněno", in_progress: "probíhá", declared: "jen deklarováno", not_started: "nezahájeno", broken: "porušeno" };

const zGitu = (commit, cesta) => JSON.parse(execFileSync("git", ["-C", KOREN, "show", `${commit}:${cesta}`], { encoding: "utf8", maxBuffer: 1 << 28 }));
const zapis = (cesta, data) => { mkdirSync(dirname(join(KOREN, cesta)), { recursive: true }); writeFileSync(join(KOREN, cesta), `${JSON.stringify(data, null, 2)}${cesta.startsWith("navrhy/") ? "\n" : ""}`); };

function preskladej(soubor, cestaSouboru) {
  const zaklad = { evals: zGitu(soubor.zaklad, "public/evaluations.json"), audit: zGitu(soubor.zaklad, "public/audit.json"), hist: zGitu(soubor.zaklad, "public/history.json") };
  const dnes = new Date().toISOString().slice(0, 10);
  const r = sloz(soubor, zaklad, dnes);
  zapis("public/evaluations.json", r.evals);
  zapis("public/audit.json", r.audit);
  zapis("public/history.json", r.hist);
  zapis(cestaSouboru, soubor);
  return r;
}

function souhrn(soubor) {
  const r = ["| bod | návrh | stav rozhodnutí |", "|---|---|---|"];
  for (const [bod, n] of Object.entries(soubor.navrhy).sort(([a], [b]) => a.localeCompare(b, "cs", { numeric: true }))) {
    const p = soubor.prijate[bod];
    r.push(`| ${bod} | ${NAZVY[n.zaznam.status] || n.zaznam.status}${n.vyvraceny ? " (tvrzení vyvrácené)" : ""} | ${p ? `přijmout${p.duvod ? " s důvodem" : ""}` : "nechat minulý záznam"} |`);
  }
  return r.join("\n");
}

if (prikaz === "vytvor") {
  const rozhodnuti = JSON.parse(readFileSync(resolve(KOREN, arg("rozhodnuti", "faktcheck-vystup/rozhodnuti.json")), "utf8"));
  const zaklad = arg("zaklad");
  if (!zaklad) { console.error("--zaklad <commit běhu> je povinné"); process.exit(1); }
  const soubor = novySoubor({ rozhodnuti, zaklad });
  const n = Object.keys(soubor.navrhy).length;
  if (!n) { console.log("návrhů: 0"); process.exit(0); }
  const cesta = `navrhy/${soubor.beh.slice(0, 7)}.json`;
  const r = preskladej(soubor, cesta);
  console.log(`návrhů: ${n}; ve výchozím stavu přijato ${r.prijato.length} (${r.prijato.join(", ") || "—"}); soubor ${cesta}`);
} else if (prikaz === "komentar") {
  const cesta = arg("soubor");
  if (!cesta || !existsSync(join(KOREN, cesta))) { console.error("--soubor navrhy/RRRR-MM.json je povinné"); process.exit(1); }
  const soubor = JSON.parse(readFileSync(join(KOREN, cesta), "utf8"));
  const prikazy = prikazyZKomentare(process.env.KOMENTAR);
  if (!prikazy.length) { console.log("žádný příkaz"); process.exit(0); }
  const zpravy = prikazy.map((p) => proved(soubor, { ...p, kdo: process.env.KDO || "vlastník" }).zprava);
  preskladej(soubor, cesta);
  console.log([...zpravy.map((z) => `- ${z}`), "", souhrn(soubor)].join("\n"));
} else if (prikaz === "souhrn") {
  console.log(souhrn(JSON.parse(readFileSync(join(KOREN, arg("soubor")), "utf8"))));
} else {
  console.error("použití: navrhy.js vytvor | komentar | souhrn");
  process.exit(1);
}
