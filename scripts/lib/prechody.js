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
 * Nad cestami 2 a 3 stojí DOKLAD STARŠÍ NEŽ DOSAVADNÍ STAV. Když model přechod
 * opírá o krok, který se stal dřív, než bod do dosavadního stavu vůbec vstoupil,
 * nejde o novou událost, ale o nový úsudek o známých faktech. V delta běhu se
 * takový přechod drží; v plném auditu se jen označí ke kontrole, protože ten
 * má zmeškané starší události zachytit. Pravidlo dřív hlídal jen ověřovatel
 * a dva týdny po sobě ho ve stejném běhu jednou uplatnil a jednou ne: 18. 9.
 * 2026 zamítl 15.4 a pustil 17.3 i 10.2, 25. 9. zamítl 9.7 a pustil 2.11.
 *
 * Brána NIKDY nemění text ani nezvyšuje stav sama — jen rozhoduje, zda se
 * návrh přijme, ověří, nebo zda bod podrží minulý záznam celý (i s komentářem:
 * nový komentář by argumentoval pro stav, který neprošel).
 */

export const ZAPADKA = new Set(["fulfilled", "broken"]);

/**
 * Den, odkdy bod drží dosavadní stav: nejstarší snímek historie v souvislé řadě
 * snímků se stejným stavem, počítáno od posledního. Ruční oprava snímek téhož
 * dne srovnává s daty, takže s ní výpočet sedí.
 *
 * Když poslední snímek dosavadní stav nenese (stav vznikl v běhu, který snímek
 * nezapsal, protože mu selhala kapitola), vrací null a pravidlo o starém dokladu
 * se nepoužije. Chybný den by byl horší než žádný: mohl by zadržet i skutečnou
 * událost.
 *
 * @param snapshots  history.json → snapshots ({ date, statuses })
 * @returns "YYYY-MM-DD" nebo null
 */
export function stavOd(id, status, snapshots) {
  if (!status || !Array.isArray(snapshots) || !snapshots.length) return null;
  const serazene = [...snapshots].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let od = null;
  for (let i = serazene.length - 1; i >= 0; i--) {
    const s = serazene[i];
    if (!s || !s.statuses || s.statuses[id] !== status) break;
    od = String(s.date).slice(0, 10);
  }
  return od;
}

/**
 * Rozhodne o navrženém záznamu bodu.
 *
 * @param minuly  minulý záznam, nebo null u nového bodu
 * @param navrh   návrh z modelu PO zábranách dukaz.js
 * @param udalost datovaná událost z delta scanu ({datum}), nebo null
 * @param plnyAudit  běh bez delta scanu — událost se dokládá jinak
 * @param stavOd  den, odkdy bod drží dosavadní stav (stavOd() výš), nebo null
 * @param drzetStaryDoklad  delta běh drží přechod opřený o starší doklad
 * @returns { akce: "prijmout" | "overit" | "drzet", duvod, varovani?, detail? }
 *   varovani = přechod neprošel pravidlem o starém dokladu, ale nezadržel se
 *   (plný audit, nebo vypnuté pravidlo) — volající ho vypíše ke kontrole.
 */
export function posudPrechod({
  minuly, navrh, udalost = null, plnyAudit = false, overovatProstredni = false,
  stavOd = null, drzetStaryDoklad = false,
}) {
  if (!minuly) return { akce: "prijmout", duvod: "novy-bod" };

  const meniStav = minuly.status !== navrh.status
    || Boolean(minuly.unverifiable) !== Boolean(navrh.unverifiable);
  if (!meniStav) return { akce: "prijmout", duvod: "stav-drzi" };

  // Deterministická zábrana už rozhodla; brána ji nesmí přebít.
  if (navrh.evidenceMissing) return { akce: "prijmout", duvod: "kodova-zabrana" };

  /* Doklad starší než dosavadní stav. Bez data dokladu se pravidlo nepoužije:
     prostřední přechody datum mít nemusí a jdou dál dosavadní cestou. */
  const doklad = String(navrh.evidenceDate || "").slice(0, 10);
  const staryDoklad = Boolean(stavOd) && /^\d{4}-\d{2}-\d{2}$/.test(doklad) && doklad < stavOd;
  const detail = staryDoklad ? `doklad ${doklad}, stav od ${stavOd}` : undefined;
  if (staryDoklad && drzetStaryDoklad && !plnyAudit) {
    return { akce: "drzet", duvod: "doklad-starsi-nez-stav", detail };
  }
  const oznac = (v) => (staryDoklad ? { ...v, varovani: "doklad-starsi-nez-stav", detail } : v);

  const datovanyDoklad = Boolean(navrh.evidenceDate) || Boolean(udalost && udalost.datum);
  /* V plném auditu delta události neexistují; prostřednímu přechodu stačí,
     že model řekl, co se stalo. „Beze změny" ale změnu stavu nést nemůže. */
  const zmenaText = (navrh.change && (navrh.change.cs || "")).trim();
  const popsanaUdalost = zmenaText && !/^beze změny\.?$/i.test(zmenaText);

  if (ZAPADKA.has(minuly.status) || ZAPADKA.has(navrh.status)) {
    if (!datovanyDoklad) return { akce: "drzet", duvod: "zapadka-bez-datovaneho-dokladu" };
    return oznac({ akce: "overit", duvod: "zapadka" });
  }

  const maUdalost = plnyAudit
    ? (datovanyDoklad || popsanaUdalost)   // plný audit: doklad, nebo popsaná událost
    : Boolean(udalost);                    // delta běh: bod má nalezenou událost
  if (!maUdalost) return oznac({ akce: "drzet", duvod: "prechod-bez-udalosti" });
  /* Měření z 22. 8.: sken se sám se sebou shodne jen z 55 % v tom, kterých
     bodů se dotkne — web search vrací pokaždé jiný výsek. Událost tedy sama
     o sobě neznamená, že se opravdu něco stalo; druhý model to přečte. */
  if (overovatProstredni) return oznac({ akce: "overit", duvod: "prostredni-prechod" });
  return oznac({ akce: "prijmout", duvod: "dolozena-udalost" });
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
