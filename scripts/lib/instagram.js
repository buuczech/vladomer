/* scripts/lib/instagram.js — vykreslení slidů a publikace carouselu.
 *
 * Sdílí ho páteční automat (scripts/instagram/post.js) i nepravidelné
 * příspěvky (scripts/instagram/adhoc.js). Zveřejnění je jediný krok v celém
 * projektu, který se nedá vzít zpět — existuje proto právě jednou.
 *
 * Chování téhle publikace se ladilo proti ostrému API a každá zvláštnost tu
 * je z konkrétního důvodu; komentáře u nich říkají jakého.
 */
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* Instagram doporučuje pro příspěvky a carousely 3:4; čtverec 1080×1080 byl
   výchozí do roku 2026. Na výšku zabere v mřížce profilu i ve feedu víc
   místa a nemusí se ručně ořezávat. */
export const SIRKA = 1080;
export const VYSKA = 1440;
export const REEL_SIRKA = 1080;      // reel je na výšku 9:16
export const REEL_VYSKA = 1920;
export const MAX_SLIDU = 10;         // carousel bere 2 až 10 položek
const API = "https://graph.facebook.com/v21.0";

export function chrome() {
  const kand = [
    process.env.CHROME_PATH,
    "google-chrome-stable", "google-chrome", "chromium-browser", "chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  for (const c of kand) {
    if (c.includes("\\") && !existsSync(c)) continue;
    try { execFileSync(c, ["--version"], { stdio: "ignore", timeout: 20000 }); return c; } catch { /* další */ }
  }
  throw new Error("Chrome nenalezen — nastav CHROME_PATH");
}

/* Instagram u image_url přijímá JPEG; PNG odmítne. Chrome odvodí formát
   z přípony .jpg (ověřeno: vrací FF D8 FF). Kontrola magických bajtů je tu
   proto, že na tohle chování se nedá spolehnout napříč verzemi — a poslat PNG
   s příponou .jpg by skončilo záhadnou chybou až na straně Meta. */
