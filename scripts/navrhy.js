/* scripts/navrhy.js — větev beh/RRRR-MM s návrhy k rozhodnutí vlastníka (spec 005).
 *
 *     node scripts/navrhy.js vytvor --rozhodnuti faktcheck-vystup/rozhodnuti.json --zaklad <commit běhu>
 *     KOMENTAR="…" node scripts/navrhy.js komentar --soubor navrhy/2026-11.json [--koren pr]
 *     node scripts/navrhy.js soubory --soubor navrhy/2026-11.json
 *     node scripts/navrhy.js souhrn --soubor navrhy/2026-11.json [--koren pr]
 *
 * vytvor   na čerstvé větvi z commitu běhu založí navrhy/RRRR-MM.json a složí
 *          public/{evaluations,audit,history}.json (nic přijatého — vlastník přijímá výslovně).
 *          Vypíše, kolik návrhů je (0 = PR není potřeba).
 * komentar přečte příkazy z komentáře vlastníka (proměnná KOMENTAR — text se
 *          nikdy nevkládá do příkazové řádky) a větev přeskládá.
 * soubory  totéž pro soubory rozhodnuti/ ve větvi (odkazy z e-mailu,
 *          rozhodnuti-vetev.yml): provede je v pořadí, v jakém je vlastník
 *          přidal, a smaže je.
 * souhrn   vypíše stav rozhodnutí v Markdownu (odpověď do PR).
 *
 * --koren je adresář s checkoutem větve PR. rozhodnuti.yml (komentáře v PR)
 * spouští TENTO skript z výchozí větve a větev PR má vedle, takže kód z PR
 * se nikdy nespustí. rozhodnuti-vetev.yml běží z větve samotné — na tu smí
 * pushovat jen vlastník.
 * Pravidla jsou v lib/navrhy.js.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { novySoubor, proved, sloz, prikazyZKomentare, prikazyZeSouboru } from "./lib/navrhy.js";

const KOREN = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."), (() => { const i = process.argv.indexOf("--koren"); return i >= 0 ? process.argv[i + 1] : "."; })());
const arg = (j, v) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : v; };
const prikaz = process.argv[2];
const NAZVY = { fulfilled: "splněno", partial: "částečně splněno", in_progress: "probíhá", declared: "jen deklarováno", not_started: "nezahájeno", broken: "porušeno" };

const zGitu = (commit, cesta) => JSON.parse(execFileSync("git", ["-C", KOREN, "show", `${commit}:${cesta}`], { encoding: "utf8", maxBuffer: 1 << 28 }));
const zapis = (cesta, data) => { mkdirSync(dirname(join(KOREN, cesta)), { recursive: true }); writeFileSync(join(KOREN, cesta), `${JSON.stringify(data, null, 2)}${cesta.startsWith("navrhy/") ? "\n" : ""}`); };

function preskladej(soubor, cestaSouboru) {
  let faktcheck = null;
  try { faktcheck = zGitu(soubor.zaklad, "public/faktcheck.json"); } catch { /* běh bez kontroly faktů */ }
  const zaklad = { evals: zGitu(soubor.zaklad, "public/evaluations.json"), audit: zGitu(soubor.zaklad, "public/audit.json"), hist: zGitu(soubor.zaklad, "public/history.json"), faktcheck };
  const dnes = new Date().toISOString().slice(0, 10);
  const r = sloz(soubor, zaklad, dnes);
  zapis("public/evaluations.json", r.evals);
  zapis("public/audit.json", r.audit);
  zapis("public/history.json", r.hist);
  if (r.faktcheck) zapis("public/faktcheck.json", r.faktcheck);
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
  console.log(`návrhů: ${n}; přijato zatím ${r.prijato.length} (vyjde jen to, co vlastník přijme); soubor ${cesta}`);
} else if (prikaz === "komentar" || prikaz === "soubory") {
  const cesta = arg("soubor");
  if (!cesta || !existsSync(join(KOREN, cesta))) { console.error("--soubor navrhy/RRRR-MM.json je povinné"); process.exit(1); }
  const soubor = JSON.parse(readFileSync(join(KOREN, cesta), "utf8"));
  let prikazy, neplatne = [], adr = null, jmena = [];
  if (prikaz === "komentar") prikazy = prikazyZKomentare(process.env.KOMENTAR);
  else {
    adr = join(KOREN, "rozhodnuti");
    jmena = existsSync(adr) ? readdirSync(adr).filter((n) => statSync(join(adr, n)).isFile()) : [];
    // Pořadí = čas commitu, který soubor přidal (git log), při shodě jméno.
    const pridano = (n) => Number(execFileSync("git", ["-C", KOREN, "log", "-1", "--diff-filter=A", "--format=%ct", "--", `rozhodnuti/${n}`], { encoding: "utf8" }).trim()) || Number.MAX_SAFE_INTEGER;
    ({ prikazy, neplatne } = prikazyZeSouboru(jmena.map((jmeno) => ({ jmeno, text: readFileSync(join(adr, jmeno), "utf8"), poradi: pridano(jmeno) }))));
  }
  if (!prikazy.length && !neplatne.length) { console.log("žádný příkaz"); process.exit(0); }
  const zpravy = prikazy.map((p) => proved(soubor, { ...p, kdo: process.env.KDO || "vlastník" }).zprava);
  zpravy.push(...neplatne.map((n) => `Soubor rozhodnuti/${n} neobsahuje platný příkaz (třeba chybí důvod za „duvod:“) — nic se neprovedlo, soubor je smazaný.`));
  // /zverejnit provede workflow (sloučí PR a spustí nasazení) — tady jen řekne, že má.
  if (prikazy.some((p) => p.prikaz === "zverejnit") && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "zverejnit=true\n");
  preskladej(soubor, cesta);
  // Provedené soubory pryč — do sloučené větve ani na main nepatří.
  for (const n of jmena) rmSync(join(adr, n));
  console.log([...zpravy.map((z) => `- ${z}`), "", souhrn(soubor)].join("\n"));
} else if (prikaz === "souhrn") {
  console.log(souhrn(JSON.parse(readFileSync(join(KOREN, arg("soubor")), "utf8"))));
} else {
  console.error("použití: navrhy.js vytvor | komentar | soubory | souhrn");
  process.exit(1);
}
