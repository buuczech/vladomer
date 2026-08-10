/* scripts/instagram/post.js — týdenní příspěvek na Instagram.
 *
 * Běží v pátek večer, po ranním hodnocení. Vezme data z public/evaluations.json,
 * vykreslí dvoustránkový carousel podle šablon scripts/nastaveni/instagram-1-*
 * a instagram-2-*, složí popisek z nejvýraznějších změn a zveřejní to přes
 * Graph API.
 *
 * Tři režimy (--rezim):
 *   verify   ověří jen přihlášení k účtu, nic nekreslí ani neposílá
 *   build    sestaví obrázek i popisek do ig-archive/ a skončí (výchozí)
 *   publish  vezme, co build připravil, a zveřejní to
 *
 * Build a publish jsou schválně oddělené: Instagram si obrázek stahuje sám
 * z veřejné adresy, takže mezi ně musí přijít commit a push. Popisek se ukládá
 * vedle obrázku, aby se zveřejnilo přesně to, co se sestavilo a zkontrolovalo.
 *
 * Nic z toho nesahá na produkční web: obrázek se ukládá do ig-archive/, tedy
 * mimo public/, takže se nedostane do buildu.
 *
 * Popisek se skládá z dat, ne modelem — žádné placené volání a nic si nemůže
 * vymyslet. Nepoužívá se text change.cs: umí tvrdit „stav zůstává nezahájený"
 * u bodu, kterému se stav změnil. Bere se název bodu a přechod stavů.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../lib/nastaveni.js";
import { ALL_ITEMS, TOTAL_ITEMS } from "../../src/data.js";
/* Vykreslení i publikace jsou ve sdíleném modulu — používá je i adhoc.js.
   Zveřejnění je jediný nevratný krok v projektu a smí existovat jen jednou. */
import {
  STRANA as W, vykresli, publikujCarousel, overPristup, surovaAdresa,
} from "../lib/instagram.js";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const EVAL = join(KOREN, "public", "evaluations.json");
const ARCHIV = join(KOREN, "ig-archive");

/* Táž přísná metrika jako src/App.jsx, og-image.js, seo.js a prehled.js.
   Je to páté místo — když se změní pravidlo, musí se změnit všude. */
const HODNOCENE = new Set(["fulfilled", "partial", "in_progress", "declared", "not_started", "broken"]);
const RANK = { fulfilled: 5, partial: 4, in_progress: 3, declared: 2, not_started: 1, broken: 0, stalled: 0 };
const NAZEV = {
  fulfilled: "splněno", partial: "částečně splněno", in_progress: "probíhá",
  declared: "jen deklarováno", not_started: "nezahájeno", broken: "porušeno", stalled: "porušeno",
};