export function vykresli(html, cil, sirka = SIRKA, vyska = VYSKA) {
  const dir = mkdtempSync(join(tmpdir(), "vm-ig-"));
  try {
    const f = join(dir, "slide.html");
    writeFileSync(f, html, "utf8");
    execFileSync(chrome(), [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
      "--force-device-scale-factor=1", `--window-size=${sirka},${vyska}`,
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

/* --- Graph API ----------------------------------------------------------- */

const TOKEN = () => process.env.IG_ACCESS_TOKEN;
const IG_ID = () => process.env.IG_USER_ID;

/* Token se předává v parametrech, nikdy ne v cestě — chybová hláška pak smí
   uvést, které volání spadlo, aniž by ho vypsala do veřejného logu běhu.
   Vypisuje se i kód chyby: „Media ID is not available" samo o sobě neřekne,
   jestli je problém v účtu, v kontejneru, nebo v obrázku. */
export async function graph(cesta, params = {}, metoda = "GET") {
  const p = new URLSearchParams({ ...params, access_token: TOKEN() });
  const res = metoda === "POST"
    ? await fetch(`${API}/${cesta}`, { method: "POST", body: p })
    : await fetch(`${API}/${cesta}?${p}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const e = j.error || {};
    const kod = e.code ? ` [kód ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""}]` : "";
    const uziv = e.error_user_msg ? ` — ${e.error_user_msg}` : "";
    throw new Error(`Graph API ${res.status} u ${metoda} /${cesta}: `
      + `${e.message || JSON.stringify(j)}${kod}${uziv}`);
  }
  return j;
}

/* Ověří, že IG_USER_ID je opravdu instagramový účet, a když ne, najde a vypíše
   to správné. Volá se před publikací: bez toho se špatné ID projeví až
   nesrozumitelnou hláškou od Meta uprostřed zveřejňování. */
export async function ucet() {
  try {
    return await graph(IG_ID(), { fields: "username" });
  } catch (chyba) {
    let napoveda = "";
    try {
      const s = await graph("me/accounts", { fields: "name,instagram_business_account{id,username}" });
      const ig = (s.data || []).map((x) => x.instagram_business_account).filter(Boolean);
      napoveda = ig.length
        ? `\n        Oprav secret IG_USER_ID na: ${ig[0].id}   (@${ig[0].username})`
        : "\n        Token nevidí žádný Instagram Business účet — zkontroluj přiřazení "
          + "v Business settings → System users → Add assets.";
    } catch { /* diagnostika je bonus, původní chyba je důležitější */ }
    throw new Error(`IG_USER_ID nevypadá jako instagramový účet.\n        ${chyba.message}${napoveda}`);
  }
}

/**
 * Počká, až si Instagram média stáhne a zpracuje.
 * Obrázek bývá hotový do několika vteřin; video se překóduje i minuty, proto
 * si volající může čekání prodloužit.
 */
export async function pockejNaKontejner(id, popis, { pokusu = 20, krok = 3000 } = {}) {
  for (let i = 0; i < pokusu; i++) {
    const s = await graph(id, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") { console.log(`  ${popis} připraven.`); return; }
    if (s.status_code === "ERROR") throw new Error(`Instagram ${popis} odmítl: ${s.status || "bez detailu"}`);
    if (i === pokusu - 1) {
      throw new Error(`${popis} se do ${Math.round((pokusu * krok) / 1000)} s nepřipravil `
        + `(poslední stav: ${s.status_code || "neznámý"})`);
    }
    await new Promise((r) => setTimeout(r, krok));
  }
}

/**
 * Zveřejní carousel z veřejně dostupných adres obrázků.
 * Vrací ID příspěvku, nebo null v režimu bez publikace.
 */
export async function publikujCarousel(adresy, popisek, { bezPublikace = false } = {}) {
  if (adresy.length < 2 || adresy.length > MAX_SLIDU) {
    throw new Error(`carousel musí mít 2 až ${MAX_SLIDU} obrázků, dostal ${adresy.length}`);
  }

  // Instagram si obrázky stahuje sám, takže musí být v tuhle chvíli veřejné.
  for (const url of adresy) {
    const k = await fetch(url, { method: "HEAD" });
    if (!k.ok) throw new Error(`obrázek není veřejně dostupný (${k.status}) na ${url} — commit se asi nedostal na GitHub`);
  }

  const u = await ucet();
  console.log(`Publikuje se na @${u.username}.`);

  /* Carousel se skládá z kontejneru na každý slide s příznakem
     is_carousel_item a rodiče typu CAROUSEL nad nimi. Popisek patří na rodiče,
     na položce by se zahodil. Pořadí v children určuje pořadí ve feedu. */
  const deti = [];
  for (const [i, url] of adresy.entries()) {
    const k = await graph(`${IG_ID()}/media`, { image_url: url, is_carousel_item: "true" }, "POST");
    console.log(`Slide ${i + 1}: kontejner ${k.id}`);
    await pockejNaKontejner(k.id, `slide ${i + 1}`);
    deti.push(k.id);
  }

  const rodic = await graph(`${IG_ID()}/media`, {
    media_type: "CAROUSEL", children: deti.join(","), caption: popisek,
  }, "POST");
  console.log(`Carousel vytvořen: ${rodic.id}`);
  await pockejNaKontejner(rodic.id, "carousel");

  return zverejni(rodic.id, { bezPublikace });
}

/**
 * Poslední, nevratný krok: z připraveného kontejneru udělá příspěvek.
 * Sdílejí ho carousel i reel — tohle volání se v projektu smí vyskytovat
 * jen tady, aby se pravidla kolem něj nedala omylem obejít.
 */
async function zverejni(kontejnerId, { bezPublikace = false } = {}) {
  if (bezPublikace) {
    console.log("\nRežim bez publikace — kontejner je připravený, poslední krok se neprovádí.");
    console.log("Kdyby to spadlo až tady, chyba by byla v samotném media_publish.");
    return null;
  }

  /* Pauza po FINISHED. Režim „zkouska" ukázal, že kontejner se vytvoří
     i zpracuje v pořádku a padá výhradně media_publish — stav FINISHED tedy
     předbíhá skutečnou připravenost na straně Meta. */
  await new Promise((r) => setTimeout(r, 5000));

  try {
    const post = await graph(`${IG_ID()}/media_publish`, { creation_id: kontejnerId }, "POST");
    console.log(`Zveřejněno. ID příspěvku: ${post.id}`);
    return post.id;
  } catch (chyba) {
    console.log(`První pokus o zveřejnění selhal: ${chyba.message}`);
    /* Než se to zkusí znovu, ověřit, že první volání opravdu neprošlo. POST
       není idempotentní — kdyby se odpověď jen ztratila cestou, druhý pokus
       by vyvěsil tentýž příspěvek podruhé. */
    const posledni = await graph(`${IG_ID()}/media`, { fields: "id,timestamp", limit: "1" });
    const t = posledni.data?.[0]?.timestamp;
    if (t && Date.now() - Date.parse(t) < 5 * 60 * 1000) {
      console.log(`Příspěvek přesto vyšel (${posledni.data[0].id}) — druhý pokus se nedělá.`);
      return posledni.data[0].id;
    }
    console.log("Nic nevyšlo, zkouší se znovu za 15 s…");
    await new Promise((r) => setTimeout(r, 15000));
    const post = await graph(`${IG_ID()}/media_publish`, { creation_id: kontejnerId }, "POST");
    console.log(`Zveřejněno. ID příspěvku: ${post.id}`);
    return post.id;
  }
}

/**
 * Zveřejní reel z veřejně dostupné adresy videa.
 * Vrací ID příspěvku, nebo null v režimu bez publikace.
 *
 * Reel nemůže mít hudbu z katalogu Instagramu — ta jde přidat jen v aplikaci
 * při ručním nahrání. Přes API vyjde s tou zvukovou stopou, kterou má video.
 */
export async function publikujReel(adresa, popisek, { bezPublikace = false } = {}) {
  const k = await fetch(adresa, { method: "HEAD" });
  if (!k.ok) {
    throw new Error(`video není veřejně dostupné (${k.status}) na ${adresa} — `
      + "commit se asi nedostal na GitHub");
  }
  const mb = Number(k.headers.get("content-length") || 0) / 1048576;
  console.log(`Video: ${mb ? `${mb.toFixed(1)} MB` : "neznámá velikost"}.`);

  const u = await ucet();
  console.log(`Publikuje se na @${u.username}.`);

  /* share_to_feed dostane reel i do mřížky profilu; bez něj sedí jen v záložce
     Reels a na profilu po něm není stopa. */
  const kontejner = await graph(`${IG_ID()}/media`, {
    media_type: "REELS", video_url: adresa, caption: popisek, share_to_feed: "true",
  }, "POST");
  console.log(`Kontejner reelu: ${kontejner.id}`);

  /* Instagram si video stáhne a překóduje; u obrázku jsou to vteřiny, tady
     klidně minuty. Proto se čeká až deset minut. */
  await pockejNaKontejner(kontejner.id, "reel", { pokusu: 60, krok: 10000 });

  return zverejni(kontejner.id, { bezPublikace });
}

/** Ověření přístupu, které nic nezveřejní. */
export async function overPristup() {
  const ja = await graph("me", { fields: "id,name" });
  console.log(`Token patří: ${ja.name || "(bez jména)"} (${ja.id})`);

  const stranky = await graph("me/accounts", { fields: "name,instagram_business_account{id,username}" });
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

  const u = await ucet();
  console.log(`\nNastavené IG_USER_ID sedí: @${u.username}.`);
  try {
    const limit = await graph(`${IG_ID()}/content_publishing_limit`, { fields: "quota_usage,config" });
    const q = (limit.data && limit.data[0]) || {};
    console.log(`Publikační kvóta: využito ${q.quota_usage ?? "?"} z ${q.config?.quota_total ?? "?"} za 24 h.`);
  } catch (e) {
    console.log(`Kvótu zjistit nelze (${e.message}) — účet možná nemá povolené publikování přes API.`);
  }
}

/** Veřejná adresa souboru v repozitáři — odtud si ho Instagram stáhne. */
export function surovaAdresa(cesta) {
  const repo = process.env.GITHUB_REPOSITORY || "buuczech/vladomer";
  const vetev = process.env.GITHUB_REF_NAME || "main";
  return `https://raw.githubusercontent.com/${repo}/${vetev}/${cesta}`;
}
