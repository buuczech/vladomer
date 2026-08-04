/* scripts/og-image.js — náhledový obrázek pro sdílení (public/og.png).
 *
 * Facebook, X, LinkedIn ani Slack neumí SVG, náhled musí být rastr. Fontový
 * rasterizér tu není, takže se stránka složí v HTML a vyfotí headless
 * Chromem — jediná cesta, jak dostat českou diakritiku do PNG bez knihoven.
 *
 * Čísla se berou z public/evaluations.json a MUSÍ vycházet stejně jako na
 * webu: stejná přísná metrika (splněno / hodnocené body), stejné vyřazení
 * neměřitelných bodů. Kdyby se rozešla, sdílený odkaz by tvrdil něco jiného
 * než stránka, na kterou vede.
 *
 * Proto se generuje při každém týdenním běhu, ne jednou natvrdo: číslo na
 * obrázku by bylo v sobotu nepravdivé.
 *
 * Spuštění:  node scripts/og-image.js
 * Selhání nikdy nesmí shodit nasazení — volá se s "|| true".
 */
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_ITEMS, TOTAL_ITEMS } from "../src/data.js";

const OUT = new URL("../public/og.png", import.meta.url);
const EVAL = new URL("../public/evaluations.json", import.meta.url);
const W = 1200, H = 630;

/* Stejná pravidla jako donePct v src/App.jsx: bod bez hodnocení se nepočítá
   vůbec a neměřitelné body jsou mimo jmenovatel, ne v něm. */
const SCORED = new Set(["fulfilled", "partial", "in_progress", "declared", "not_started", "broken"]);

function metriky() {
  const evals = JSON.parse(readFileSync(EVAL, "utf8"));
  const e = evals.evals || {};
  let done = 0, partial = 0, prog = 0, n = 0;
  for (const it of ALL_ITEMS) {
    const v = e[it.id];
    if (!v || !SCORED.has(v.status) || v.unverifiable) continue;
    n++;
    if (v.status === "fulfilled") done++;
    else if (v.status === "partial") partial++;
    else if (v.status === "in_progress") prog++;
  }
  const pct = (x) => (n ? (x / n) * 100 : 0);
  const jedno = (v) => (v >= 10 || v === 0 ? Math.round(v) : Math.round(v * 10) / 10);
  return {
    done: jedno(pct(done)), partial: jedno(pct(partial)), prog: jedno(pct(prog)),
    hodnoceno: n,
    datum: evals.lastUpdated
      ? new Date(evals.lastUpdated).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })
      : null,
  };
}

/* Kruhový ukazatel jako na webu: vnější prstenec splněno, pod ním částečně.
   Kreslí se jako SVG uvnitř stránky, Chrome ho vyrenderuje s ní. */
function prstenec(done, partial) {
  const r = 104, obvod = 2 * Math.PI * r;
  const usek = (p) => (Math.max(0, Math.min(100, p)) / 100) * obvod;
  return `
    <svg width="260" height="260" viewBox="0 0 260 260">
      <circle cx="130" cy="130" r="${r}" fill="none" stroke="#1E293B" stroke-width="22" />
      <circle cx="130" cy="130" r="${r}" fill="none" stroke="#F59E0B" stroke-width="22"
              stroke-dasharray="${usek(done + partial)} ${obvod}" stroke-linecap="round"
              transform="rotate(-90 130 130)" />
      <circle cx="130" cy="130" r="${r}" fill="none" stroke="#22C55E" stroke-width="22"
              stroke-dasharray="${usek(done)} ${obvod}" stroke-linecap="round"
              transform="rotate(-90 130 130)" />
    </svg>`;
}

