/* scripts/kontrola-webu.js — sestavený web proti datům (spec 004, vrstva D5).
 *
 *     npm run build && node scripts/kontrola-webu.js [dist]
 *
 * Spustí sestavený web na místním serveru, nechá headless Chrome vykreslit
 * hlavní stránku (jednostránková aplikace — data dotahuje JavaScript) a
 * porovná, co návštěvník opravdu vidí, s public/evaluations.json:
 *   - hlavní ukazatel: procento splněných, „N z 143 hodnoceno“, datum
 *     poslední a příští aktualizace,
 *   - /prehled/ a /overview/: stav a neměřitelnost každého ze 143 bodů,
 *     a u bodů z public/faktcheck.json věta, že čekají na ověření,
 *   - JSON-LD v index.html: procento splněných.
 *
 * test-konzistence.js hlídá totéž v datech a v kódu; tohle hlídá výsledek
 * buildu — chybu ve vykreslení, starý soubor v dist/, rozbitý fetch. Výpočet
 * je napsaný znovu, ne importovaný z webu: jinak by web porovnával sám se sebou.
 *
 * Exit 1 při rozporu — měsíční běh pak nic nezveřejní (mesicni-beh.yml).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_ITEMS, TOTAL_ITEMS } from "../src/data.js";
import { stavyPrehledu } from "./lib/prehled.js";
import { chrome } from "./lib/instagram.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(KOREN, process.argv[2] || "dist");
const data = JSON.parse(readFileSync(join(KOREN, "public", "evaluations.json"), "utf8"));
const evals = data.evals || {};
const fc = existsSync(join(KOREN, "public", "faktcheck.json")) ? JSON.parse(readFileSync(join(KOREN, "public", "faktcheck.json"), "utf8")) : { body: {} };
const nalezy = [];
const chyba = (t) => nalezy.push(t);

/* --- reference (stejné pravidlo jako pět míst v CLAUDE.md, napsané znovu) --- */
const HODNOCENE = new Set(["fulfilled", "partial", "in_progress", "declared", "not_started", "broken", "stalled"]);
let splneno = 0, hodnoceno = 0;
for (const it of ALL_ITEMS) {
  const e = evals[it.id];
  if (!e || !HODNOCENE.has(e.status) || e.unverifiable) continue;
  hodnoceno++;
  if (e.status === "fulfilled") splneno++;
}
const pct = hodnoceno ? (splneno / hodnoceno) * 100 : 0;
const pct1 = (v) => (v >= 10 || v === 0 ? Math.round(v) : Math.round(v * 10) / 10);
const datumCs = (d) => new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
const lu = new Date(data.lastUpdated);
const dalsi = new Date(Date.UTC(lu.getUTCFullYear(), lu.getUTCMonth() + 1, 1, 5, 15));

