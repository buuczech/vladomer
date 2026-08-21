/* scripts/dev/test-prechody.js — brána přechodů, offline a zdarma.
 *
 *     node scripts/dev/test-prechody.js
 *
 * Fixtury nejsou vymyšlené: 14.1 je skutečná oscilace (pět změn stavu za pět
 * běhů bez jediné události), 6.2 a 14.4 jsou skutečné oprávněné sestupy přes
 * kódové zábrany. Brána musí zastavit to první a propustit to druhé — kdyby
 * dělala jen jedno z toho, je k ničemu.
 */
import { posudPrechod, ZAPADKA, bodyKPrehodnoceni } from "../lib/prechody.js";

const PRIPADY = [
  {
    proc: "14.1 — oscilace: splněno → částečně bez události i dokladu (plný audit)",
    vstup: {
      minuly: { status: "fulfilled" },
      navrh: { status: "partial", change: { cs: "beze změny" } },
      plnyAudit: true,
    },
    ceka: "drzet",
  },
  {
    proc: "kódová zábrana projde vždy (14.4: not-through-process → partial)",
    vstup: {
      minuly: { status: "fulfilled" },
      navrh: { status: "partial", evidenceMissing: "not-through-process", change: { cs: "" } },
      plnyAudit: true,
    },
    ceka: "prijmout",
  },
  {
    proc: "doložený obrat ze splněno jde k ověření, ne rovnou dál",
    vstup: {
      minuly: { status: "fulfilled" },
      navrh: {
        status: "broken", evidenceDate: "2026-09-01",
        change: { cs: "Vláda 1. 9. 2026 nařízení zrušila." },
      },
      plnyAudit: true,
    },
    ceka: "overit",
  },
  {
    proc: "vstup DO splněno jde k ověření (zásluha se nesmí udělit šumem)",
    vstup: {
      minuly: { status: "in_progress" },
      navrh: {
        status: "fulfilled", evidenceDate: "2026-08-28",
        change: { cs: "Zákon vyhlášen ve Sbírce 28. 8. 2026." },
      },
      plnyAudit: true,
    },
    ceka: "overit",
  },
  {
    proc: "odchod z porušeno bez datovaného dokladu se drží (symetrie západky)",
    vstup: {
      minuly: { status: "broken" },
      navrh: { status: "in_progress", change: { cs: "Vláda obnovila jednání." } },
      plnyAudit: true,
    },
    ceka: "drzet",
  },
  {
    proc: "prostřední přechod s popsanou událostí projde (plný audit)",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "Sněmovna zahájila první čtení 3. 9. 2026." } },
      plnyAudit: true,
    },
    ceka: "prijmout",
  },
  {
    proc: "prostřední přechod s „beze změny“ se drží",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "beze změny" } },
      plnyAudit: true,
    },
    ceka: "drzet",
  },
  {
    proc: "delta běh: bod s nalezenou událostí projde",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "Vláda schválila návrh." } },
      udalost: { datum: "2026-09-02" },
      plnyAudit: false,
    },
    ceka: "prijmout",
  },
  {
    proc: "delta běh: přechod bez události se drží, i s výmluvným textem",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "Podle úvahy jde o posun." } },
      udalost: null,
      plnyAudit: false,
    },
    ceka: "drzet",
  },
  {
    proc: "nový bod projde bez brány",
    vstup: { minuly: null, navrh: { status: "declared", change: { cs: "první hodnocení" } } },
    ceka: "prijmout",
  },
  {
    proc: "stejný stav projde (aktualizace textu není přechod)",
    vstup: {
      minuly: { status: "in_progress" },
      navrh: { status: "in_progress", change: { cs: "beze změny" } },
      plnyAudit: true,
    },
    ceka: "prijmout",
  },
  {
    proc: "překlopení unverifiable je taky přechod a bez události se drží",
    vstup: {
      minuly: { status: "declared", unverifiable: false },
      navrh: { status: "declared", unverifiable: true, change: { cs: "beze změny" } },
      plnyAudit: true,
    },
    ceka: "drzet",
  },
];

let spadlo = 0;
for (const p of PRIPADY) {
  const r = posudPrechod(p.vstup);
  const ok = r.akce === p.ceka;
  if (!ok) spadlo++;
  console.log(`${ok ? "ok  " : "CHYBA"} ${p.proc}`);
  if (!ok) console.log(`      čekáno ${p.ceka}, vyšlo ${r.akce} (${r.duvod})`);
}

/* Výběr bodů k přehodnocení v delta běhu. Nový bod bez události tu musí být:
   kdyby vypadl, zůstal by na webu úplně bez hodnocení a konzistence spadne. */
{
  const items = [{ id: "1.1" }, { id: "1.2" }, { id: "1.3" }];
  const vybrane = bodyKPrehodnoceni(items, { "1.2": { datum: "2026-09-01" } }, { "1.1": {}, "1.2": {} })
    .map((i) => i.id);
  const ceka = ["1.2", "1.3"];   // 1.2 má událost, 1.3 je nový
  if (JSON.stringify(vybrane) !== JSON.stringify(ceka)) {
    spadlo++;
    console.log(`CHYBA výběr bodů k přehodnocení: čekáno ${ceka}, vyšlo ${vybrane}`);
  } else {
    console.log("ok   delta bere body s událostí i body bez předchozího hodnocení");
  }
}

if (!ZAPADKA.has("fulfilled") || !ZAPADKA.has("broken") || ZAPADKA.size !== 2) {
  spadlo++;
  console.log("CHYBA západka nekryje přesně { fulfilled, broken }");
} else {
  console.log("ok   západka kryje přesně „splněno“ a „porušeno“");
}

console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${PRIPADY.length + 2} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
