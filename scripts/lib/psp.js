/* scripts/lib/psp.js — otevřená data Poslanecké sněmovny (spec 006).
 *
 * Kontrola faktů neuměla dvě věci, které Sněmovna zveřejňuje jako úřední
 * záznam: ověřit tvrzení, že návrh zákona NEBYL předložen (v měření
 * 20. 10. 2026 nejčastější důvod, proč bod zůstal „neověřený“), a ověřit
 * data kroků legislativního procesu („Sněmovna schválila 8. 7.“). Model je
 * hádal z novin. Sněmovna přitom denně zveřejňuje všechny tisky i s celou
 * historií (www.psp.cz/sqw/hp.sqw?k=1300, dokumentace tabulek k=1303).
 *
 * Program si data načte jednou za běh, stejně jako rejstřík e-Sbírky
 * (lib/sbirka.js): ZIP s tabulkami ve formátu UNL (řádek = záznam, pole
 * oddělená „|“, zpětné lomítko ruší zvláštní význam dalšího znaku, kódování
 * windows-1250). Žádná nová závislost: ZIP se rozbaluje přes node:zlib.
 * Při výpadku se nic nesoudí a výstup řekne proč — jako u e-Sbírky.
 */
import { inflateRawSync } from "node:zlib";

export const URL_TISKY = "https://www.psp.cz/eknih/cdrom/opendata/tisky.zip";
/* Číslo volebního období pro odkazy na psp.cz (o=…) podle id_org_obd z dat.
   Nové období přidat sem; neznámé se odkáže jako nejnovější známé. */
const CISLO_OBDOBI = { 173: 9, 174: 10 };

/** Rozbalí ZIP (metody stored a deflate). @returns Map(jméno → Buffer) */
export function rozbalZip(buf) {
  let konec = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { konec = i; break; }
  }
  if (konec < 0) throw new Error("ZIP: chybí konec centrálního adresáře");
  const pocet = buf.readUInt16LE(konec + 10);
  let p = buf.readUInt32LE(konec + 16);
  const out = new Map();
  for (let i = 0; i < pocet; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP: poškozený centrální adresář");
    const metoda = buf.readUInt16LE(p + 10);
    const velikost = buf.readUInt32LE(p + 20);
    const nJm = buf.readUInt16LE(p + 28), nEx = buf.readUInt16LE(p + 30), nKom = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const jmeno = buf.toString("latin1", p + 46, p + 46 + nJm);
    const od = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const data = buf.subarray(od, od + velikost);
    if (metoda === 0) out.set(jmeno, data);
    else if (metoda === 8) out.set(jmeno, inflateRawSync(data));
    p += 46 + nJm + nEx + nKom;
  }
  return out;
}

/** Tabulka UNL → pole záznamů (pole řetězců). Zpětné lomítko ruší zvláštní význam „|“, „\“ i konce řádku. */
export function unl(text) {
  const radky = [];
  let zaznam = [], pole = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) { pole += text[++i]; continue; }
    if (c === "|") { zaznam.push(pole); pole = ""; continue; }
    if (c === "\r" && text[i + 1] === "\n") continue;
    if (c === "\n") {
      if (zaznam.length || pole) radky.push(zaznam.concat(pole ? [pole] : []));
      zaznam = []; pole = "";
      continue;
    }
    pole += c;
  }
  if (zaznam.length || pole) radky.push(zaznam.concat(pole ? [pole] : []));
  return radky;
}