/* --- místní server nad dist/ ---------------------------------------------------- */
const TYP = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml" };
const server = createServer((req, res) => {
  let cesta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (cesta.endsWith("/")) cesta += "index.html";
  const soubor = join(DIST, cesta);
  if (!soubor.startsWith(DIST) || !existsSync(soubor) || !statSync(soubor).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYP[extname(soubor)] || "application/octet-stream" });
  res.end(readFileSync(soubor));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ADRESA = `http://127.0.0.1:${server.address().port}`;

/* Chrome se spouští asynchronně: synchronní volání by zablokovalo smyčku
   událostí a server by stránce nikdy neodpověděl. */
function vykresli(url) {
  return new Promise((ok, ne) => {
    const p = spawn(chrome(), ["--headless", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=15000", "--dump-dom", url], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("error", ne);
    p.on("close", () => ok(out));
    setTimeout(() => { p.kill(); ne(new Error("Chrome nevykreslil stránku do 90 s")); }, 90000);
  });
}
const text = (html) => String(html).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");

try {
  /* --- hlavní stránka (SPA) ------------------------------------------------------- */
  const dom = text(await vykresli(`${ADRESA}/`));
  if (!dom.includes("hodnoceno")) chyba("hlavní stránka se nevykreslila (chybí „hodnoceno“) — nenačetla se data?");
  else {
    if (!new RegExp(`${String(pct1(pct)).replace(".", "\\.")}\\s?%`).test(dom)) chyba(`hlavní ukazatel: web neukazuje ${pct1(pct)} % splněno (data: ${splneno}/${hodnoceno})`);
    if (!dom.includes(`${hodnoceno} z ${TOTAL_ITEMS} hodnoceno`)) chyba(`hlavní ukazatel: chybí „${hodnoceno} z ${TOTAL_ITEMS} hodnoceno“`);
    if (!dom.includes(datumCs(lu))) chyba(`datum poslední aktualizace ${datumCs(lu)} na stránce není`);
    if (!dom.includes(datumCs(dalsi))) chyba(`datum příští aktualizace ${datumCs(dalsi)} na stránce není`);
  }

  /* --- /prehled/ a /overview/ ------------------------------------------------------ */
  for (const [lang, cesta] of [["cs", "prehled"], ["en", "overview"]]) {
    const html = readFileSync(join(DIST, cesta, "index.html"), "utf8");
    const stavy = stavyPrehledu(lang);
    const bloky = html.split('<li class="item">').slice(1);
    if (bloky.length !== ALL_ITEMS.length) chyba(`/${cesta}/: ${bloky.length} bodů místo ${ALL_ITEMS.length}`);
    let spatne = 0;
    for (const b of bloky) {
      const id = (b.match(/<span class="id">#([\d.]+)<\/span>/) || [])[1];
      const stav = text((b.match(/<span class="badge"[^>]*>([^<]*)<\/span>/) || [])[1] || "").trim();
      const e = evals[id];
      const cekany = e && stavy[e.status] ? stavy[e.status] : stavy.nehodnoceno;
      const nemer = b.includes(`(${stavy.nemeritelne})`);
      const zadrzeny = /<p class="dg">[^<]*(čeká na ověření|awaits review)/.test(b);
      if (stav !== cekany || nemer !== Boolean(e && e.unverifiable) || zadrzeny !== Boolean(fc.body && fc.body[id])) {
        if (++spatne <= 5) chyba(`/${cesta}/ bod ${id}: web „${stav}“${nemer ? " (neměřitelné)" : ""}${zadrzeny ? " (čeká)" : ""}, data „${cekany}“${e && e.unverifiable ? " (neměřitelné)" : ""}${fc.body && fc.body[id] ? " (čeká)" : ""}`);
      }
    }
    if (spatne > 5) chyba(`/${cesta}/: a dalších ${spatne - 5} bodů nesedí`);
  }

  /* --- JSON-LD ----------------------------------------------------------------------- */
  const index = readFileSync(join(DIST, "index.html"), "utf8");
  const ld = (index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  if (!ld) chyba("index.html nemá JSON-LD");
  else {
    const dataset = JSON.parse(ld)["@graph"].find((u) => u["@type"] === "Dataset");
    const v = dataset && dataset.variableMeasured.find((x) => x.unitText === "%");
    if (!v || Math.abs(Number(v.value) - pct) > 0.06) chyba(`JSON-LD uvádí ${v ? v.value : "—"} % splněno, data ${pct.toFixed(2)} %`);
  }
} finally {
  server.close();
}

console.log(`Vykreslený web proti datům k ${String(data.lastUpdated).slice(0, 10)}: ${pct1(pct)} % splněno (${splneno}/${hodnoceno}), ${Object.keys(fc.body || {}).length} bodů čeká na ověření`);
for (const n of nalezy) console.log(`  CHYBA ${n}`);
console.log(nalezy.length ? `${nalezy.length} rozporů — web neříká totéž co data.` : "Web říká totéž co data.");
process.exit(nalezy.length ? 1 : 0);
