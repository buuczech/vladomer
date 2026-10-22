/* scripts/dev/parita/porovnej-vetve.js — parita DEV2 ↔ main (spec 001).
 *
 *     node scripts/dev/parita/porovnej-vetve.js                 # proti origin/main
 *     node scripts/dev/parita/porovnej-vetve.js --zaklad main   # proti lokální main
 *     node scripts/dev/parita/porovnej-vetve.js --nechat        # nechá dočasné kopie k prohlédnutí
 *     node scripts/dev/parita/porovnej-vetve.js --nastaveni vlastni   # DEV2 se svým nastavením (modely)
 *     node scripts/dev/parita/porovnej-vetve.js --kazeta scripts/dev/fixtury/kazeta-….json
 *
 * Odpovídá na jedinou otázku: posílá DEV2 při STEJNÝCH vstupech modelu stejné
 * texty a dojde nad stejnými odpověďmi ke stejným datům jako main? Nic nestojí:
 * žádné API, žádný živý web (loader zmrazit.js), pracovní adresář se nemění —
 * všechno běží v dočasných kopiích.
 *
 * Strany:
 *   základ  = zadaná revize (výchozí origin/main) + ohlášené změny (vyjimky.json)
 *   DEV2    = pracovní strom VČETNĚ necommitnutých změn
 *   testy   = kopie DEV2, do které se přenesou testy a fixtury ze základu:
 *             testy z main musí projít na kódu DEV2
 *
 * Ohlášené změny (vyjimky.json → zmeny). Main se během refaktoru nemění, takže
 * záměrná odchylka DEV2 se ohlašuje:
 *   { patch, duvod }                    změna chování: patch se aplikuje na
 *                                       základ, parita pak dokazuje DEV2 =
 *                                       main + patch
 *   { soubory, neutralni: true, duvod } změna BEZ vlivu na chování (refaktor,
 *                                       nová vrstva): soubory se zkopírují
 *                                       z DEV2 do základu A NAVÍC proběhne
 *                                       důkazní průchod proti základu bez nich
 *                                       — požadavky a data musí sedět i tak
 *
 * Nastavení: obě strany dostanou nastaveni.txt ze základu (výchozí) nebo z DEV2
 * (--nastaveni vlastni). Klíče, které strana nezná, se vynechají, a klíče, které
 * zná a v souboru chybí, se doplní hodnotou z DEV2 — nová nastavení DEV2 tak
 * nerozbijí běh se starým souborem a strana bez nich je nedostane.
 *
 * Porovnává se:
 *   - bajty chráněných souborů (prompty, whitelisty, hlídací knihovny),
 *   - úplné tělo každého požadavku na model, v pořadí,
 *   - evaluations / history / audit / news.json po běhu,
 *   - výstup přehrání korpusu (prehraj-zabrany, prehraj-stary-doklad),
 *   - testy základu na kódu DEV2.
 * Log běhu se porovná jen pro informaci: nový řádek (třeba s cenou) není
 * změna procesu.
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
const ZMENY = VYJIMKY.zmeny || [];
const NEUTRALNI_SOUBORY = new Set(ZMENY.filter((z) => z.neutralni).flatMap((z) => z.soubory || []));
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
const STROM = {
  zaklad: join(TMP, "zaklad"),            // main + všechny ohlášené změny
  zakladBezNeutralnich: join(TMP, "zaklad-bez-neutralnich"),
  dev2: join(TMP, "dev2"),
  testy: join(TMP, "testy"),
};

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

/* Základ + ohlášené změny. Neutrální změny se dají vynechat — pak je to strom
   pro důkazní průchod, že na chování nemají vliv. */
function pripravZaklad(cil, { sNeutralnimi, vypsat }) {
  stromZRevize(ZAKLAD, cil);
  for (const z of ZMENY) {
    if (z.patch) {
      /* kopirovat: data, která ohlášená změna potřebuje (plán legislativy),
         se do základu zkopírují z DEV2, ať se nemusí opakovat v patchi. Jsou
         součástí změny, ne neutrální — parita bez nich nejde. */
      for (const rel of z.kopirovat || []) {
        mkdirSync(dirname(join(cil, rel)), { recursive: true });
        copyFileSync(join(KOREN, rel), join(cil, rel));
      }
      const cesta = join(KOREN, "scripts", "dev", "parita", z.patch);
      const r = spawnSync("git", ["apply", "--whitespace=nowarn", cesta], { cwd: cil, encoding: "utf8" });
      if (r.status !== 0) {
        chyba(`ohlášenou změnu ${z.patch} nejde aplikovat na ${ZAKLAD} (main se posunul?): ${String(r.stderr).trim().split(/\r?\n/)[0]}`);
      } else if (vypsat) console.log(`ohlášeno  změna ${z.patch} — ${z.duvod}`);
    } else if (z.neutralni && sNeutralnimi) {
      for (const rel of z.soubory || []) {
        mkdirSync(dirname(join(cil, rel)), { recursive: true });
        copyFileSync(join(KOREN, rel), join(cil, rel));
      }
      if (vypsat) console.log(`ohlášeno  neutrální změna ${(z.soubory || []).join(", ")} — ${z.duvod}`);
    }
  }
}

