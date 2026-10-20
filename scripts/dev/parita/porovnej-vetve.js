/* scripts/dev/parita/porovnej-vetve.js — parita DEV2 ↔ main (spec 001).
 *
 *     node scripts/dev/parita/porovnej-vetve.js                 # proti origin/main
 *     node scripts/dev/parita/porovnej-vetve.js --zaklad main   # proti lokální main
 *     node scripts/dev/parita/porovnej-vetve.js --nechat        # nechá dočasné kopie k prohlédnutí
 *     node scripts/dev/parita/porovnej-vetve.js --kazeta scripts/dev/fixtury/kazeta-….json
 *
 * Odpovídá na jedinou otázku: posílá DEV2 při STEJNÝCH vstupech modelu stejné
 * texty a dojde nad stejnými odpověďmi ke stejným datům jako main? Nic nestojí:
 * žádné API, žádný živý web (loader zmrazit.js), pracovní adresář se nemění —
 * všechno běží v dočasných kopiích.
 *
 * Strany:
 *   základ  = zadaná revize (výchozí origin/main), `git archive`
 *   DEV2    = pracovní strom VČETNĚ necommitnutých změn
 *   testy   = kopie DEV2, do které se přenesou testy a fixtury ze základu:
 *             testy z main musí projít na kódu DEV2
 * Obě strany dostanou data public/*.json ze základu a (výchozí) i jeho
 * nastaveni.txt — rozdíl v nastavení je rozhodnutí, ne kód, a parita měří kód.
 * Loader i simulátor jsou pro obě strany tytéž soubory z DEV2.
 *
 * Porovnává se:
 *   - bajty chráněných souborů (prompty, whitelisty, hlídací knihovny),
 *   - úplné tělo každého požadavku na model, v pořadí,
 *   - evaluations / history / audit / news.json po běhu,
 *   - výstup přehrání korpusu (prehraj-zabrany, prehraj-stary-doklad),
 *   - testy základu na kódu DEV2.
 * Log běhu se porovná jen pro informaci: nový řádek (třeba s cenou) není
 * změna procesu. Záměrné rozdíly patří do vyjimky.json se zdůvodněním.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { kanonicky } from "./kanonicky.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (jmeno, vychozi) => {
  const i = process.argv.indexOf(`--${jmeno}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : vychozi;
};
const prepinac = (jmeno) => process.argv.includes(`--${jmeno}`);

const ZAKLAD = arg("zaklad", "origin/main");
const NASTAVENI = arg("nastaveni", "zaklad");           // zaklad | vlastni
const SCENARE = arg("scenare", "plny,delta,prazdne").split(",").filter(Boolean);
const KAZETA = arg("kazeta", null);
const NECHAT = prepinac("nechat");
const DNES = "2026-10-20T06:00:00.000Z";
const OD_DATA = "2026-10-09";

const VYJIMKY = JSON.parse(readFileSync(join(KOREN, "scripts", "dev", "parita", "vyjimky.json"), "utf8"));
const DATA = ["evaluations.json", "history.json", "audit.json", "news.json"];
const CESTY = ["package.json", "scripts", "src", "public"];

let chyb = 0, varovani = 0;
const chyba = (t) => { chyb++; console.log(`CHYBA   ${t}`); };
const varuj = (t) => { varovani++; console.log(`VAROVÁNÍ ${t}`); };
const ok = (t) => console.log(`ok      ${t}`);
const lf = (s) => s.replace(/\r\n/g, "\n");

function spust(prikaz, args, opt = {}) {
  const r = spawnSync(prikaz, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opt });
  if (r.error) throw r.error;
  return r;
}

/* --- strany ------------------------------------------------------------- */
const TMP = mkdtempSync(join(tmpdir(), "vladomer-parita-"));
const STROM = { zaklad: join(TMP, "zaklad"), dev2: join(TMP, "dev2"), testy: join(TMP, "testy") };

