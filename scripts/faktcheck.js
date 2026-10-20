/* scripts/faktcheck.js — kontrola faktů zveřejňovaných dat (spec 004).
 *
 *     node scripts/faktcheck.js                 # vrstva D: pravidla + e-Sbírka + odkazy
 *     node scripts/faktcheck.js --bez-site      # jen pravidla bez sítě (bez rejstříku a odkazů)
 *     node scripts/faktcheck.js --vystup adresar
 *
 * Vrstva D (deterministická, zdarma) kontroluje to, co program ví přesně:
 *   D1 data dokladů, D2 předpisy proti e-Sbírce (tytéž funkce jako evaluate.js),
 *   D3 shoda české a anglické verze, D4 živost a obsah zdrojových odkazů,
 *   D6 komentář tvrdí jiný stav než status, a k tomu výsledek
 *   scripts/dev/test-konzistence.js (shoda dat se sebou a s pěti místy metriky).
 * Texty zdrojů, které se podařilo stáhnout, ukládá pro modelovou vrstvu (M),
 * aby model nemusel vyhledávat to, co kód už má.
 *
 * Výstup: <vystup>/deterministicky.json a souhrn na stdout. Exit 0 vždy —
 * o zveřejnění rozhoduje až vrstva R, ne tenhle skript.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DATES } from "../src/data.js";
import { readList } from "./lib/nastaveni.js";
import { nactiRejstrik } from "./lib/sbirka.js";
import { kontrolaBodu, citovaneRoky, citovanePredpisy } from "./lib/faktcheck/deterministicky.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (j, v) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : v; };
const BEZ_SITE = process.argv.includes("--bez-site");
const VYSTUP = join(KOREN, arg("vystup", "faktcheck-vystup"));
const SOUBEZNE = 6;
const UA = "Mozilla/5.0 (compatible; VladomerFaktcheck/1.0; +https://vladomer.cz)";

const data = JSON.parse(readFileSync(join(KOREN, "public", "evaluations.json"), "utf8"));
const evals = data.evals || {};
const dnes = String(data.lastUpdated || new Date().toISOString()).slice(0, 10);
const nastup = String(DATES.tookOffice).slice(0, 10);
mkdirSync(join(VYSTUP, "zdroje"), { recursive: true });

/* --- rejstřík Sbírky ------------------------------------------------------ */
let rejstrik = null;
const infoRejstriku = { roky: [], predpisu: 0, chyba: BEZ_SITE ? "vypnuto (--bez-site)" : null };
if (!BEZ_SITE) {
  const roky = new Set(citovaneRoky(evals));
  for (let r = Number(nastup.slice(0, 4)); r <= Number(dnes.slice(0, 4)); r++) roky.add(r);
  infoRejstriku.roky = [...roky].sort();
  const n = await nactiRejstrik({ roky: infoRejstriku.roky });
  if (n.predpisy) { rejstrik = n.predpisy; infoRejstriku.predpisu = n.predpisy.size; }
  else infoRejstriku.chyba = n.chyba;
}

/* --- D1–D3, D6 ------------------------------------------------------------ */
const audit = existsSync(join(KOREN, "public", "audit.json")) ? JSON.parse(readFileSync(join(KOREN, "public", "audit.json"), "utf8")).entries || [] : [];
const auditPodleBodu = {};
for (const r of audit) (auditPodleBodu[r.id] = auditPodleBodu[r.id] || []).push(r);
const nemeritelne = new Set(readList("nemeritelne.txt").map((r) => r.split(/\s+/)[0]));
const nalezy = [];
const predpisyBodu = {};
for (const [id, e] of Object.entries(evals)) {
  nalezy.push(...kontrolaBodu(id, e, { dnes, nastup, rejstrik, auditBodu: auditPodleBodu[id] || [], nemeritelne }));
  const c = citovanePredpisy(e, rejstrik);
  if (c.length) predpisyBodu[id] = c;
}