/* Klíče, které strom zná: deklarace ve SCHEMA v jeho lib/nastaveni.js. */
function znameKlice(strom) {
  const zdroj = readFileSync(join(strom, "scripts", "lib", "nastaveni.js"), "utf8");
  const schema = zdroj.slice(zdroj.indexOf("const SCHEMA"), zdroj.indexOf("};", zdroj.indexOf("const SCHEMA")));
  return new Set([...schema.matchAll(/^\s+([a-z_]+):\s*\{\s*type:/gm)].map((m) => m[1]));
}
const radkyNastaveni = (text) => lf(text).split("\n");
const klicRadku = (radek) => (radek.replace(/#.*$/, "").trim().match(/^([a-z_]+)\s*=/) || [])[1] || null;

function nastaveniPro(strom, zdrojText, dev2Text) {
  const zna = znameKlice(strom);
  const radky = radkyNastaveni(zdrojText).filter((r) => { const k = klicRadku(r); return !k || zna.has(k); });
  const ma = new Set(radky.map(klicRadku).filter(Boolean));
  const doplnit = radkyNastaveni(dev2Text).filter((r) => { const k = klicRadku(r); return k && zna.has(k) && !ma.has(k); });
  return [...radky, ...(doplnit.length ? ["", "# doplněno paritou z DEV2", ...doplnit] : [])].join("\n") + "\n";
}

console.log(`Parita: základ ${ZAKLAD} ↔ DEV2 (pracovní strom), nastavení ${NASTAVENI === "zaklad" ? "ze základu" : "vlastní (DEV2)"}`);
console.log(`dočasné kopie: ${TMP}${NECHAT ? " (ponechají se)" : ""}\n`);

try {
  pripravZaklad(STROM.zaklad, { sNeutralnimi: true, vypsat: true });
  if (NEUTRALNI_SOUBORY.size) pripravZaklad(STROM.zakladBezNeutralnich, { sNeutralnimi: false, vypsat: false });
  stromZPracovniKopie(STROM.dev2);

  // Vstupy: data ze základu pro všechny strany, nastavení podle --nastaveni.
  const vstupy = Object.fromEntries(DATA.map((n) => [n, readFileSync(join(STROM.zaklad, "public", n))]));
  const nastaveniDev2 = readFileSync(join(STROM.dev2, "scripts", "nastaveni", "nastaveni.txt"), "utf8");
  const nastaveniZdroj = NASTAVENI === "zaklad"
    ? readFileSync(join(STROM.zaklad, "scripts", "nastaveni", "nastaveni.txt"), "utf8")
    : nastaveniDev2;
  const nastaveniStromu = new Map();
  for (const s of [STROM.zaklad, STROM.zakladBezNeutralnich, STROM.dev2]) {
    if (existsSync(s)) nastaveniStromu.set(s, nastaveniPro(s, nastaveniZdroj, nastaveniDev2));
  }
  const pripravVstupy = (strom) => {
    for (const n of DATA) writeFileSync(join(strom, "public", n), vstupy[n]);
    rmSync(join(strom, "public", "naklady.json"), { force: true });
    writeFileSync(join(strom, "scripts", "nastaveni", "nastaveni.txt"), nastaveniStromu.get(strom));
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
  console.log("\n1) Chráněné soubory (co model čte a podle čeho program rozhoduje)");
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
  ok(`${shodnych} chráněných souborů shodných (po ohlášených změnách)`);

  /* --- 2. scénáře běhu ------------------------------------------------- */
  const zmrazit = pathToFileURL(join(STROM.dev2, "scripts", "dev", "parita", "zmrazit.js")).href;
  const scenare = SCENARE.map((s) => ({ jmeno: s }));
  if (KAZETA) scenare.push({ jmeno: "kazeta" });
  const polePozadavku = new Set((VYJIMKY.pole_pozadavku || []).map((v) => v.pole));
  const poleVystupu = (VYJIMKY.pole_vystupu || []);

  function behni(strom, sc, stitek) {
    pripravVstupy(strom);
    const pozadavky = join(TMP, `${stitek}-${sc.jmeno}.jsonl`);
    rmSync(pozadavky, { force: true });
    const env = { ...process.env };
    for (const k of ["CHAPTER_LIMIT", "REZIM_BEHU", "OD_DATA", "EVAL_MODEL", "KOREKTURA_MODEL", "OVEROVACI_MODEL", "BEZ_KOREKTURY", "BEZ_ZPRAV", "BODY"]) delete env[k];
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
    if (process.env.PARITA_LOG) writeFileSync(join(TMP, `${stitek}-${sc.jmeno}.log`), `${r.stdout}${r.stderr}`);
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

  /* Porovná jeden běh základu s během DEV2. Vrací počet chyb. */
  function porovnej(za, de, popis) {
    const pred = chyb;
    if (za.kod !== de.kod) chyba(`${popis}: návratový kód evaluate.js: základ ${za.kod}, DEV2 ${de.kod} — konec logu DEV2: ${de.log.trim().split("\n").slice(-2).join(" | ")}`);
    const n = Math.max(za.pozadavky.length, de.pozadavky.length);
    for (let i = 0; i < n; i++) {
      const pa = za.pozadavky[i], pb = de.pozadavky[i];
      if (!pa || !pb) { chyba(`${popis}: požadavek č. ${i + 1}: ${!pa ? "navíc v DEV2" : "chybí v DEV2"} (${(pa || pb).druh}); základ ${za.pozadavky.length}, DEV2 ${de.pozadavky.length}`); break; }
      if (pa.druh !== pb.druh) {
        chyba(`${popis}: požadavek č. ${i + 1}: základ posílá ${pa.druh}, DEV2 ${pb.druh} — program se rozhodl jinak už dřív (přechod, brána, doptání)`);
        break;
      }
      const r = prvniRozdil(bezPoli(pa.telo), bezPoli(pb.telo));
      if (r) { chyba(`${popis}: požadavek č. ${i + 1} (${pa.druh}) se liší v ${r.cesta}:${ukazRozdilTextu(r.a, r.b)}`); break; }
    }
    for (const nazev of DATA) {
      const r = prvniRozdil(bezVyjimekVystupu(nazev, za.vystupy[nazev]), bezVyjimekVystupu(nazev, de.vystupy[nazev]));
      if (r) chyba(`${popis}: ${nazev} se liší v ${r.cesta}:\n          základ: ${ukazka(r.a)}\n          DEV2:   ${ukazka(r.b)}`);
    }
    return chyb - pred;
  }

  const behyDev2 = new Map();
  for (const sc of scenare) {
    console.log(`\n2) Scénář „${sc.jmeno}“`);
    const za = behni(STROM.zaklad, sc, "zaklad");
    const de = behni(STROM.dev2, sc, "dev2");
    behyDev2.set(sc.jmeno, de);
    if (za.kod !== 0) varuj(`evaluate.js na základu skončil kódem ${za.kod} — konec logu: ${za.log.trim().split("\n").slice(-3).join(" | ")}`);
    if (!porovnej(za, de, sc.jmeno)) {
      const druhy = {};
      for (const p of za.pozadavky) druhy[p.druh] = (druhy[p.druh] || 0) + 1;
      ok(`${za.pozadavky.length} požadavků na model shodných (${Object.entries(druhy).map(([k, v]) => `${v} ${k}`).join(", ")})`);
      const ev = za.vystupy["evaluations.json"].evals || {};
      ok(`výstupní data shodná (${Object.keys(ev).length} hodnocení, ${(za.vystupy["audit.json"].entries || []).length} auditních řádků)`);
    }
    // log — jen informace
    if (za.log !== de.log) {
      const ra = za.log.split("\n"), rb = de.log.split("\n");
      let i = 0;
      while (i < ra.length && ra[i] === rb[i]) i++;
      varuj(`log běhu se liší od řádku ${i + 1} (nepočítá se jako chyba):\n          základ: ${ukazka(ra[i] || "")}\n          DEV2:   ${ukazka(rb[i] || "")}`);
    }
    const brana = (za.log.match(/^Brána přechodů:.*$/m) || [""])[0];
    if (brana) console.log(`        ${brana}`);
  }

  /* --- 2b. důkaz neutrality ------------------------------------------- */
  if (NEUTRALNI_SOUBORY.size) {
    console.log(`\n2b) Neutrální změny (${[...NEUTRALNI_SOUBORY].join(", ")}): DEV2 proti základu BEZ nich`);
    for (const sc of scenare) {
      const zb = behni(STROM.zakladBezNeutralnich, sc, "zaklad-bez-neutralnich");
      if (!porovnej(zb, behyDev2.get(sc.jmeno), `${sc.jmeno} (bez neutrálních změn)`)) {
        ok(`${sc.jmeno}: požadavky i data shodné i bez neutrálních změn — chování nemění`);
      }
    }
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
