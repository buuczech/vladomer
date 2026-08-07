/* scripts/instagram/post.js — týdenní příspěvek na Instagram.
 *
 * Běží v pátek večer, po ranním hodnocení. Vezme data z public/evaluations.json,
 * vykreslí čtvercový obrázek podle scripts/nastaveni/instagram-post.html, složí
 * popisek z nejvýraznějších změn a zveřejní to přes Graph API.
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
import { writeFileSync, readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../lib/nastaveni.js";
import { ALL_ITEMS, TOTAL_ITEMS } from "../../src/data.js";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const EVAL = join(KOREN, "public", "evaluations.json");
const ARCHIV = join(KOREN, "ig-archive");
const API = "https://graph.facebook.com/v21.0";
const W = 1080;

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

function radekZmeny(z) {
  const tr = z.smer > 0 ? "▲" : z.smer < 0 ? "▼" : "→";
  const cl = z.smer > 0 ? "chg-up" : z.smer < 0 ? "chg-down" : "chg-same";
  const text = `${z.nazev} — z „${NAZEV[z.z]}“ na „${NAZEV[z.na]}“.`;
  return `<div style="background:#121824;border:1px solid #232C3D;border-left:4px solid #5B7BE8;border-radius:0 12px 12px 0;padding:16px 20px;display:flex;align-items:flex-start;gap:12px;flex:1">
<span class="${cl}" style="font-size:24px;font-weight:800;flex:none;margin-top:1px">${tr}</span>
<div style="font-size:22px;line-height:1.35">${esc(text)}</div>
</div>`;
}

function radekBezeZmen() {
  return `<div style="background:#121824;border:1px solid #232C3D;border-left:4px solid #5B7BE8;border-radius:0 12px 12px 0;padding:16px 20px;display:flex;align-items:center;gap:12px;flex:1">
<span class="chg-same" style="font-size:24px;font-weight:800;flex:none">→</span>
<div style="font-size:22px;line-height:1.35">Žádný bod tento týden nezměnil stav.</div>
</div>`;
}

function obrazekHtml(d, vybrane) {
  const r = 80, c = 2 * Math.PI * r;
  const seg = (v) => (v / 100) * c;
  const datum = new Date(d.lastUpdated).toLocaleDateString("cs-CZ",
    { day: "numeric", month: "long", year: "numeric" });
  return render("instagram-post.html", {
    PODTITUL: "Týdenní shrnutí",
    PCT: cislo(d.done),
    PCT_POPIS: "splněno z programu",
    DONE: cislo(d.done), PARTIAL: cislo(d.partial), PROG: cislo(d.prog), BROKEN: cislo(d.broken),
    DONE_DASH: `${seg(d.done)} ${c}`,
    PARTIAL_DASH: `${seg(d.partial)} ${c}`, PARTIAL_OFFSET: -seg(d.done),
    PROG_DASH: `${seg(d.prog)} ${c}`, PROG_OFFSET: -seg(d.done + d.partial),
    BROKEN_DASH: `${seg(d.broken)} ${c}`, BROKEN_OFFSET: -seg(d.done + d.partial + d.prog),
    POPIS_SPLNENO: "Splněno", POPIS_CASTECNE: "Částečně",
    POPIS_PROBIHA: "Probíhá", POPIS_PORUSENO: "Porušeno",
    NADPIS_ZMEN: "Změny týdne",
    RADKY_ZMEN: vybrane.length ? vybrane.map(radekZmeny).join("\n") : radekBezeZmen(),
    DATUM: `Stav k ${datum}`,
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

function chrome() {
  const kand = [
    process.env.CHROME_PATH,
    "google-chrome-stable", "google-chrome", "chromium-browser", "chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  for (const c of kand) {
    if (c.includes("\\") && !existsSync(c)) continue;
    try { execFileSync(c, ["--version"], { stdio: "ignore", timeout: 20000 }); return c; } catch { /* další */ }
  }
  throw new Error("Chrome nenalezen — nastav CHROME_PATH");
}

/* Instagram u image_url přijímá JPEG; PNG odmítne. Chrome odvodí formát
   z přípony .jpg (ověřeno: vrací FF D8 FF). Kontrola magických bajtů níže je
   tu proto, že na tohle chování se nedá spolehnout napříč verzemi — a poslat
   PNG s příponou .jpg by skončilo záhadnou chybou až na straně Meta. */
