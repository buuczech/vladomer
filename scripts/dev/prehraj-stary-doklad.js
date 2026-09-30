/* scripts/dev/prehraj-stary-doklad.js — přehrání pravidla „doklad starší než
 * dosavadní stav" nad všemi přechody v audit.json. Nic nemění, nic nestojí.
 *
 *     node scripts/dev/prehraj-stary-doklad.js
 *
 * Stejná myšlenka jako prehraj-zabrany.js: před změnou pravidla a po ní se
 * výstupy porovnají a rozdíl je celý přínos i celá cena té změny. Den vstupu do
 * stavu se počítá tou samou funkcí jako v ostrém běhu (stavOd z lib/prechody.js)
 * nad snímky historie, které existovaly PŘED daným během.
 *
 * Přechod = stav, který běh zapsal, se liší od stavu, se kterým do běhu vstoupil.
 * Vstupní stav bere ručně opravený řádek předchozího dne, pokud existuje (s tím
 * běh doopravdy začínal); zapsaný stav bere původní řádek běhu, ne pozdější opravu
 * (ta vyjadřuje ruční zásah, ne rozhodnutí brány).
 *
 * Slepá místa: audit.json neukládá evidenceMissing, takže snížení kódovou
 * zábranou (třeba 10.4 přes sbirka-bez-uredniho-zdroje), které v ostrém běhu
 * pravidlem prochází vždycky, se tu může ukázat jako „zadrží". A z auditu se
 * nepozná, jestli šlo o delta běh, nebo o plný audit: řádek „zadrží" platí pro
 * delta běh, plný audit by přechod jen označil ke kontrole.
 */
import { readFileSync } from "node:fs";
import { stavOd } from "../lib/prechody.js";

const audit = JSON.parse(readFileSync(new URL("../../public/audit.json", import.meta.url), "utf8")).entries;
const snimky = JSON.parse(readFileSync(new URL("../../public/history.json", import.meta.url), "utf8")).snapshots || [];

const den = (r) => String(r.date).slice(0, 10);
const puvodni = {}, opravene = {};
for (const r of audit) {
  const cil = r.oprava ? opravene : puvodni;
  (cil[r.id] ||= {})[den(r)] = r;
}

const vysledek = [];
for (const [id, dny] of Object.entries(puvodni)) {
  const data = Object.keys(dny).sort();
  for (let i = 1; i < data.length; i++) {
    const d = data[i];
    const vstup = (opravene[id] && opravene[id][data[i - 1]]) || dny[data[i - 1]];
    const zapsano = dny[d];
    if (vstup.status === zapsano.status && Boolean(vstup.unverifiable) === Boolean(zapsano.unverifiable)) continue;
    const od = stavOd(id, vstup.status, snimky.filter((s) => String(s.date).slice(0, 10) < d));
    const doklad = String(zapsano.evidence_date || "").slice(0, 10);
    const stary = Boolean(od) && /^\d{4}-\d{2}-\d{2}$/.test(doklad) && doklad < od;
    vysledek.push({
      d, id, z: vstup.status, na: zapsano.status, od, doklad, stary,
      opraveno: Boolean(opravene[id] && opravene[id][d]),
      evidence: String(zapsano.evidence || "").slice(0, 100),
    });
  }
}
vysledek.sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id, "cs", { numeric: true }));

for (const v of vysledek) {
  console.log(`${v.d}  ${v.id.padEnd(5)} ${(v.z + " → " + v.na).padEnd(26)} stav od ${v.od || "neznámo   "}`
    + `  doklad ${(v.doklad || "—").padEnd(10)}  ${v.stary ? "ZADRŽÍ" : "projde"}${v.opraveno ? "  [později ručně opraveno]" : ""}`);
  if (v.stary) console.log(`      ${v.evidence}`);
}
/* Do 28. 8. 2026 se každý týden přehodnocovalo všech 143 bodů od nuly — tam by
   pravidlo přechody jen označilo, stejně jako dnes v plném auditu. Řádky auditu
   z 28. 8. zapsal až pozdní delta běh ve 20:40, proto patří do delta éry. */
const DELTA_OD = "2026-08-28";
const souhrn = (seznam) => `${seznam.length} přechodů, se starším dokladem ${seznam.filter((v) => v.stary).length}`;
console.log(`\nDelta éra (od ${DELTA_OD}): ${souhrn(vysledek.filter((v) => v.d >= DELTA_OD))} — ty by pravidlo zadrželo.`);
console.log(`Dřív (plné přehodnocení každý týden): ${souhrn(vysledek.filter((v) => v.d < DELTA_OD))} — ty by jen označilo.`);
console.log("Snížení kódovou zábranou v ostrém běhu projde vždy (viz slepá místa v hlavičce).");