function stranka(m) {
  const cislo = String(m.done).replace(".", ",");
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8" /><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;background:#0B0F19;color:#E8ECF4;overflow:hidden;
    font-family:"Segoe UI","DejaVu Sans","Liberation Sans",system-ui,sans-serif;
    display:flex;flex-direction:column;justify-content:space-between;padding:56px 64px}
  .top{display:flex;align-items:center;gap:18px}
  .mark{width:56px;height:56px;flex:0 0 auto}
  .name{font-size:40px;font-weight:800;letter-spacing:-.02em}
  .claim{font-size:21px;color:#94A3B8;margin-left:auto;text-align:right;line-height:1.35}
  .mid{display:flex;align-items:center;gap:64px}
  .big{font-size:132px;font-weight:850;line-height:.9;letter-spacing:-.04em;color:#22C55E}
  .biglab{font-size:27px;color:#94A3B8;margin-top:14px;letter-spacing:.01em}
  /* nowrap je tu podstatné: v CI kreslí Chrome jiným fontem (DejaVu) než na
     Windows a text vyjde širší — bez toho by se popisky zlomily na dva řádky
     a obrázek by se rozjel. Proto i rezerva ve velikosti písma. */
  .rows{display:flex;flex-direction:column;gap:22px;margin-left:auto}
  .row{display:flex;align-items:baseline;gap:13px;font-size:26px;white-space:nowrap}
  .v{font-weight:780;min-width:112px;text-align:right;font-variant-numeric:tabular-nums}
  .k{color:#94A3B8}
  .bot{display:flex;justify-content:space-between;align-items:flex-end;
    font-size:20px;color:#7C8AA3;border-top:1px solid #1E293B;padding-top:22px}
  .dom{color:#3B5BDB;font-weight:750}
</style></head><body>
  <div class="top">
    <svg class="mark" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0F172A"/>
      <path d="M 16 44 A 20 20 0 1 1 48 44" stroke="#38BDF8" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M 32 32 L 44 20" stroke="#F43F5E" stroke-width="5" stroke-linecap="round"/>
      <circle cx="32" cy="32" r="5" fill="#F43F5E"/></svg>
    <div class="name">Vládoměr</div>
    <div class="claim">Plnění programového prohlášení<br/>vlády Andreje Babiše</div>
  </div>
  <div class="mid">
    ${prstenec(m.done, m.partial)}
    <div>
      <div class="big">${cislo}&#8239;%</div>
      <div class="biglab">splněno</div>
    </div>
    <div class="rows">
      <div class="row"><span class="v" style="color:#F59E0B">${String(m.partial).replace(".", ",")}&#8239;%</span><span class="k">částečně splněno</span></div>
      <div class="row"><span class="v" style="color:#38BDF8">${String(m.prog).replace(".", ",")}&#8239;%</span><span class="k">probíhá</span></div>
      <div class="row"><span class="v">${m.hodnoceno} z ${TOTAL_ITEMS}</span><span class="k">bodů hodnoceno</span></div>
    </div>
  </div>
  <div class="bot">
    <div>${m.datum ? `Aktualizováno ${m.datum} · nové hodnocení každý pátek` : "Hodnocení probíhá každý pátek"}</div>
    <div class="dom">vladomer.cz</div>
  </div>
</body></html>`;
}

function chrome() {
  const kandidati = [
    process.env.CHROME_PATH,
    "google-chrome-stable", "google-chrome", "chromium-browser", "chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const c of kandidati) {
    if (c.includes("\\") && !existsSync(c)) continue;
    try {
      execFileSync(c, ["--version"], { stdio: "ignore", timeout: 20000 });
      return c;
    } catch { /* další */ }
  }
  throw new Error("Chrome ani Edge nenalezen — nastav CHROME_PATH");
}

const m = metriky();
if (m.hodnoceno === 0) {
  console.log("og-image: žádná hodnocení, obrázek se negeneruje");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "vm-og-"));
try {
  const html = join(dir, "og.html");
  writeFileSync(html, stranka(m), "utf8");
  const bin = chrome();
  execFileSync(bin, [
    "--headless", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
    "--force-device-scale-factor=1", `--window-size=${W},${H}`,
    `--screenshot=${new URL(OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1")}`,
    `file://${html.replace(/\\/g, "/")}`,
  ], { stdio: "ignore", timeout: 60000 });

  const raw = readFileSync(OUT);
  if (raw.length < 1000 || raw.subarray(0, 8).toString("binary") !== "\x89PNG\r\n\x1a\n") {
    throw new Error(`výsledek není PNG (${raw.length} b)`);
  }
  console.log(`og-image: public/og.png ${raw.length} b — ${m.done} % splněno, `
    + `${m.hodnoceno}/${TOTAL_ITEMS} hodnoceno (${bin.split(/[\\/]/).pop()})`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
