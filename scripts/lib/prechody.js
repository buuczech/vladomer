/* scripts/lib/prechody.js — brána přechodů mezi stavy.
 *
 * Tohle je odpověď na oscilaci hodnocení: bod 14.1 změnil stav pětkrát za pět
 * běhů, aniž se ve světě cokoli stalo — model si každý pátek znovu losoval
 * úsudek „je 9 % ‚výrazné zvýšení'?". Brána říká, že stav se smí pohnout jen
 * tehdy, když pro pohyb existuje důvod, který jde ukázat.
 *
 * Tři cesty přechodu, od nejsilnější:
 *
 *   1. KÓDOVÁ ZÁBRANA (lib/dukaz.js) — deterministická degradace projde vždy.
 *      Oba dosud oprávněné odchody ze „splněno" (6.2, 14.4) byly právě tohohle
 *      druhu. Pozná se podle evidenceMissing na návrhu.
 *
 *   2. ZÁPADKA na „splněno" a „porušeno" (symetricky — zásluha ani obvinění
 *      se nesmí ztratit potichu): přechod z NEBO do těchto stavů vyžaduje
 *      datovaný doklad a ještě projde ověřením druhým modelem (evaluate.js,
 *      výchozí odpověď NE).
 *
 *   3. PŘECHODY MEZI PROSTŘEDNÍMI STAVY (deklarováno ↔ probíhá ↔ částečně…)
 *      stačí doložená událost — bez ní se stav drží. Druhý model se na ně
 *      neplatí: chyba tu stojí málo a událost + temperature 0 šum tlumí.
 *
 * Brána NIKDY nemění text ani nezvyšuje stav sama — jen rozhoduje, zda se
 * návrh přijme, ověří, nebo zda bod podrží minulý záznam celý (i s komentářem:
 * nový komentář by argumentoval pro stav, který neprošel).
 */

export const ZAPADKA = new Set(["fulfilled", "broken"]);

/**
 * Rozhodne o navrženém záznamu bodu.
 *
 * @param minuly  minulý záznam, nebo null u nového bodu
 * @param navrh   návrh z modelu PO zábranách dukaz.js
 * @param udalost datovaná událost z delta scanu ({datum}), nebo null
 * @param plnyAudit  běh bez delta scanu — událost se dokládá jinak
 * @returns { akce: "prijmout" | "overit" | "drzet", duvod }
 */
export function posudPrechod({ minuly, navrh, udalost = null, plnyAudit = false, overovatProstredni = false }) {
  if (!minuly) return { akce: "prijmout", duvod: "novy-bod" };

  const meniStav = minuly.status !== navrh.status
    || Boolean(minuly.unverifiable) !== Boolean(navrh.unverifiable);
  if (!meniStav) return { akce: "prijmout", duvod: "stav-drzi" };

  // Deterministická zábrana už rozhodla; brána ji nesmí přebít.
  if (navrh.evidenceMissing) return { akce: "prijmout", duvod: "kodova-zabrana" };

  const datovanyDoklad = Boolean(navrh.evidenceDate) || Boolean(udalost && udalost.datum);
  /* V plném auditu delta události neexistují; prostřednímu přechodu stačí,
     že model řekl, co se stalo. „Beze změny" ale změnu stavu nést nemůže. */
  const zmenaText = (navrh.change && (navrh.change.cs || "")).trim();
  const popsanaUdalost = zmenaText && !/^beze změny\.?$/i.test(zmenaText);

  if (ZAPADKA.has(minuly.status) || ZAPADKA.has(navrh.status)) {
    if (!datovanyDoklad) return { akce: "drzet", duvod: "zapadka-bez-datovaneho-dokladu" };
    return { akce: "overit", duvod: "zapadka" };
  }

  const maUdalost = plnyAudit
    ? (datovanyDoklad || popsanaUdalost)   // plný audit: doklad, nebo popsaná událost
    : Boolean(udalost);                    // delta běh: bod má nalezenou událost
  if (!maUdalost) return { akce: "drzet", duvod: "prechod-bez-udalosti" };
  /* Měření z 22. 8.: sken se sám se sebou shodne jen z 55 % v tom, kterých
     bodů se dotkne — web search vrací pokaždé jiný výsek. Událost tedy sama
     o sobě neznamená, že se opravdu něco stalo; druhý model to přečte. */
  if (overovatProstredni) return { akce: "overit", duvod: "prostredni-prechod" };
  return { akce: "prijmout", duvod: "dolozena-udalost" };
}

/**
 * Které body delta běh pošle k přehodnocení.
 *
 * Bod s nalezenou událostí — o tom je celý delta režim. A bod BEZ předchozího
 * hodnocení, i když událost nemá: nemá co držet a bez hodnocení by na webu
 * chyběl úplně (kontrola konzistence [A] to hlásí jako chybu). Týká se nově
 * přidaných bodů v src/data.js.
 */
export function bodyKPrehodnoceni(items, udalosti, prevEvals) {
  return items.filter((it) => (udalosti && udalosti[it.id]) || !prevEvals[it.id]);
}
