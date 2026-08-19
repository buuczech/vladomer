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

/* Doklad, který popisuje ROZDĚLANÝ legislativní proces, ne dokončený.
 *
 * Prompt tohle říká výslovně — „fulfilled POUZE pokud norma prošla CELÝM
 * legislativním procesem" — a model to přesto porušil: bod 14.4 měl stav
 * „splněno" s dokladem „Vláda schválila návrh zákona… směřuje k Poslanecké
 * sněmovně" a v komentáři si pravidlo přepsal na „tímto krokem legislativního
 * procesu je závazek splněn". Instrukce v promptu tedy nestačí a pravidlo
 * patří do kódu.
 *
 * Rozhoduje se dvojicí značek: text musí mluvit o rozpracovanosti A ZÁROVEŇ
 * neuvádět nic, co dokončení dokládá. Bod 10.4 („zákon č. 117/1995 Sb. …
 * schválený Sněmovnou 8. 7. 2026, Senátem 29. 7. 2026") zmiňuje Sněmovnu
 * taky, ale nese i Sbírku a Senát, takže projde.
 */
const ROZDELANO = /(návrh\s+(?:zákona|novely)|směřuje|míří\s+do|čeká\s+na|putuje|prošl\p{L}*\s+vládou|v\s+(?:prvním|druhém|třetím)\s+čtení|projednáv\p{L}*)/iu;
const DOKONCENO = /(\bSb\.|Sbírc\p{L}*|Sbírk\p{L}*|vyhlášen\p{L}*|podepsal|prezident\p{L}*|Senát\p{L}*\s+(?:schválil|schválen\p{L}*|prošel)|nabyl\p{L}*\s+účinnosti)/iu;

export function jeNedokoncenyProces(dukaz) {
  const t = String(dukaz || "");
  return ROZDELANO.test(t) && !DOKONCENO.test(t);
}

/* Kam který důvod stav posune. Dřív to bylo natvrdo „partial" v evaluate.js,
   jenže laťka u „porušeno" musí srážet jinam: obvinění bez dokladu není
   částečné splnění, je to „nevíme, že se to stalo". */
export const CIL_DEGRADACE = {
  "no-evidence": "partial",
  "no-date": "partial",
  "predates-term": "partial",
  "date-mismatch": "partial",
  "not-through-process": "in_progress",
  "broken-no-evidence": "declared",
};

/**
 * Vrátí důvod, proč stav neobstál, nebo null. Kam se stav posune, říká
 * CIL_DEGRADACE.
 *
 * Laťka platí na „splněno“ vždy a na „porušeno“ jen když je zapnutá
 * příznakem latkaPoruseno. To rozlišení je schválně: prompt až do srpna 2026
 * modelu výslovně říkal, že mimo „splněno“ má být doklad prázdný, takže
 * všech devět tehdejších „porušeno“ ho prázdné má a zapnutá laťka by je
 * naráz srazila — přesně ta příliš horlivá zábrana, kterou popisuje
 * CLAUDE.md. Zapíná se až ve chvíli, kdy si o doklad říká i prompt.
 */
export function duvodDegradace(stav, dukaz, datum, { minDelkaDokladu, nastup, latkaPoruseno = false }) {
  const kratky = String(dukaz || "").length < minDelkaDokladu;

  /* Obvinění z porušení slibu je stejně silné tvrzení jako tvrzení o splnění
     a stálo web dvakrát: bod 7.2 označil za porušený slib „neimplementovat
     ETS2“ ve chvíli, kdy ho vláda prokazatelně dodržela. Bez dokladu se
     obvinění nemá o co opřít, tak spadne na „jen deklarováno“. */
  if (stav === "broken") return latkaPoruseno && kratky ? "broken-no-evidence" : null;

  if (stav !== "fulfilled") return null;

  if (kratky) return "no-evidence";
  if (!datum) return "no-date";
  // Zásluha za práci dokončenou před nástupem vlády patří té předchozí,
  // jakkoli dobře téma na slib sedí.
  if (Date.parse(datum) < new Date(nastup).getTime()) return "predates-term";
  // Klíč zůstává „date-mismatch“ kvůli datům, která už jsou venku.
  if (jeJenDatumUcinnosti(dukaz, datum)) return "date-mismatch";
  // Návrh, který teprve míří do Sněmovny, není norma, která prošla.
  if (jeNedokoncenyProces(dukaz)) return "not-through-process";
  return null;
}