function vykresli(html, cil) {
  const dir = mkdtempSync(join(tmpdir(), "vm-ig-"));
  try {
    const f = join(dir, "post.html");
    writeFileSync(f, html, "utf8");
    execFileSync(chrome(), [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
      "--force-device-scale-factor=1", `--window-size=${W},${W}`,
      `--screenshot=${cil}`, `file://${f.replace(/\\/g, "/")}`,
    ], { stdio: "ignore", timeout: 60000 });
    const raw = readFileSync(cil);
    if (raw.subarray(0, 3).toString("hex") !== "ffd8ff") {
      throw new Error(`výsledek není JPEG (začíná ${raw.subarray(0, 4).toString("hex")}) — `
        + "Instagram by ho odmítl; tahle verze Chromu neodvozuje formát z přípony");
    }
    return raw.length;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function graph(cesta, telo) {
  const url = `${API}/${cesta}`;
  const res = telo
    ? await fetch(url, { method: "POST", body: new URLSearchParams(telo) })
    : await fetch(url);
  const j = await res.json();
  if (!res.ok || j.error) {
    // Token se do hlášky nikdy nedostane — logy běhu jsou veřejné.
    throw new Error(`Graph API ${res.status}: ${j.error?.message || JSON.stringify(j)}`);
  }
  return j;
}

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_ID = process.env.IG_USER_ID;

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
  const bajtu = vykresli(obrazekHtml(d, vybrane), join(ARCHIV, `${zaklad}.jpg`));
  writeFileSync(join(ARCHIV, `${zaklad}.txt`), text, "utf8");

  console.log(`Obrázek: ig-archive/${zaklad}.jpg (${bajtu} b, ${W}×${W}, JPEG)`);
  console.log(`Změn celkem ${d.zmeny.length}, v příspěvku ${vybrane.length}.`);
  console.log("--- popisek ---\n" + text + "\n--- konec popisku ---");
}

async function publish() {
  const zaklad = jmenoSouboru();
  const obrazek = join(ARCHIV, `${zaklad}.jpg`);
  const popis = join(ARCHIV, `${zaklad}.txt`);
  if (!existsSync(obrazek) || !existsSync(popis)) {
    throw new Error(`v ig-archive/ chybí ${zaklad}.jpg nebo ${zaklad}.txt — nejdřív musí proběhnout build`);
  }
  const text = readFileSync(popis, "utf8");

  const repo = process.env.GITHUB_REPOSITORY || "buuczech/vladomer";
  const vetev = process.env.GITHUB_REF_NAME || "main";
  const url = `https://raw.githubusercontent.com/${repo}/${vetev}/ig-archive/${zaklad}.jpg`;

  // Instagram si obrázek stahuje sám, takže musí být v tuhle chvíli veřejný.
  const kontrola = await fetch(url, { method: "HEAD" });
  if (!kontrola.ok) throw new Error(`obrázek není veřejně dostupný (${kontrola.status}) na ${url} — commit se asi nedostal na GitHub`);

  const kontejner = await graph(`${IG_ID}/media`, { image_url: url, caption: text, access_token: TOKEN });

  for (let i = 0; i < 20; i++) {
    const s = await graph(`${kontejner.id}?fields=status_code,status&access_token=${TOKEN}`);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") throw new Error(`Instagram obrázek odmítl: ${s.status || "bez detailu"}`);
    if (i === 19) throw new Error("Kontejner se do 60 s nepřipravil.");
    await new Promise((r) => setTimeout(r, 3000));
  }

  const post = await graph(`${IG_ID}/media_publish`, { creation_id: kontejner.id, access_token: TOKEN });
  console.log(`Zveřejněno. ID příspěvku: ${post.id}`);
}

/* Ověření přístupu. Nejdřív si přes stránky najde, jaká Instagram Business ID
   token vlastně vidí, a teprve pak zkontroluje nastavené IG_USER_ID — když
   nesedí, rovnou vypíše to správné číslo.
   Vzniklo poté, co první ostrý pokus skončil na „(#100) Tried accessing
   nonexisting field (media_count)": to je hláška, kterou dostaneš, když se
   ptáš uzlu, který není instagramový účet (typicky ID systémového uživatele
   nebo stránky). Sama o sobě neřekne nic o tom, co s tím. */
async function verify() {
  const ja = await graph(`me?fields=id,name&access_token=${TOKEN}`);
  console.log(`Token patří: ${ja.name || "(bez jména)"} (${ja.id})`);

  const stranky = await graph(`me/accounts?fields=name,instagram_business_account{id,username}&access_token=${TOKEN}`);
  const nalezene = [];
  for (const s of stranky.data || []) {
    const ig = s.instagram_business_account;
    console.log(ig
      ? `  stránka „${s.name}" → Instagram @${ig.username}, IG_USER_ID = ${ig.id}`
      : `  stránka „${s.name}" → žádný propojený Instagram Business účet`);
    if (ig) nalezene.push(ig);
  }
  if (!(stranky.data || []).length) {
    throw new Error("token nevidí žádnou facebookovou stránku — systémovému uživateli není "
      + "přiřazená (Business settings → System users → Add assets → Pages)");
  }
  if (!nalezene.length) {
    throw new Error("žádná stránka nemá propojený Instagram Business účet — účet musí být "
      + "firemní a propojený se stránkou");
  }

  try {
    const u = await graph(`${IG_ID}?fields=username&access_token=${TOKEN}`);
    console.log(`\nNastavené IG_USER_ID sedí: @${u.username}. Můžeš spustit režim dry.`);
  } catch {
    const spravne = nalezene[0];
    throw new Error(`nastavené IG_USER_ID (${IG_ID}) není instagramový účet.\n`
      + `        Oprav secret IG_USER_ID na: ${spravne.id}   (@${spravne.username})`);
  }
}

async function main() {
  if (REZIM !== "build" && (!TOKEN || !IG_ID)) {
    console.error("Chybí IG_ACCESS_TOKEN nebo IG_USER_ID.");
    process.exit(1);
  }
  if (REZIM === "verify") return verify();
  if (REZIM === "build") return build();
  return publish();
}

main().catch((e) => { console.error(`\nCHYBA: ${e.message}\n`); process.exit(1); });
