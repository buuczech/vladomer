/* scripts/lib/sbirka.js — rejstřík Sbírky zákonů z otevřeného API e-Sbírky.
 *
 * Model Sbírku nevidí. E-Sbírka je aplikace, jejíž obsah vyhledávače skoro
 * neindexují, a zakonyprolidi.cz robota Anthropicu výslovně blokuje (robots.txt
 * i 403). Čísla předpisů si proto domýšlel: u bodu 10.4 vystřídal za šest týdnů
 * pět čísel a skutečné (152/2026 Sb.) ani jednou, a častěji ještě citoval
 * skutečný předpis, který se bodu netýká (360/2025 u rodičovského příspěvku,
 * vyhlášku o portálu NÚKIB u protidrogové novely).
 *
 * Rejstřík řeší obojí: model dostane seznam předpisů vydaných od nástupu vlády
 * a citovat smí jen z něj, a program každé citované číslo ověří. Zdrojem je
 * stejné API, ze kterého čte aplikace e-Sbírky; jeden dotaz vrátí celý rok.
 *
 * Při výpadku e-Sbírky nic neblokuje: běh pokračuje jako dřív, bez tabulky
 * a bez ověření, a zapíše to do logu.
 */

const API = "https://e-sbirka.gov.cz/sbr-cache";
const WEB = "https://e-sbirka.gov.cz";

/* Druhy předpisů, které slib plní. Sdělení, nálezy Ústavního soudu, rozhodnutí
   a usnesení do tabulky nepatří; když je model přesto cituje, ověří se stejně. */
const DRUHY_DO_TABULKY = new Set(["ústavní zákon", "zákon", "nařízení vlády", "vyhláška"]);

/* Značka předpisu v textu: „č. 152/2026 Sb.", „152/2026 Sb". Stejný tvar jako
   ZNACKA_PREDPISU v lib/dukaz.js, jen bez ohledu na „čerstvost". */
const ZNACKA = /(?:č\.\s*)?(\d{1,4})\s*\/\s*(\d{4})\s+Sb\.?(?!\p{L})/gu;

export function druhPredpisu(nazev) {
  const n = String(nazev || "").trim();
  if (/^Ústavní zákon/i.test(n)) return "ústavní zákon";
  if (/^Zákon/i.test(n)) return "zákon";
  if (/^Nařízení vlády/i.test(n)) return "nařízení vlády";
  if (/^Vyhláška/i.test(n)) return "vyhláška";
  return "jiné";
}

/** Převede odpověď API za jeden rok na seznam předpisů. */
export function predpisyZOdpovedi(json) {
  const vse = [];
  for (const m of (json && json.dokumentySbirkyVMesici) || []) {
    for (const s of m.sbirkyDokumentuSbirky || []) {
      for (const d of s.dokumentySbirkyRejstrikInfo || []) {
        const z = String(d.kodDokumentuSbirky || "").match(/^(\d{1,4})\s*\/\s*(\d{4})/);
        if (!z || !/^\d{4}-\d{2}-\d{2}$/.test(d.datum || "")) continue;
        const nazev = String(d.nazev || "").replace(/\s+/g, " ").trim();
        vse.push({
          kod: `${Number(z[1])}/${z[2]}`,
          druh: druhPredpisu(nazev),
          nazev,
          vyhlaseno: d.datum,
          url: `${WEB}${d.staleUrl || `/sb/${z[2]}/${Number(z[1])}`}`,
        });
      }
    }
  }
  return vse;
}

/**
 * Načte rejstřík za zadané roky. Nikdy nevyhazuje výjimku.
 * @returns { predpisy: Map("152/2026" → předpis) | null, chyba: string | null }
 */
export async function nactiRejstrik({ roky, fetchFn = fetch, timeoutMs = 20000 }) {
  const predpisy = new Map();
  try {
    for (const rok of roky) {
      const res = await fetchFn(`${API}/chronologicke-rejstriky/dokumenty-sbirky-po-mesicich`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ rok }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { predpisy: null, chyba: `rok ${rok}: HTTP ${res.status}` };
      const seznam = predpisyZOdpovedi(await res.json());
      if (!seznam.length) return { predpisy: null, chyba: `rok ${rok}: prázdný seznam` };
      for (const p of seznam) predpisy.set(p.kod, p);
    }
    return { predpisy, chyba: null };
  } catch (e) {
    return { predpisy: null, chyba: String(e && e.message || e).slice(0, 160) };
  }
}

/** Roky, které rejstřík pokrývá — značky z jiných let se ověřit nedají. */
function pokryteRoky(predpisy) {
  const roky = new Set();
  for (const p of predpisy.values()) roky.add(p.kod.split("/")[1]);
  return roky;
}

/**
 * Ověří značky předpisů v textu proti rejstříku. Značky z let, která rejstřík
 * nepokrývá (třeba zákon č. 117/1995 Sb., který novela mění), se přeskočí.
 * @returns { overene: [předpis], neexistujici: ["270/2026"] }
 */
