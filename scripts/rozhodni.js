/* scripts/rozhodni.js — co z běhu půjde na web (spec 004, vrstva R).
 *
 *     node scripts/rozhodni.js --pred <evaluations.json před během>
 *          [--navrhy <NAVRHY_BEHU z evaluate.js>] [--faktcheck faktcheck-vystup] [--zkouska]
 *
 * Běží po evaluate.js a scripts/faktcheck.js, před test-konzistence a commitem.
 * Rozhoduje lib/faktcheck/rozhodnuti.js; tenhle skript jen načte vstupy
 * a zapíše výsledek:
 *   public/evaluations.json  podržené body mají zpátky CELÝ předchozí záznam,
 *                            nepotvrzené nezměněné body nemají nové razítko „prověřeno“
 *   public/history.json      dnešní snímek nese stav, který je opravdu na webu
 *   public/audit.json        dnešní řádek podrženého bodu dostane zadrzeno + faktcheck
 *                            (návrh zůstává dohledatelný; starší řádky se nemění)
 *   public/faktcheck.json    veřejný souhrn kontroly (bez UI)
 *   <faktcheck>/rozhodnuti.json  vše pro report a PR, včetně návrhů pro vlastníka
 *
 * Bez výsledku vrstvy M (modelova.json) se nic nepustí jako ověřené:
 * přepsané body se podrží, nezměněné zůstanou bez razítka. --zkouska nic
 * nezapisuje do public/, jen vypíše rozhodnutí.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSettings } from "./lib/nastaveni.js";
import { rozhodniBeh, stavZaznamu, oznacAudit, upravSnimek, nezverejnene as jenNezverejnene } from "./lib/faktcheck/rozhodnuti.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (j, v) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : v; };
const ZKOUSKA = process.argv.includes("--zkouska");
const cist = (p) => JSON.parse(readFileSync(p, "utf8"));
const PUB = (f) => join(KOREN, "public", f);

const cestaPred = arg("pred");
if (!cestaPred || !existsSync(cestaPred)) { console.error("--pred <evaluations.json před během> je povinné"); process.exit(1); }
const FC = resolve(KOREN, arg("faktcheck", "faktcheck-vystup"));
const cestaNavrhu = arg("navrhy", null);

const data = cist(PUB("evaluations.json"));
const pred = cist(cestaPred).evals || {};
const D = existsSync(join(FC, "deterministicky.json")) ? cist(join(FC, "deterministicky.json")) : null;
const M = existsSync(join(FC, "modelova.json")) ? cist(join(FC, "modelova.json")) : null;
const neprijate = cestaNavrhu && existsSync(cestaNavrhu) ? cist(cestaNavrhu).neprijate || {} : {};
// FAKTCHECK_KALIBRACE (0/1) přebije nastavení — měření řetězu měří ustálený stav bez kalibrace.
const kalibrace = (process.env.FAKTCHECK_KALIBRACE !== undefined ? Number(process.env.FAKTCHECK_KALIBRACE) : readSettings().faktcheck_kalibrace) === 1;
const dnes = String(data.lastUpdated || new Date().toISOString()).slice(0, 10);

if (!D) console.log("POZOR: chybí výstup vrstvy D (deterministicky.json) — rozhoduje se jen podle vrstvy M");
if (!M) console.log("POZOR: chybí výstup vrstvy M (modelova.json) — nic se nepustí jako ověřené");

const { evals, body, souhrn } = rozhodniBeh({ pred, po: data.evals || {}, nalezy: (D && D.nalezy) || [], modelova: M, neprijate, kalibrace });
const nezverejnene = jenNezverejnene(body);

/* --- výpis ---------------------------------------------------------------- */
const CS = { fulfilled: "splněno", partial: "částečně", in_progress: "probíhá", declared: "deklarováno", not_started: "nezahájeno", broken: "porušeno", unverifiable: "neměřitelné" };
console.log(`Rozhodnutí (vrstva R), běh ${dnes}${kalibrace ? ", KALIBRACE: každý přechod schvaluje vlastník" : ""}`);
console.log(`  zveřejněno ${souhrn.zverejneno}/${souhrn.bodu}; podrženo ${souhrn.podrzeno.length}; bez razítka „prověřeno“ ${souhrn.bez_razitka.length}; k rozhodnutí vlastníka ${souhrn.k_rozhodnuti.length}`);
const kVypisu = nezverejnene.concat(Object.values(body).filter((x) => x.akce === "zverejnit" && x.vlastnik));
// Body, které jen nestihla vrstva M, se vypíšou jedním řádkem — jejich výčet by zakryl nálezy.
const jenNezkontrolovane = kVypisu.filter((b) => b.problemy.join() === "m-nezkontrolovano");
const navrhText = (n) => (!n ? "" : n.zdroj === "kontrola" ? `kontrola navrhuje ${CS[n.stav] || n.stav} (${n.pravidlo || "?"})` : `hodnotitel navrhuje ${CS[stavZaznamu(n.zaznam)] || "?"}`);
for (const b of kVypisu.filter((x) => !jenNezkontrolovane.includes(x))) {
  const p = b.prechod ? ` ${CS[b.prechod.z]}→${CS[b.prechod.na]}` : "";
  const navrhy = b.vlastnik ? [navrhText(b.vlastnik.navrh), navrhText(b.vlastnik.kontrola)].filter(Boolean) : [];
  console.log(`  ${b.akce.padEnd(11)} ${b.bod.padEnd(5)}${p} — ${b.problemy.join(", ")}${b.vlastnik ? ` → vlastník (${b.vlastnik.typ})` : ""}${navrhy.length ? ` | ${navrhy.join("; ")}` : ""}`);
}
if (jenNezkontrolovane.length) console.log(`  nezkontrolováno vrstvou M (${jenNezkontrolovane.length}, bez razítka nebo podrženo): ${jenNezkontrolovane.map((b) => b.bod).join(", ")}`);