const arg = (jm, vych) => {
  const i = process.argv.indexOf(`--${jm}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : vych;
};
const REZIM = arg("rezim", "build");
if (!["verify", "build", "publish"].includes(REZIM)) {
  console.error(`Neznámý režim „${REZIM}". Použij verify, build nebo publish.`);
  process.exit(1);
}
// --vyzaduj-dnesni: build skončí bez výstupu, když data nejsou z dneška.
const VYZADUJ_DNESNI = process.argv.includes("--vyzaduj-dnesni");
/* --bez-publikace: projde celou cestu zveřejnění včetně vytvoření kontejneru
   a čekání na zpracování obrázku, ale poslední, nevratný krok neudělá.
   Kontejner sám od sebe do 24 h vyprší, takže po tom nic nezůstane. */
const BEZ_PUBLIKACE = process.argv.includes("--bez-publikace");

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const jedno = (v) => (v >= 10 || v === 0 ? Math.round(v) : Math.round(v * 10) / 10);
const cislo = (v) => String(jedno(v)).replace(".", ",");

function nactiData() {
  const j = JSON.parse(readFileSync(EVAL, "utf8"));
  const evals = j.evals || {};
  let done = 0, partial = 0, prog = 0, broken = 0, n = 0;
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e || !HODNOCENE.has(e.status) || e.unverifiable) continue;
    n++;
    if (e.status === "fulfilled") done++;
    else if (e.status === "partial") partial++;
    else if (e.status === "in_progress") prog++;
    else if (e.status === "broken" || e.status === "stalled") broken++;
  }
  const p = (x) => (n ? (x / n) * 100 : 0);

  /* Změny se řadí podle velikosti posunu — stejné pořadí, jaké na webu ukazuje
     panel „Změny od minulého týdne". Zhoršení i zlepšení se berou stejně: co
     se hnulo nejvíc, je nejzajímavější. */
  const zmeny = [];
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e || !e.previousStatus || e.previousStatus === e.status) continue;
    if (!HODNOCENE.has(e.status) || !HODNOCENE.has(e.previousStatus)) continue;
    const smer = (RANK[e.status] ?? 1) - (RANK[e.previousStatus] ?? 1);
    zmeny.push({ id: it.id, nazev: it.cs, z: e.previousStatus, na: e.status, smer });
  }
  zmeny.sort((a, b) => Math.abs(b.smer) - Math.abs(a.smer) || a.smer - b.smer);

  return {
    done: p(done), partial: p(partial), prog: p(prog), broken: p(broken),
    hodnoceno: n, lastUpdated: j.lastUpdated, zmeny,
  };
}

const RAMECEK = "background:#121824;border:1px solid #232C3D;border-radius:20px;"
  + "padding:30px 32px;display:flex;align-items:center;gap:26px;flex:1";
const KOLECKO = "width:64px;height:64px;border-radius:50%;display:flex;align-items:center;"
  + "justify-content:center;font-size:30px;font-weight:800;flex:none";

function radekZmeny(z) {
  const tr = z.smer > 0 ? "▲" : z.smer < 0 ? "▼" : "→";
  const cl = z.smer > 0 ? "chg-up" : z.smer < 0 ? "chg-down" : "chg-same";
  /* Cílový stav je zvýrazněný — je to ta informace, kvůli které se člověk
     u příspěvku zastaví. Výchozí stav je potlačený, slouží jen jako kontext. */
  const barva = z.smer > 0 ? "#10B981" : z.smer < 0 ? "#EF4444" : "#8B96AB";
  return `<div style="${RAMECEK}">
<div class="${cl}" style="${KOLECKO}">${tr}</div>
<div style="font-size:32px;line-height:1.32;font-weight:560">${esc(z.nazev)}<br>
<span style="color:#8B96AB">z „${esc(NAZEV[z.z])}“ na </span><span style="color:${barva};font-weight:760">„${esc(NAZEV[z.na])}“</span></div>
</div>`;
}

function radekBezeZmen() {
  return `<div style="${RAMECEK}">
<div class="chg-same" style="${KOLECKO}">→</div>
<div style="font-size:32px;line-height:1.32;font-weight:560">Žádný bod tento týden nezměnil stav.</div>
</div>`;
}

const NADPIS = "Týdenní shrnutí";   // jméno profilu je nad obrázkem, neopakuje se
const VYHRADA = "Hodnotí AI podle veřejné metodiky.";
const datumCS = (iso) => new Date(iso).toLocaleDateString("cs-CZ",
  { day: "numeric", month: "long", year: "numeric" });

/* Číslo sedí uvnitř prstence, jehož vnitřní průměr vychází zhruba na 426 px.
   Návrh počítá s 220 px, jenže to platí jen pro celé číslo jako „12". Naše
   „5,7" je o dva znaky delší a při 190 px stále přetékalo přes oblouk.
   Znak „%" je v téhle váze písma nejširší glyf z celého řetězce, proto se
   sází menší než číslo — číslo tak zůstane velké a celek se vejde. */
