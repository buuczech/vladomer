/* scripts/instagram/adhoc.js — nepravidelný příspěvek na Instagram.
 *
 * Na rozdíl od pátečního automatu (post.js) nevychází z dat webu; obsah zadává
 * člověk v souboru ig-posts/RRRR-MM-DD-nazev.json. Zadání je čitelné a
 * verzovatelné, takže je vidět přesně to, co se schvaluje.
 *
 *   node scripts/instagram/adhoc.js --zadani ig-posts/…json            vykreslí
 *   node scripts/instagram/adhoc.js --zadani … --rezim publish         zveřejní
 *   … --bez-publikace                                                  zkouška
 *   node scripts/instagram/adhoc.js --rezim naplanovane                najde, co je na čase
 *
 * Publikuje se vždy PŘESNĚ to, co se vykreslilo a schválilo — obrázky se
 * v žádném kroku nekreslí znovu. Runner má jiné fonty než Windows, takže
 * překreslení by mohlo zalomit text jinak, než jsi viděl.
 *
 * Tvar zadání:
 * {
 *   "titulek": "…",              povinné, na obálku
 *   "podtitulek": "…",           volitelné
 *   "stitek": "Více",            volitelné, text na pobídce k přetažení
 *   "popisek": "…",              povinné, text pod příspěvkem
 *   "publikovat_v": "2026-08-14T19:00:00+02:00",   volitelné, naplánování
 *   "publikovano": { … },        doplní automat, ručně se nepíše
 *   "slidy": [
 *     { "nadpis": "…", "typ": "odrazky" | "kroky", "body": ["…", "…"] }
 *   ]
 * }
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../lib/nastaveni.js";
import {
  STRANA, MAX_SLIDU, vykresli, publikujCarousel, surovaAdresa,
} from "../lib/instagram.js";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const ARCHIV = join(KOREN, "ig-archive", "adhoc");
const ZADANI_DIR = join(KOREN, "ig-posts");
const VYHRADA = "Hodnotí AI podle veřejné metodiky.";

const arg = (jm, vych) => {
  const i = process.argv.indexOf(`--${jm}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : vych;
};
const ZADANI = arg("zadani", "");
const REZIM = arg("rezim", "build");
const BEZ_PUBLIKACE = process.argv.includes("--bez-publikace");

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Zadání píše člověk, takže se kontroluje dřív, než se cokoli vykreslí —
   chyba v souboru má spadnout hned a srozumitelně, ne až na Instagramu. */
function zkontroluj(z) {
  const chyby = [];
  if (!z.titulek) chyby.push("chybí „titulek“");
  if (!z.popisek) chyby.push("chybí „popisek“");
  if (!Array.isArray(z.slidy) || !z.slidy.length) chyby.push("chybí „slidy“ (aspoň jeden)");
  (z.slidy || []).forEach((s, i) => {
    const kde = `slide ${i + 1}`;
    if (!s.nadpis) chyby.push(`${kde}: chybí „nadpis“`);
    if (!Array.isArray(s.body) || !s.body.length) chyby.push(`${kde}: chybí „body“`);
    if (s.typ && !["odrazky", "kroky"].includes(s.typ)) {
      chyby.push(`${kde}: „typ“ musí být „odrazky“ nebo „kroky“, ne „${s.typ}“`);
    }
    if ((s.body || []).length > 5) chyby.push(`${kde}: ${s.body.length} bodů se na slide nevejde, nejvýš 5`);
  });
  // Obálka plus informační slidy; Instagram bere v carouselu 2 až 10 obrázků.
  const celkem = 1 + (z.slidy || []).length;
  if (celkem > MAX_SLIDU) {
    chyby.push(`celkem ${celkem} slidů, Instagram jich v carouselu unese nejvýš ${MAX_SLIDU}`);
  }
  if (chyby.length) throw new Error(`zadání není v pořádku:\n        - ${chyby.join("\n        - ")}`);
}

/* Delší titulek se musí zmenšit, jinak přeteče přes spodní štítek. */
function velikostTitulku(t) {
  if (t.length <= 34) return 88;
  if (t.length <= 52) return 72;
  if (t.length <= 76) return 60;
  return 52;
}
const velikostNadpisu = (t) => (t.length <= 28 ? 64 : t.length <= 44 ? 54 : 46);

function radek(text, typ, poradi) {
  const znacka = typ === "kroky"
    ? `<div class="badge-num">${String(poradi).padStart(2, "0")}</div>`
    : `<div class="badge-dot"></div>`;
  return `<div style="background:#121824;border:1px solid #232C3D;border-radius:20px;padding:28px 32px;display:flex;align-items:center;gap:26px;flex:1">
${znacka}
<div style="font-size:29px;line-height:1.38;font-weight:560">${esc(text)}</div>
</div>`;
}

function slidyHtml(z) {
  const celkem = 1 + z.slidy.length;
  const out = [render("ig-obalka.html", {
    STRANA: `1/${celkem}`,
    TITULEK: esc(z.titulek),
    VELIKOST_TITULKU: velikostTitulku(z.titulek),
    PODTITULEK: esc(z.podtitulek || ""),
    STITEK_DALSI: esc(z.stitek || "Více"),
  })];
  z.slidy.forEach((s, i) => {
    out.push(render("ig-slide.html", {
      STRANA: `${i + 2}/${celkem}`,
      NADPIS: esc(s.nadpis),
      VELIKOST_NADPISU: velikostNadpisu(s.nadpis),
      RADKY: s.body.map((t, j) => radek(t, s.typ || "odrazky", j + 1)).join("\n"),
      VYHRADA,
    }));
  });
  return out;
}