const rozhodnuti = { vytvoreno: new Date().toISOString(), beh: dnes, kalibrace, souhrn, body, neprijate };
writeFileSync(join(FC, "rozhodnuti.json"), JSON.stringify(rozhodnuti, null, 2));
if (ZKOUSKA) { console.log("--zkouska: public/ beze změny"); process.exit(0); }

/* --- zápis ---------------------------------------------------------------- */
writeFileSync(PUB("evaluations.json"), JSON.stringify({ ...data, evals }, null, 2));

// Dnešní snímek historie: stav, který je opravdu na webu (podržený bod má ten minulý).
const hist = existsSync(PUB("history.json")) ? cist(PUB("history.json")) : null;
const snimek = hist ? upravSnimek(hist.snapshots || [], dnes, evals, body) : false;
if (snimek) writeFileSync(PUB("history.json"), JSON.stringify(hist, null, 2));

/* Audit: dnešní řádek bodu, jehož záznam na web nešel, to řekne. Je to řádek
   tohoto běhu, ještě nezveřejněný — starší řádky se nemění (append-only
   hlídá test-konzistence [G] proti HEAD). Návrh tak zůstane dohledatelný
   i s důvodem, proč neprošel. */
const audit = existsSync(PUB("audit.json")) ? cist(PUB("audit.json")) : null;
const oznaceno = audit ? oznacAudit(audit.entries || [], dnes, body) : 0;
if (audit) writeFileSync(PUB("audit.json"), JSON.stringify(audit, null, 2));

/* Veřejný souhrn: jen kódy a počty — návrhy a citace jsou v reportu pro vlastníka. */
const verejne = {
  datum: dnes,
  model: M ? M.model : null,
  kalibrace,
  vrstva_d: D ? { chyb: D.souhrn.CHYBA, varovani: D.souhrn.VAROVANI, rejstrik: D.rejstrik && D.rejstrik.chyba ? `nenačten: ${D.rejstrik.chyba}` : "ok" } : null,
  vrstva_m: M ? { bodu: M.souhrn.bodu, cistych: M.souhrn.ciste, zahozeno_citaci: M.souhrn.citaci_zahozeno } : null,
  zverejneno: souhrn.zverejneno,
  body: Object.fromEntries(nezverejnene.map((b) => [b.bod, { akce: b.akce, duvody: b.problemy }])),
};
writeFileSync(PUB("faktcheck.json"), JSON.stringify(verejne, null, 2));
console.log(`Zapsáno: evaluations.json, ${snimek ? "dnešní snímek historie, " : ""}${oznaceno} řádků auditu označeno, faktcheck.json; podklady pro report: ${join(FC, "rozhodnuti.json")}`);