function velikostCisla(text) {
  if (text.length <= 2) return 230;   // „12"
  if (text.length === 3) return 185;  // „5,7"
  if (text.length === 4) return 155;
  return 130;
}
const velikostProcenta = (v) => Math.round(v * 0.42);

function slideSouhrn(d) {
  const r = 80, c = 2 * Math.PI * r;
  const seg = (v) => (v / 100) * c;
  return render("instagram-1-souhrn.html", {
    NADPIS, DATUM: datumCS(d.lastUpdated), VYHRADA,
    PCT: cislo(d.done),
    VELIKOST_CISLA: velikostCisla(cislo(d.done)),
    VELIKOST_PROCENTA: velikostProcenta(velikostCisla(cislo(d.done))),
    PCT_POPIS: "splněno z programu",
    DONE: cislo(d.done), PARTIAL: cislo(d.partial), PROG: cislo(d.prog), BROKEN: cislo(d.broken),
    DONE_DASH: `${seg(d.done)} ${c}`,
    PARTIAL_DASH: `${seg(d.partial)} ${c}`, PARTIAL_OFFSET: -seg(d.done),
    PROG_DASH: `${seg(d.prog)} ${c}`, PROG_OFFSET: -seg(d.done + d.partial),
    BROKEN_DASH: `${seg(d.broken)} ${c}`, BROKEN_OFFSET: -seg(d.done + d.partial + d.prog),
    POPIS_SPLNENO: "Splněno", POPIS_CASTECNE: "Částečně",
    POPIS_PROBIHA: "Probíhá", POPIS_PORUSENO: "Porušeno",
    // Štítek musí slíbit to, co na dalším slidu opravdu je.
    STITEK_DALSI: "Změny týdne",
  });
}

function slideZmeny(d, vybrane) {
  return render("instagram-2-zmeny.html", {
    NADPIS, DATUM: datumCS(d.lastUpdated), VYHRADA,
    NADPIS_ZMEN: "Změny týdne",
    RADKY_ZMEN: vybrane.length ? vybrane.map(radekZmeny).join("\n") : radekBezeZmen(),
  });
}

function popisek(d, vybrane) {
  const datum = new Date(d.lastUpdated).toLocaleDateString("cs-CZ",
    { day: "numeric", month: "long", year: "numeric" });
  const r = [
    `Plnění programového prohlášení vlády k ${datum}:`,
    "",
    `✅ splněno ${cislo(d.done)} % · 🟢 částečně ${cislo(d.partial)} % · 🟠 probíhá ${cislo(d.prog)} % · 🔴 porušeno ${cislo(d.broken)} %`,
    `Hodnoceno ${d.hodnoceno} ze ${TOTAL_ITEMS} závazků.`,
  ];
  if (vybrane.length) {
    r.push("", "Změny tohoto týdne:");
    for (const z of vybrane) {
      const tr = z.smer > 0 ? "▲" : z.smer < 0 ? "▼" : "→";
      r.push(`${tr} ${z.nazev} — z „${NAZEV[z.z]}“ na „${NAZEV[z.na]}“`);
    }
  } else {
    r.push("", "Tento týden nezměnil stav žádný bod.");
  }
  /* Výhrada jde s číslem ven vždycky, stejně jako na /prehled/. Kdo si z
     příspěvku odnese jen procento, odnese si s ním i to, jak vzniklo. */
  r.push(
    "",
    "Hodnotí jazykový model podle veřejné metodiky, orientační a neoficiální. Stav „splněno“ vyžaduje průchod celým legislativním procesem.",
    "Zdroje u každého bodu na vladomer.cz",
    "",
    "#vladomer #politika #vlada #cesko #transparentnost #programoveprohlaseni",
  );
  return r.join("\n");
}


// Umožní workflow poznat, že se má zbytek kroků přeskočit, bez chybného běhu.
function vystup(klic, hodnota) {
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `${klic}=${hodnota}\n`, { flag: "a" });
  }
}