function nactiZadani() {
  if (!ZADANI) throw new Error("chybí --zadani cesta/k/zadani.json");
  if (!existsSync(ZADANI)) throw new Error(`zadání ${ZADANI} neexistuje`);
  let z;
  try { z = JSON.parse(readFileSync(ZADANI, "utf8")); }
  catch (e) { throw new Error(`zadání není platný JSON: ${e.message}`); }
  zkontroluj(z);
  return z;
}

const zakladJmena = () => basename(ZADANI).replace(/\.json$/i, "");

function build() {
  const z = nactiZadani();
  const zaklad = zakladJmena();
  mkdirSync(ARCHIV, { recursive: true });

  const html = slidyHtml(z);
  html.forEach((h, i) => {
    const jmeno = `${zaklad}-${i + 1}.jpg`;
    const bajtu = vykresli(h, join(ARCHIV, jmeno));
    console.log(`Slide ${i + 1}/${html.length}: ig-archive/adhoc/${jmeno} (${bajtu} b, ${STRANA}×${STRANA}, JPEG)`);
  });
  writeFileSync(join(ARCHIV, `${zaklad}.txt`), z.popisek, "utf8");
  console.log("--- popisek ---\n" + z.popisek + "\n--- konec popisku ---");
}

async function publish() {
  const z = nactiZadani();
  const zaklad = zakladJmena();
  const pocet = 1 + z.slidy.length;
  const soubory = Array.from({ length: pocet }, (_, i) => `${zaklad}-${i + 1}.jpg`);
  const chybi = soubory.filter((f) => !existsSync(join(ARCHIV, f)));
  const popis = join(ARCHIV, `${zaklad}.txt`);
  if (chybi.length || !existsSync(popis)) {
    throw new Error(`v ig-archive/adhoc/ chybí ${[...chybi, ...(existsSync(popis) ? [] : [`${zaklad}.txt`])].join(", ")}`
      + " — nejdřív musí proběhnout build a commit");
  }
  const id = await publikujCarousel(
    soubory.map((f) => surovaAdresa(`ig-archive/adhoc/${f}`)),
    readFileSync(popis, "utf8"),
    { bezPublikace: BEZ_PUBLIKACE },
  );
  if (id) zaznamenej(id);
}

/* Naplánované příspěvky. Hodinový cron zavolá tenhle režim; ten najde zadání,
   kterému nastal čas, OZNAČÍ HO a skončí. Publikuje se až dalším krokem, po
   commitnutí značky.

   Označit se musí předem, ne potom: kdyby zveřejnění prošlo a commit značky
   pak selhal, další hodinový běh by tentýž příspěvek vyvěsil podruhé. Takhle
   je nejhorší možný výsledek ten, že příspěvek nevyjde a značka to prozradí —
   což je vidět a dá se spravit, na rozdíl od duplicity na profilu. */
function naplanovane() {
  const ted = Date.now();
  const soubory = existsSync(ZADANI_DIR)
    ? readdirSync(ZADANI_DIR).filter((f) => f.endsWith(".json")).sort()
    : [];

  for (const f of soubory) {
    const cesta = join(ZADANI_DIR, f);
    let z;
    try { z = JSON.parse(readFileSync(cesta, "utf8")); } catch { continue; }
    if (!z.publikovat_v || z.publikovano) continue;

    const kdy = Date.parse(z.publikovat_v);
    if (Number.isNaN(kdy)) {
      console.log(`${f}: „publikovat_v“ není platné datum (${z.publikovat_v}) — přeskakuje se`);
      continue;
    }
    if (kdy > ted) continue;

    zkontroluj(z);   // ať se vadné zadání pozná dřív, než se cokoli označí
    z.publikovano = { pokus: new Date(ted).toISOString() };
    writeFileSync(cesta, `${JSON.stringify(z, null, 2)}\n`, "utf8");

    console.log(`Na čase: ${f} (plánováno na ${z.publikovat_v})`);
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(process.env.GITHUB_OUTPUT, `zadani=ig-posts/${f}\n`, { flag: "a" });
    }
    return;   // jeden běh, jeden příspěvek
  }

  console.log("Nic naplánovaného na teď.");
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, "zadani=\n", { flag: "a" });
  }
}

/** Po úspěšném zveřejnění doplní do zadání ID příspěvku. */
function zaznamenej(id) {
  if (!ZADANI || !existsSync(ZADANI)) return;
  const z = JSON.parse(readFileSync(ZADANI, "utf8"));
  if (!z.publikovano) return;   // ruční běh bez naplánování se nezaznamenává
  z.publikovano = { ...z.publikovano, id, kdy: new Date().toISOString() };
  writeFileSync(ZADANI, `${JSON.stringify(z, null, 2)}\n`, "utf8");
}

async function main() {
  if (!["build", "publish", "naplanovane"].includes(REZIM)) {
    throw new Error(`neznámý režim „${REZIM}“. Použij build, publish nebo naplanovane.`);
  }
  if (REZIM === "naplanovane") return naplanovane();
  if (REZIM === "publish" && (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID)) {
    throw new Error("chybí IG_ACCESS_TOKEN nebo IG_USER_ID — publikuje se z GitHub Actions, ne lokálně");
  }
  return REZIM === "build" ? build() : publish();
}

main().catch((e) => { console.error(`\nCHYBA: ${e.message}\n`); process.exit(1); });