export function overZnacky(text, predpisy) {
  const overene = [], neexistujici = [];
  if (!predpisy) return { overene, neexistujici };
  const roky = pokryteRoky(predpisy);
  const videno = new Set();
  for (const m of String(text || "").matchAll(ZNACKA)) {
    const kod = `${Number(m[1])}/${m[2]}`;
    if (videno.has(kod) || !roky.has(m[2])) continue;
    videno.add(kod);
    const p = predpisy.get(kod);
    if (p) overene.push(p); else neexistujici.push(kod);
  }
  return { overene, neexistujici };
}

/* Předpis, o který doklad „splněno" opírá splnění: z ověřených ten nejnovější.
   Doklad typicky jmenuje novelu i zákony, které mění („152/2026 Sb., kterým se
   mění zákon č. 151/2025 Sb.") — splnění nese ta novela, tedy nejmladší z nich. */
export function hlavniPredpis(overene) {
  return overene.reduce((a, b) => (!a || b.vyhlaseno > a.vyhlaseno ? b : a), null);
}

const DATUM_CS = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;

/**
 * Tabulka pro hodnoticí prompt: předpisy vydané od nástupu vlády, které slib
 * plní (zákony, nařízení vlády, vyhlášky), seřazené podle data vyhlášení.
 * Názvy se zkracují — k poznání tématu stačí začátek a tabulka má i tak
 * kolem 180 řádků.
 */
export function tabulkaRejstriku(predpisy, od, { delkaNazvu = 120 } = {}) {
  const radky = [...predpisy.values()]
    .filter((p) => DRUHY_DO_TABULKY.has(p.druh) && p.vyhlaseno >= String(od).slice(0, 10))
    .sort((a, b) => a.vyhlaseno.localeCompare(b.vyhlaseno) || a.kod.localeCompare(b.kod, "cs", { numeric: true }))
    .map((p) => {
      const n = p.nazev.length > delkaNazvu ? `${p.nazev.slice(0, delkaNazvu).replace(/\s+\S*$/, "")}…` : p.nazev;
      return `- ${p.kod} Sb. | ${p.druh} | vyhlášeno ${DATUM_CS(p.vyhlaseno)} | ${n}`;
    });
  return radky.join("\n");
}

const MESICE = ["ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince"];

/* Datum hned za „vyhlášen(o/a) [ve Sbírce zákonů] [dne]" — jen to, nic jiného.
   Den schválení, podpisu nebo účinnosti zůstává, jak ho model napsal. */
const DATUM_VYHLASENI = /(vyhlášen\p{L}*(?:\s+ve?\s+Sbírc\p{L}*\s+zákonů)?(?:\s+dne)?\s+)(\d{1,2})\s*\.\s*(\d{1,2}|\p{L}+)\s*\.?\s+(\d{4})/gu;

/**
 * Srovná den vyhlášení v textu dokladu s oficiálním datem z e-Sbírky. Bez toho
 * by web pod „splněno" ukázal doklad „vyhlášen 17. září 2026 · 7. 10. 2026" —
 * opravené datum vedle neopraveného tvrzení. Zachová zápis (číslem/slovem).
 * @returns { text, zmeneno }
 */
export function opravDatumVyhlaseni(text, vyhlaseno) {
  let zmeneno = false;
  const [r, m, d] = vyhlaseno.split("-").map(Number);
  const out = String(text || "").replace(DATUM_VYHLASENI, (cele, uvod, den, mesic, rok) => {
    const slovem = !/^\d+$/.test(mesic);
    const mes = slovem ? MESICE.indexOf(mesic.toLowerCase()) + 1 : Number(mesic);
    if (!mes || (Number(den) === d && mes === m && Number(rok) === r)) return cele;
    zmeneno = true;
    return `${uvod}${d}. ${slovem ? MESICE[m - 1] : `${m}.`} ${r}`;
  });
  return { text: out, zmeneno };
}

/** Řádky pro ověřovatele: co o citovaných předpisech říká e-Sbírka. */
export function popisProOverovatele({ overene = [], neexistujici = [] } = {}, rejstrikNacten = true) {
  if (!rejstrikNacten) return "(Rejstřík Sbírky se tentokrát nepodařilo načíst — čísla předpisů program neověřil.)";
  if (!overene.length && !neexistujici.length) return "(Doklad necituje žádný předpis z let, které rejstřík pokrývá.)";
  return [
    ...overene.map((p) => `- ${p.kod} Sb. existuje: „${p.nazev}“, vyhlášeno ${DATUM_CS(p.vyhlaseno)}`),
    ...neexistujici.map((k) => `- ${k} Sb. V E-SBÍRCE NEEXISTUJE`),
  ].join("\n");
}

export { DATUM_CS as datumCs };