/* --- D4 zdroje ------------------------------------------------------------ */
const WHITELIST = readList("weby-hodnoceni.txt").map((d) => d.replace(/^www\./, ""));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").replace(/^m\./, ""); } catch { return ""; } };
const naWhitelistu = (u) => WHITELIST.some((d) => hostOf(u) === d || hostOf(u).endsWith(`.${d}`));
const ENTITY = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
function textZHtml(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, x) => (x[0] === "#" ? String.fromCodePoint(x[1] === "x" ? parseInt(x.slice(2), 16) : Number(x.slice(1))) : ENTITY[x.toLowerCase()] ?? m))
    .replace(/\s+/g, " ")
    .trim();
}
const zdrojeBodu = new Map(); // url → [id]
for (const [id, e] of Object.entries(evals)) {
  for (const s of e.sources || []) {
    if (!zdrojeBodu.has(s.url)) zdrojeBodu.set(s.url, []);
    zdrojeBodu.get(s.url).push(id);
  }
}
const stavZdroju = {};
async function overZdroj(url) {
  const zaznam = { url, soubor: `${createHash("sha1").update(url).digest("hex")}.txt` };
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5" }, signal: AbortSignal.timeout(20000) });
    zaznam.status = res.status;
    zaznam.cil = res.url;
    const puvodniCesta = new URL(url).pathname;
    const cilovaCesta = new URL(res.url).pathname;
    zaznam.titulka = puvodniCesta.length > 1 && cilovaCesta.length <= 1;
    const typ = res.headers.get("content-type") || "";
    if (res.ok && /html|text/.test(typ)) {
      const text = textZHtml(await res.text()).slice(0, 60000);
      zaznam.znaku = text.length;
      writeFileSync(join(VYSTUP, "zdroje", zaznam.soubor), `${url}\n\n${text}`);
    } else if (res.ok) {
      zaznam.typ = typ; // PDF a jiné — text se zatím neextrahuje, model dostane jen odkaz
    }
  } catch (e) {
    zaznam.chyba = String(e && (e.cause?.code || e.name || e.message) || e).slice(0, 80);
  }
  return zaznam;
}
if (!BEZ_SITE) {
  const urls = [...zdrojeBodu.keys()];
  let i = 0;
  await Promise.all(Array.from({ length: SOUBEZNE }, async () => {
    while (i < urls.length) { const u = urls[i++]; stavZdroju[u] = await overZdroj(u); }
  }));
  for (const [url, z] of Object.entries(stavZdroju)) {
    for (const id of zdrojeBodu.get(url)) {
      if (!naWhitelistu(url)) nalezy.push({ bod: id, pravidlo: "zdroj-mimo-whitelist", zavaznost: "CHYBA", nesestav: false, text: `zdroj ${url} není na weby-hodnoceni.txt` });
      if (z.status === 404 || z.status === 410) nalezy.push({ bod: id, pravidlo: "mrtvy-odkaz", zavaznost: "VAROVANI", nesestav: false, text: `zdroj vrací ${z.status}: ${url}` });
      else if (z.titulka) nalezy.push({ bod: id, pravidlo: "odkaz-na-titulku", zavaznost: "VAROVANI", nesestav: false, text: `zdroj přesměrovává na titulní stránku: ${url} → ${z.cil}` });
    }
  }
  // Bod se „splněno“/„porušeno“, u kterého ani jeden zdroj nejde přečíst: model ho nemá z čeho ověřit.
  for (const [id, e] of Object.entries(evals)) {
    if (!["fulfilled", "broken"].includes(e.status) || !(e.sources || []).length) continue;
    const citelne = e.sources.filter((s) => stavZdroju[s.url] && stavZdroju[s.url].znaku > 200);
    if (!citelne.length) nalezy.push({ bod: id, pravidlo: "zadny-citelny-zdroj", zavaznost: "VAROVANI", nesestav: true, text: `žádný ze zdrojů „${e.status}“ nejde přečíst — ověření půjde přes vyhledávání` });
  }
}

/* --- test-konzistence (shoda dat se sebou a s pěti místy metriky) ----------- */
const k = spawnSync(process.execPath, [join("scripts", "dev", "test-konzistence.js")], { cwd: KOREN, encoding: "utf8", maxBuffer: 1 << 26 });
for (const radek of `${k.stdout}`.split(/\r?\n/)) {
  const m = radek.match(/^\s*(CHYBA|VAROVÁNÍ)\s+(.*)$/);
  if (m) nalezy.push({ bod: (m[2].match(/^\[?\w\]?\s*(\d{1,2}\.\d{1,2})\b/) || [])[1] || "web", pravidlo: "konzistence", zavaznost: m[1] === "CHYBA" ? "CHYBA" : "VAROVANI", nesestav: false, text: m[2].trim() });
}

/* --- výstup --------------------------------------------------------------- */
const souhrn = { CHYBA: 0, VAROVANI: 0 };
const podlePravidla = {};
for (const n of nalezy) { souhrn[n.zavaznost]++; podlePravidla[n.pravidlo] = (podlePravidla[n.pravidlo] || 0) + 1; }
const zdroje = Object.values(stavZdroju);
const vysledek = {
  vytvoreno: new Date().toISOString(),
  dnes, nastup,
  rejstrik: infoRejstriku,
  zdroje: BEZ_SITE ? null : {
    celkem: zdroje.length,
    citelne: zdroje.filter((z) => z.znaku > 200).length,
    mrtve: zdroje.filter((z) => z.status === 404 || z.status === 410).length,
    neoveritelne: zdroje.filter((z) => z.chyba || [401, 403, 429].includes(z.status) || z.status >= 500).length,
    seznam: zdroje,
  },
  souhrn, podle_pravidla: podlePravidla,
  citovane_predpisy: predpisyBodu,
  nalezy: nalezy.sort((a, b) => (a.zavaznost === b.zavaznost ? a.bod.localeCompare(b.bod, "cs", { numeric: true }) : a.zavaznost === "CHYBA" ? -1 : 1)),
};
writeFileSync(join(VYSTUP, "deterministicky.json"), JSON.stringify(vysledek, null, 2));

console.log(`Kontrola faktů — vrstva D (deterministická), data k ${dnes}`);
console.log(`Rejstřík Sbírky: ${rejstrik ? `${infoRejstriku.predpisu} předpisů z let ${infoRejstriku.roky.join(", ")}` : `nenačten (${infoRejstriku.chyba})`}`);
if (vysledek.zdroje) console.log(`Zdroje: ${vysledek.zdroje.celkem} odkazů, ${vysledek.zdroje.citelne} přečteno, ${vysledek.zdroje.mrtve} mrtvých, ${vysledek.zdroje.neoveritelne} neověřitelných odtud`);
console.log(`Nálezy: ${souhrn.CHYBA} CHYBA, ${souhrn.VAROVANI} VAROVÁNÍ — ${Object.entries(podlePravidla).map(([p, n]) => `${p} ${n}`).join(", ") || "žádné"}`);
for (const n of vysledek.nalezy.filter((x) => x.zavaznost === "CHYBA")) console.log(`  CHYBA    ${n.bod.padEnd(5)} ${n.pravidlo}: ${n.text}`);
console.log(`Úplný výpis: ${join(VYSTUP, "deterministicky.json")}`);