function stromZRevize(ref, cil) {
  mkdirSync(cil, { recursive: true });
  /* core.autocrlf=false: základ s LF, stejně jako v repozitáři — jinak by se
     ohlášené patche (LF) na Windows nedaly aplikovat. */
  const archiv = spawnSync("git", ["-c", "core.autocrlf=false", "archive", "--format=tar", ref, ...CESTY], { cwd: KOREN, maxBuffer: 1 << 30 });
  if (archiv.status !== 0) throw new Error(`git archive ${ref} selhal: ${String(archiv.stderr).trim()} — v CI potřebuje checkout fetch-depth: 0`);
  /* Rozbaluje se s cwd = cíl a bez cesty v argumentech: GNU tar z Git Bashe
     čte „C:\…“ jako vzdálený stroj (dvojtečka), bsdtar z Windows ne. */
  const tar = spawnSync("tar", ["-x", "-f", "-"], { input: archiv.stdout, cwd: cil });
  if (tar.status !== 0) throw new Error(`tar selhal: ${String(tar.stderr).trim()}`);
}

function stromZPracovniKopie(cil) {
  const seznam = spust("git", ["ls-files", "-z", "-co", "--exclude-standard", "--", ...CESTY], { cwd: KOREN }).stdout
    .split("\0").filter(Boolean);
  for (const rel of seznam) {
    const z = join(KOREN, rel);
    if (!existsSync(z) || !statSync(z).isFile()) continue; // smazaný, ale ještě sledovaný soubor
    mkdirSync(dirname(join(cil, rel)), { recursive: true });
    copyFileSync(z, join(cil, rel));
  }
}

function kopirujStrom(z, cil) {
  for (const jmeno of readdirSync(z)) {
    const a = join(z, jmeno), b = join(cil, jmeno);
    if (statSync(a).isDirectory()) { mkdirSync(b, { recursive: true }); kopirujStrom(a, b); }
    else copyFileSync(a, b);
  }
}

console.log(`Parita: základ ${ZAKLAD} ↔ DEV2 (pracovní strom), nastavení ${NASTAVENI === "zaklad" ? "ze základu" : "vlastní"}`);
console.log(`dočasné kopie: ${TMP}${NECHAT ? " (ponechají se)" : ""}\n`);