const iso = (d) => {
  const s = String(d || "").trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const MESICE = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
export const datumCs = (d) => { if (!d) return "?"; const [r, m, den] = d.split("-").map(Number); return `${den}. ${MESICE[m - 1]} ${r}`; };

/**
 * Model tisků jednoho volebního období z tabulek (dokumentace www.psp.cz/sqw/hp.sqw?k=1303).
 * @param texty Map(jméno souboru → text v UTF-16, tj. už dekódovaný z windows-1250)
 * @param obdobi id_org_obd; výchozí = období posledně předloženého tisku
 * @returns { obdobi, cisloObdobi, tisky: [tisk], podleSb: Map("90/2026" → tisk) }
 *   tisk = { ct, druh, navrhovatel, nazev, uplnyNazev, predlozeno, stadium, kroky: [{ datum, akce, stav, sb, vyhlaseno }] }
 */
export function modelTisku(texty, { obdobi = null } = {}) {
  const t = (n) => unl(texty.get(n) || "");
  const druh = Object.fromEntries(t("druh_tisku.unl").map((r) => [r[0], r[2]]));
  const typStavu = Object.fromEntries(t("typ_stavu.unl").map((r) => [r[0], r[1]]));
  const stavy = Object.fromEntries(t("stavy.unl").map((r) => [r[0], { typ: typStavu[r[1]] || "", popis: r[3] || "" }]));
  const akce = Object.fromEntries(t("typ_akce.unl").map((r) => [r[0], r[1]]));
  const prechody = Object.fromEntries(t("prechody.unl").map((r) => [r[0], { kam: r[2], akce: akce[r[3]] || "" }]));
  const radky = t("tisky.unl");
  if (!obdobi) {
    const posledni = radky.reduce((a, r) => ((iso(r[11]) || "") > (iso(a && a[11]) || "") && iso(r[11]) <= new Date().toISOString().slice(0, 10) ? r : a), null);
    obdobi = posledni ? posledni[7] : null;
  }
  const tisky = new Map();
  for (const r of radky) {
    if (r[7] !== obdobi || r[23] === "1" || r[23] === "2") continue; // jiné období nebo odvolaný tisk
    const stav = stavy[r[2]] || { typ: "", popis: "" };
    tisky.set(r[0], {
      ct: Number(r[3]), druh: druh[r[1]] || "", navrhovatel: r[9] || "", nazev: r[10] || "", uplnyNazev: r[15] || "",
      predlozeno: iso(r[11]), stadium: stav.typ || stav.popis, kroky: [],
    });
  }
  const hist = t("hist.unl").filter((r) => tisky.has(r[1])).sort((a, b) => Number(a[0]) - Number(b[0]));
  const podleSb = new Map();
  for (const r of hist) {
    const tisk = tisky.get(r[1]);
    const prechod = prechody[r[4]] || {};
    const datum = iso(r[2]);
    /* zaver_sb_cislo platí jen u kroku, kterým projednávání skončilo
       vyhlášením. Jinde sloupec nese jiné číslo: krok „změna lhůty pozmň.
       návrhu“ tisků 189 a 198 v něm má 7 — bez téhle podmínky z toho byl
       „předpis 7/2026 Sb.“ v textu pro kontrolu faktů. */
    const konci = iso(r[11]) || (stavy[prechod.kam] || {}).typ === "KONEC";
    const sb = r[13] && konci ? `${Number(r[13])}/${(datum || "").slice(0, 4)}` : null;
    tisk.kroky.push({ datum, akce: prechod.akce || "", stav: (stavy[prechod.kam] || {}).typ || "", sb, vyhlaseno: iso(r[11]) });
    if (sb) podleSb.set(sb, tisk);
  }
  return { obdobi, cisloObdobi: CISLO_OBDOBI[obdobi] || Math.max(...Object.values(CISLO_OBDOBI)), tisky: [...tisky.values()].sort((a, b) => a.ct - b.ct), podleSb };
}

/** Načte tisky ze Sněmovny. Nikdy nevyhazuje výjimku. @returns { model, chyba } */
export async function nactiTisky({ fetchFn = fetch, timeoutMs = 60000, obdobi = null } = {}) {
  try {
    const res = await fetchFn(URL_TISKY, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { model: null, chyba: `HTTP ${res.status}` };
    const soubory = rozbalZip(Buffer.from(await res.arrayBuffer()));
    const dek = new TextDecoder("windows-1250");
    const texty = new Map([...soubory].filter(([, b]) => b).map(([n, b]) => [n, dek.decode(b)]));
    const model = modelTisku(texty, { obdobi });
    if (!model.tisky.length) return { model: null, chyba: "v datech nejsou tisky aktuálního období" };
    return { model, chyba: null };
  } catch (e) {
    return { model: null, chyba: String(e && e.message || e).slice(0, 160) };
  }
}

const NAVRHY_ZAKONU = new Set(["Vládní návrh zákona", "Návrh zákona", "Státní rozpočet"]);
const odkaz = (model, ct) => `https://www.psp.cz/sqw/historie.sqw?o=${model.cisloObdobi}&t=${ct}`;

/** Zdroj pro kontrolu faktů: úplný průběh tisku, kterým vznikl citovaný předpis. */
export function zdrojTisku(model, tisk) {
  const kroky = tisk.kroky.filter((k) => k.akce || k.sb).map((k) => `${k.datum ? `${datumCs(k.datum)} ` : ""}${k.akce}${k.stav ? ` (${k.stav})` : ""}${k.sb ? `, vyhlášeno ve Sbírce zákonů pod č. ${k.sb} Sb.${k.vyhlaseno ? ` dne ${datumCs(k.vyhlaseno)}` : ""}` : ""}`);
  return {
    url: odkaz(model, tisk.ct),
    text: `Poslanecká sněmovna, otevřená data (úřední záznam, načetl program): sněmovní tisk ${tisk.ct} — ${tisk.nazev}${tisk.uplnyNazev ? ` (${tisk.uplnyNazev})` : ""}. Druh: ${tisk.druh}. Předkladatel: ${tisk.navrhovatel}. Předloženo ${datumCs(tisk.predlozeno)}. Průběh: ${kroky.join("; ") || "—"}. Současné stádium: ${tisk.stadium || "—"}.`,
  };
}

/* Úplný seznam návrhů zákonů období. Věta o úplnosti je to, co model cituje,
   když ověřuje, že návrh předložen nebyl — prompt-faktcheck.md to popisuje. */
export const VETA_UPLNOSTI = "Návrh, který v seznamu není, Sněmovně v tomto období předložen nebyl.";
/* U tisku, ze kterého vzešel předpis, stojí i jeho číslo ve Sbírce: stádium
   „KONEC“ samo neříká, jestli návrh skončil vyhlášením, nebo zamítnutím. */
export function zdrojSeznamu(model, kDatu) {
  const vyhlaseni = (t) => { const k = t.kroky.find((x) => x.sb); return k ? `; vyhlášeno ve Sbírce zákonů jako č. ${k.sb} Sb.${k.vyhlaseno ? ` dne ${datumCs(k.vyhlaseno)}` : ""}` : ""; };
  const radky = model.tisky.filter((t) => NAVRHY_ZAKONU.has(t.druh))
    .map((t) => `tisk ${t.ct} — ${t.nazev} (${t.druh === "Vládní návrh zákona" ? "vláda" : t.navrhovatel}; předloženo ${datumCs(t.predlozeno)}; stádium: ${t.stadium || "—"}${vyhlaseni(t)})`);
  return {
    url: `https://www.psp.cz/sqw/sntisk.sqw?o=${model.cisloObdobi}`,
    text: `Poslanecká sněmovna, otevřená data k ${datumCs(kDatu)}: úplný seznam návrhů zákonů předložených Sněmovně v ${model.cisloObdobi}. volebním období (vládních, poslaneckých, senátních i krajských), ${radky.length} tisků. ${VETA_UPLNOSTI}\n${radky.join("\n")}`,
  };
}