function jmenoSouboru() {
  const j = JSON.parse(readFileSync(EVAL, "utf8"));
  return ((j.lastUpdated || "").slice(0, 10)) || new Date().toISOString().slice(0, 10);
}

async function build() {
  const d = nactiData();
  const dnes = new Date().toISOString().slice(0, 10);
  const dataZ = (d.lastUpdated || "").slice(0, 10);

  /* Pojistka proti zveřejnění starých čísel: kdyby ranní hodnocení spadlo,
     vyšel by týden starý stav jako „týdenní shrnutí". */
  if (VYZADUJ_DNESNI && dataZ !== dnes) {
    console.log(`Data jsou z ${dataZ}, dnes je ${dnes} — hodnocení dnes neproběhlo, `
      + "příspěvek se nesestavuje ani nezveřejňuje.");
    vystup("preskocit", "true");
    return;
  }
  vystup("preskocit", "false");

  const vybrane = d.zmeny.slice(0, 3);
  const text = popisek(d, vybrane);

  mkdirSync(ARCHIV, { recursive: true });
  const zaklad = dataZ || dnes;
  /* Carousel je vždycky dvoustránkový, i v týdnu beze změn — druhý slide pak
     nese jeden poctivý řádek. Jedna cesta kódem: kdyby se podle počtu změn
     přepínalo mezi jedním obrázkem a carouselem, měla by publikace dva tvary,
     a to je krok, který se nedá vzít zpět. */
  for (const [i, html] of [slideSouhrn(d), slideZmeny(d, vybrane)].entries()) {
    const jmeno = `${zaklad}-${i + 1}.jpg`;
    const bajtu = vykresli(html, join(ARCHIV, jmeno));
    console.log(`Slide ${i + 1}: ig-archive/${jmeno} (${bajtu} b, ${W}×${W}, JPEG)`);
  }
  writeFileSync(join(ARCHIV, `${zaklad}.txt`), text, "utf8");

  console.log(`Změn celkem ${d.zmeny.length}, v příspěvku ${vybrane.length}.`);
  console.log("--- popisek ---\n" + text + "\n--- konec popisku ---");
}

/* Počká, až si Instagram obrázek stáhne a zpracuje. */
async function pockejNaKontejner(id, popis) {
  for (let i = 0; i < 20; i++) {
    const s = await graph(id, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") { console.log(`  ${popis} připraven.`); return; }
    if (s.status_code === "ERROR") throw new Error(`Instagram ${popis} odmítl: ${s.status || "bez detailu"}`);
    if (i === 19) throw new Error(`${popis} se do 60 s nepřipravil (poslední stav: ${s.status_code || "neznámý"})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function publish() {
  const zaklad = jmenoSouboru();
  const soubory = [1, 2].map((i) => `${zaklad}-${i}.jpg`);
  const popis = join(ARCHIV, `${zaklad}.txt`);
  const chybi = soubory.filter((f) => !existsSync(join(ARCHIV, f)));
  if (chybi.length || !existsSync(popis)) {
    throw new Error(`v ig-archive/ chybí ${[...chybi, ...(existsSync(popis) ? [] : [`${zaklad}.txt`])].join(", ")}`
      + " — nejdřív musí proběhnout build");
  }
  await publikujCarousel(
    soubory.map((f) => surovaAdresa(`ig-archive/${f}`)),
    readFileSync(popis, "utf8"),
    { bezPublikace: BEZ_PUBLIKACE },
  );
}

async function main() {
  if (REZIM !== "build" && (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID)) {
    console.error("Chybí IG_ACCESS_TOKEN nebo IG_USER_ID.");
    process.exit(1);
  }
  if (REZIM === "verify") return overPristup();
  if (REZIM === "build") return build();
  return publish();
}

main().catch((e) => { console.error(`\nCHYBA: ${e.message}\n`); process.exit(1); });