try {
  stromZRevize(ZAKLAD, STROM.zaklad);
  /* Ohlášené změny: main se během refaktoru nemění, takže záměrná odchylka
     DEV2 v chráněném souboru nebo v rozhodování programu se zapisuje jako
     patch se zdůvodněním. Aplikuje se na základ PŘED vším ostatním — parita
     pak dokazuje DEV2 = main + ohlášené patche, nic víc. */
  for (const z of VYJIMKY.zmeny || []) {
    const cesta = join(KOREN, "scripts", "dev", "parita", z.patch);
    const r = spawnSync("git", ["apply", "--whitespace=nowarn", cesta], { cwd: STROM.zaklad, encoding: "utf8" });
    if (r.status !== 0) {
      chyba(`ohlášenou změnu ${z.patch} nejde aplikovat na ${ZAKLAD} (main se posunul?): ${String(r.stderr).trim().split(/\r?\n/)[0]}`);
    } else {
      console.log(`ohlášeno  změna ${z.patch} — ${z.duvod}`);
    }
  }
  stromZPracovniKopie(STROM.dev2);
  // Vstupy: data (a nastavení) ze základu pro všechny strany.
  const vstupy = Object.fromEntries(DATA.map((n) => [n, readFileSync(join(STROM.zaklad, "public", n))]));
  const nastaveniZakladu = readFileSync(join(STROM.zaklad, "scripts", "nastaveni", "nastaveni.txt"));
  const pripravVstupy = (strom) => {
    for (const n of DATA) writeFileSync(join(strom, "public", n), vstupy[n]);
    if (NASTAVENI === "zaklad") writeFileSync(join(strom, "scripts", "nastaveni", "nastaveni.txt"), nastaveniZakladu);
    rmSync(join(strom, "necitelne-odpovedi"), { recursive: true, force: true });
  };
  pripravVstupy(STROM.dev2);
  mkdirSync(STROM.testy, { recursive: true });
  kopirujStrom(STROM.dev2, STROM.testy);
  // Testy a fixtury ze základu do kopie DEV2.
  for (const jmeno of readdirSync(join(STROM.zaklad, "scripts", "dev"))) {
    if (/^test-.*\.js$/.test(jmeno)) copyFileSync(join(STROM.zaklad, "scripts", "dev", jmeno), join(STROM.testy, "scripts", "dev", jmeno));
  }
  rmSync(join(STROM.testy, "scripts", "dev", "fixtury"), { recursive: true, force: true });
  mkdirSync(join(STROM.testy, "scripts", "dev", "fixtury"), { recursive: true });
  kopirujStrom(join(STROM.zaklad, "scripts", "dev", "fixtury"), join(STROM.testy, "scripts", "dev", "fixtury"));

  /* --- 1. chráněné soubory --------------------------------------------- */
  console.log("1) Chráněné soubory (co model čte a podle čeho program rozhoduje)");
  const vyjimkySouboru = new Map((VYJIMKY.soubory || []).map((v) => [v.cesta, v.duvod]));
  const chranene = new Set([
    "scripts/lib/dukaz.js", "scripts/lib/prechody.js", "scripts/lib/sbirka.js", "scripts/lib/korektura.js",
    "scripts/lib/odpoved.js", "scripts/lib/delta.js", "scripts/lib/prompty.js", "scripts/lib/nastaveni.js",
    "src/data.js", "src/zmeny.js",
  ]);
  for (const strom of [STROM.zaklad, STROM.dev2]) {
    for (const n of readdirSync(join(strom, "scripts", "nastaveni"))) {
      if (/^prompt-.*\.md$|^weby-.*\.txt$/.test(n)) chranene.add(`scripts/nastaveni/${n}`);
    }
  }
  let shodnych = 0;
  for (const rel of [...chranene].sort()) {
    const a = join(STROM.zaklad, rel), b = join(STROM.dev2, rel);
    const ta = existsSync(a) ? lf(readFileSync(a, "utf8")) : null;
    const tb = existsSync(b) ? lf(readFileSync(b, "utf8")) : null;
    if (ta === tb) { shodnych++; continue; }
    const popis = ta === null ? "jen v DEV2" : tb === null ? "chybí v DEV2" : "liší se";
    if (vyjimkySouboru.has(rel)) console.log(`ohlášeno  ${rel} ${popis} — ${vyjimkySouboru.get(rel)}`);
    else chyba(`${rel} ${popis} (není ve vyjimky.json)`);
  }
  ok(`${shodnych} chráněných souborů shodných`);

  /* --- 2. scénáře běhu ------------------------------------------------- */
  const zmrazit = pathToFileURL(join(STROM.dev2, "scripts", "dev", "parita", "zmrazit.js")).href;
  const scenare = SCENARE.map((s) => ({ jmeno: s }));
  if (KAZETA) scenare.push({ jmeno: "kazeta" });
  const polePozadavku = new Set((VYJIMKY.pole_pozadavku || []).map((v) => v.pole));
  const poleVystupu = (VYJIMKY.pole_vystupu || []);

  function behni(strom, sc) {
    pripravVstupy(strom);
    const pozadavky = join(TMP, `${strom === STROM.zaklad ? "zaklad" : "dev2"}-${sc.jmeno}.jsonl`);
    rmSync(pozadavky, { force: true });
    const env = { ...process.env };
    for (const k of ["CHAPTER_LIMIT", "REZIM_BEHU", "OD_DATA", "EVAL_MODEL", "KOREKTURA_MODEL", "OVEROVACI_MODEL", "BEZ_KOREKTURY", "BEZ_ZPRAV"]) delete env[k];
    Object.assign(env, {
      ANTHROPIC_API_KEY: "parita-bez-klice",
      PARITA_DNES: DNES,
      PARITA_POZADAVKY: pozadavky,
      PARITA_ODPOVEDI: { plny: "synteticke", delta: "synteticke", prazdne: "prazdne", kazeta: "kazeta" }[sc.jmeno] || "synteticke",
      REZIM_BEHU: sc.jmeno === "delta" ? "delta" : "plny",
      ...(sc.jmeno === "delta" ? { OD_DATA } : {}),
      ...(sc.jmeno === "kazeta" ? { PARITA_KAZETA: join(KOREN, KAZETA), REZIM_BEHU: arg("rezim-kazety", "plny") } : {}),
    });
    const r = spust(process.execPath, ["--import", zmrazit, join("scripts", "evaluate.js")], { cwd: strom, env, timeout: 600000 });
    const vystupy = Object.fromEntries(DATA.map((n) => [n, JSON.parse(readFileSync(join(strom, "public", n), "utf8"))]));
    const radky = existsSync(pozadavky) ? readFileSync(pozadavky, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { kod: r.status, log: lf(`${r.stdout}${r.stderr}`), pozadavky: radky, vystupy };
  }

  const bezPoli = (telo) => {
    const t = { ...telo };
    for (const p of polePozadavku) delete t[p];
    return t;
  };
  /* Odstraní ohlášená pole výstupu. Cesta: „soubor:a.b[].c“ ([] = každý prvek pole). */
  function bezVyjimekVystupu(soubor, data) {
    const kopie = JSON.parse(JSON.stringify(data));
    for (const v of poleVystupu) {
      const [s, cesta] = v.pole.split(":");
      if (s !== soubor) continue;
      const smaz = (uzel, kusy) => {
        if (!uzel || typeof uzel !== "object" || !kusy.length) return;
        const [k, ...dal] = kusy;
        if (k.endsWith("[]")) {
          const pole = uzel[k.slice(0, -2)];
          if (Array.isArray(pole)) for (const x of pole) dal.length ? smaz(x, dal) : null;
          else if (pole && typeof pole === "object") for (const x of Object.values(pole)) smaz(x, dal);
        } else if (!dal.length) delete uzel[k];
        else smaz(uzel[k], dal);
      };
      smaz(kopie, cesta.split("."));
    }
    return kopie;
  }
  /* První rozdílná cesta ve dvou JSON stromech. */
  function prvniRozdil(a, b, cesta = "") {
    if (kanonicky(a) === kanonicky(b)) return null;
    if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
      const klice = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of klice) {
        const r = prvniRozdil(a[k], b[k], `${cesta}${Array.isArray(a) ? `[${k}]` : `.${k}`}`);
        if (r) return r;
      }
    }
    return { cesta: cesta || "(kořen)", a, b };
  }
  const ukazka = (v) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s === undefined ? "(chybí)" : s.length > 160 ? `${s.slice(0, 160)}…` : s;
  };
  function ukazRozdilTextu(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return `\n          základ: ${ukazka(a)}\n          DEV2:   ${ukazka(b)}`;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const od = Math.max(0, i - 60);
    return `\n          od znaku ${i}:\n          základ: …${a.slice(od, i + 80).replace(/\n/g, "⏎")}\n          DEV2:   …${b.slice(od, i + 80).replace(/\n/g, "⏎")}`;
  }

  for (const sc of scenare) {
    console.log(`\n2) Scénář „${sc.jmeno}“`);
    const za = behni(STROM.zaklad, sc);
    const de = behni(STROM.dev2, sc);
    if (za.kod !== de.kod) chyba(`návratový kód evaluate.js: základ ${za.kod}, DEV2 ${de.kod}`);
    if (za.kod !== 0) varuj(`evaluate.js na základu skončil kódem ${za.kod} — konec logu: ${za.log.trim().split("\n").slice(-3).join(" | ")}`);

    // požadavky
    const n = Math.max(za.pozadavky.length, de.pozadavky.length);
    let shoda = true;
    for (let i = 0; i < n; i++) {
      const pa = za.pozadavky[i], pb = de.pozadavky[i];
      if (!pa || !pb) { chyba(`požadavek č. ${i + 1}: ${!pa ? "navíc v DEV2" : "chybí v DEV2"} (${(pa || pb).druh}); základ ${za.pozadavky.length}, DEV2 ${de.pozadavky.length}`); shoda = false; break; }
      if (pa.druh !== pb.druh) {
        chyba(`požadavek č. ${i + 1}: základ posílá ${pa.druh}, DEV2 ${pb.druh} — program se rozhodl jinak už dřív (přechod, brána, doptání)`);
        shoda = false; break;
      }
      const ta = bezPoli(pa.telo), tb = bezPoli(pb.telo);
      const r = prvniRozdil(ta, tb);
      if (r) { chyba(`požadavek č. ${i + 1} (${pa.druh}) se liší v ${r.cesta}:${ukazRozdilTextu(r.a, r.b)}`); shoda = false; break; }
    }
    if (shoda) {
      const druhy = {};
      for (const p of za.pozadavky) druhy[p.druh] = (druhy[p.druh] || 0) + 1;
      ok(`${za.pozadavky.length} požadavků na model shodných (${Object.entries(druhy).map(([k, v]) => `${v} ${k}`).join(", ")})`);
    }

    // data
    for (const nazev of DATA) {
      const a = bezVyjimekVystupu(nazev, za.vystupy[nazev]);
      const b = bezVyjimekVystupu(nazev, de.vystupy[nazev]);
      const r = prvniRozdil(a, b);
      if (r) chyba(`${nazev} se liší v ${r.cesta}:\n          základ: ${ukazka(r.a)}\n          DEV2:   ${ukazka(r.b)}`);
    }
    const ev = za.vystupy["evaluations.json"].evals || {};
    ok(`výstupní data porovnána (${Object.keys(ev).length} hodnocení, ${(za.vystupy["audit.json"].entries || []).length} auditních řádků)`);

    // log — jen informace
    if (za.log !== de.log) {
      const ra = za.log.split("\n"), rb = de.log.split("\n");
      let i = 0;
      while (i < ra.length && ra[i] === rb[i]) i++;
      varuj(`log běhu se liší od řádku ${i + 1} (nepočítá se jako chyba):\n          základ: ${ukazka(ra[i] || "")}\n          DEV2:   ${ukazka(rb[i] || "")}`);
    }
    // přehled cest, kterými běh prošel — jen pro kontrolu pokrytí
    const brana = (za.log.match(/^Brána přechodů:.*$/m) || [""])[0];
    if (brana) console.log(`        ${brana}`);
    if (process.env.PARITA_LOG) writeFileSync(join(TMP, `zaklad-${sc.jmeno}.log`), za.log);
  }

  /* --- 3. přehrání korpusu --------------------------------------------- */
  console.log("\n3) Přehrání korpusu audit.json (stejná data, kód obou stran)");
  for (const nastroj of ["prehraj-zabrany.js", "prehraj-stary-doklad.js"]) {
    for (const strom of [STROM.zaklad, STROM.dev2]) for (const n of DATA) writeFileSync(join(strom, "public", n), vstupy[n]);
    const a = spust(process.execPath, [join("scripts", "dev", nastroj)], { cwd: STROM.zaklad });
    const b = spust(process.execPath, [join("scripts", "dev", nastroj)], { cwd: STROM.dev2 });
    if (lf(a.stdout) === lf(b.stdout) && a.status === b.status) ok(`${nastroj}: shodný výstup (${lf(a.stdout).split("\n").length} řádků)`);
    else chyba(`${nastroj}: výstup se liší${ukazRozdilTextu(lf(a.stdout), lf(b.stdout))}`);
  }

  /* --- 4. testy základu na kódu DEV2 ----------------------------------- */
  console.log("\n4) Offline testy ze základu na kódu DEV2");
  for (const n of DATA) writeFileSync(join(STROM.testy, "public", n), vstupy[n]);
  for (const jmeno of readdirSync(join(STROM.zaklad, "scripts", "dev")).filter((j) => /^test-.*\.js$/.test(j)).sort()) {
    const r = spust(process.execPath, [join("scripts", "dev", jmeno)], { cwd: STROM.testy, timeout: 300000 });
    if (r.status === 0) ok(jmeno);
    else chyba(`${jmeno} ze základu na kódu DEV2 neprošel (kód ${r.status}): ${lf(`${r.stdout}${r.stderr}`).split("\n").filter((l) => /CHYBA|Error/.test(l)).slice(0, 3).join(" | ")}`);
  }
} catch (e) {
  chyba(`kontrola nedoběhla: ${e.message}`);
} finally {
  if (!NECHAT) rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${chyb ? `PARITA NESEDÍ: ${chyb} chyb` : "PARITA SEDÍ"}${varovani ? `, ${varovani} varování` : ""}`
  + `${chyb && !NECHAT ? " — podrobnosti: spusť znovu s --nechat" : ""}`);
process.exit(chyb ? 1 : 0);
