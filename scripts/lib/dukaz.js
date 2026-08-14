/* scripts/lib/dukaz.js — laťka na doklad u stavu „splněno“.
 *
 * Model umí napsat přesvědčivý odstavec o tom, že slib je naplněn, aniž by pro
 * to měl doklad. „Splněno“ je jediný stav, který se nedá vzít zpět bez ztráty
 * důvěry, tak se prověřuje zvlášť: bez dokladu, bez data nebo s datem mimo
 * volební období spadne na „částečně splněno“ — tvrzení o pokroku zůstane,
 * tvrzení o dokončení ne.
 *
 * Bydlí to tady, a ne v evaluate.js, protože podle úplně stejného pravidla se
 * musí dát přepočítat i data, která už jsou na webu. Dvě kopie pravidla by se
 * rozešly a nikdo by si toho nevšiml.
 */

const MESICE = ["ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince"];

/* Data, která text výslovně označuje za den účinnosti. Rozhodovací kroky
   (schválení, podpis, usnesení) sem nepatří — a právě v tom je celý rozdíl,
   který řeší jeUcinnostStarehoPredpisu(). Bere obojí zápis: „1. 1. 2026“
   i „1. ledna 2026“. */
export function dataUcinnosti(dukaz) {
  const t = String(dukaz);
  const out = new Set();
  const cislem = String.raw`(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})`;
  const slovem = String.raw`(\d{1,2})\s*\.\s*(\p{L}+)\s+(\d{4})`;
  /* \p{L} a příznak „u“ jsou tu nutnost, ne elegance: \w je v JavaScriptu jen
     [A-Za-z0-9_], takže na „účinné“ dopasuje kmen a na koncovém „é“ skončí.
     Kontrola pak tiše neplatila pro nic, co má českou koncovku — což je
     v českém právním textu prakticky všechno. */
  const uvod = String.raw`(?:s\s+)?(?:účinn\p{L}*|nabytí\s+účinnosti|platn\p{L}*)\s+(?:od\s+)?`;

  for (const re of [new RegExp(uvod + cislem, "giu"), new RegExp(uvod + slovem, "giu")]) {
    for (const m of t.matchAll(re)) {
      const den = Number(m[1]);
      const mesic = /^\d+$/.test(m[2]) ? Number(m[2]) : MESICE.indexOf(m[2].toLowerCase()) + 1;
      if (!mesic || mesic > 12 || den > 31) continue;
      out.add(`${m[3]}-${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`);
    }
  }
  return out;
}

/** Všechna data v textu, oba zápisy. Bez ohledu na to, co znamenají. */
export function vsechnaData(text) {
  const t = String(text);
  const out = new Set();
  const vzory = [
    /(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/gu,
    /(\d{1,2})\s*\.\s*(\p{L}+)\s+(\d{4})/gu,
  ];
  for (const re of vzory) {
    for (const m of t.matchAll(re)) {
      const den = Number(m[1]);
      const mesic = /^\d+$/.test(m[2]) ? Number(m[2]) : MESICE.indexOf(m[2].toLowerCase()) + 1;
      if (!mesic || mesic > 12 || den > 31) continue;
      out.add(`${m[3]}-${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`);
    }
  }
  return out;
}

/* Chytá záměnu data účinnosti za datum činu: „č. 270/2025 Sb., účinný od
 * 1. ledna 2026“ s datem 2026-01-01 se tváří jako výkon této vlády, ačkoli
 * norma vyšla za té minulé a jediné, co spadá do volebního období, je den,
 * kdy začala platit.
 *
 * Klíčové je rozlišit tohle od NOVELY. Sliby se u nás plní převážně novelami
 * starších zákonů a model běžně cituje jen novelizovaný předpis, ne novelu —
 * „zákon č. 117/1995 Sb. … schválený Sněmovnou 8. 7. 2026“. Dřívější verze
 * porovnávala rok v čísle předpisu s rokem data, takže tenhle úplně běžný
 * případ srážela: tiše podhodnocovala plnění a na webu vznikal rozpor mezi
 * odznakem a komentářem, který u téže položky tvrdil, že slib je naplněn.
 *
 * Podle roku předpisu se to rozlišit nedá — vláda nastoupila 15. prosince,
 * takže „2025“ může být stejně dobře její práce jako práce té předchozí.
 * Ptáme se proto na jinou věc: DRŽÍ TENHLE NÁROK U VOLEBNÍHO OBDOBÍ JENOM
 * DEN, KDY NORMA ZAČALA PLATIT? Když doklad neuvádí žádné jiné datum —
 * schválení, podpis, usnesení — pak za sebou nemá čin této vlády, ať je
 * předpis jakkoli starý nebo nový.
 */
export function jeJenDatumUcinnosti(dukaz, datum) {
  if (!dataUcinnosti(dukaz).has(datum)) return false;
  return [...vsechnaData(dukaz)].every((d) => d === datum);
}

/**
 * Vrátí důvod, proč „splněno“ neobstálo, nebo null.
 * U jiných stavů vrací vždy null — laťka platí jen na „splněno“.
 */
export function duvodDegradace(stav, dukaz, datum, { minDelkaDokladu, nastup }) {
  if (stav !== "fulfilled") return null;

  if (String(dukaz || "").length < minDelkaDokladu) return "no-evidence";
  if (!datum) return "no-date";
  // Zásluha za práci dokončenou před nástupem vlády patří té předchozí,
  // jakkoli dobře téma na slib sedí.
  if (Date.parse(datum) < new Date(nastup).getTime()) return "predates-term";
  // Klíč zůstává „date-mismatch“ kvůli datům, která už jsou venku.
  if (jeJenDatumUcinnosti(dukaz, datum)) return "date-mismatch";
  return null;
}
