/* scripts/dev/test-prechody.js — brána přechodů, offline a zdarma.
 *
 *     node scripts/dev/test-prechody.js
 *
 * Fixtury nejsou vymyšlené: 14.1 je skutečná oscilace (pět změn stavu za pět
 * běhů bez jediné události), 6.2 a 14.4 jsou skutečné oprávněné sestupy přes
 * kódové zábrany. Brána musí zastavit to první a propustit to druhé — kdyby
 * dělala jen jedno z toho, je k ničemu.
 */
import { posudPrechod, ZAPADKA, bodyKPrehodnoceni, stavOd } from "../lib/prechody.js";

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
  /* Ověřování prostředních přechodů (od 22. 8. 2026). Sken se sám se sebou
     shodne jen z 55 % v tom, kterých bodů se dotkne, takže „něco se našlo"
     samo o sobě posun nezakládá — čte to druhý model. */
  {
    proc: "zapnuté ověřování: prostřední přechod s událostí jde k ověření",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "Návrh šel do připomínkového řízení." } },
      udalost: { datum: "2026-08-18" },
      plnyAudit: false,
      overovatProstredni: true,
    },
    ceka: "overit",
  },
  {
    proc: "zapnuté ověřování NEOBCHÁZÍ zábranu: bez události se pořád drží",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "Podle úvahy jde o posun." } },
      udalost: null,
      plnyAudit: false,
      overovatProstredni: true,
    },
    ceka: "drzet",
  },
  {
    proc: "zapnuté ověřování nemění kódovou zábranu (ta projde vždy)",
    vstup: {
      minuly: { status: "fulfilled" },
      navrh: { status: "partial", evidenceMissing: "predates-term", change: { cs: "" } },
      plnyAudit: true,
      overovatProstredni: true,
    },
    ceka: "prijmout",
  },
  {
    proc: "vypnuté ověřování: prostřední přechod s událostí projde rovnou",
    vstup: {
      minuly: { status: "declared" },
      navrh: { status: "in_progress", change: { cs: "Návrh šel do připomínkového řízení." } },
      udalost: { datum: "2026-08-18" },
      plnyAudit: false,
      overovatProstredni: false,
    },
    ceka: "prijmout",
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

/* Doklad starší než dosavadní stav. Fixtury jsou skutečné přechody, které brána
   přijala v delta éře (28. 8. – 25. 9. 2026): 17.3 a 10.2 byly chyby opravené
   ručně, 2.11 šum se stejným dokladem jako týden předtím, 15.5 nesmyslný doklad
   („vláda Fialy v únoru 2026"). 15.6 a 8.7 musí projít dál jako dosud a 10.4
   (kódová zábrana) vždycky. */
let dalsichKontrol = 0;
function overStary(proc, vstup, ceka) {
  dalsichKontrol++;
  const r = posudPrechod({ overovatProstredni: true, drzetStaryDoklad: true, ...vstup });
  const potize = [];
  if (r.akce !== ceka.akce) potize.push(`akce: čekáno ${ceka.akce}, vyšlo ${r.akce}`);
  if (ceka.duvod && r.duvod !== ceka.duvod) potize.push(`důvod: čekáno ${ceka.duvod}, vyšlo ${r.duvod}`);
  if (Boolean(ceka.varovani) !== Boolean(r.varovani)) potize.push(`varování: čekáno ${Boolean(ceka.varovani)}, vyšlo ${r.varovani || "—"}`);
  if (potize.length) spadlo++;
  console.log(`${potize.length ? "CHYBA" : "ok  "} ${proc}`);
  potize.forEach((t) => console.log(`      ${t}`));
}
const delta = { plnyAudit: false, udalost: { datum: "2026-09-15" } };

overStary("17.3 (delta): částečně → splněno na zákonu z 2025, stav od 14. 8. → drží se",
  { ...delta, stavOd: "2026-08-14", minuly: { status: "partial" },
    navrh: { status: "fulfilled", evidenceDate: "2026-01-01", change: { cs: "Pokračuje implementace." } } },
  { akce: "drzet", duvod: "doklad-starsi-nez-stav" });
overStary("10.2 (delta): probíhá → porušeno na výroku z 20. 7., stav od 21. 8. → drží se",
  { ...delta, stavOd: "2026-08-21", minuly: { status: "in_progress" },
    navrh: { status: "broken", evidenceDate: "2026-07-20", change: { cs: "Vláda schválila novelu bez valorizace." } } },
  { akce: "drzet", duvod: "doklad-starsi-nez-stav" });
overStary("2.11 (delta): probíhá → částečně na JMHZ z 1. 4., stav od 21. 8. → drží se",
  { ...delta, stavOd: "2026-08-21", minuly: { status: "in_progress" },
    navrh: { status: "partial", evidenceDate: "2026-04-01", change: { cs: "JMHZ plně funkční." } } },
  { akce: "drzet", duvod: "doklad-starsi-nez-stav" });
overStary("15.5 (delta): nezahájeno → deklarováno na dokladu z února, stav od 3. 8. → drží se",
  { ...delta, stavOd: "2026-08-03", minuly: { status: "not_started" },
    navrh: { status: "declared", evidenceDate: "2026-02-17", change: { cs: "Vláda deklarovala plán." } } },
  { akce: "drzet", duvod: "doklad-starsi-nez-stav" });
overStary("15.6 (delta): deklarováno → probíhá na kroku z 15. 9., stav od 14. 8. → k ověření jako dosud",
  { ...delta, stavOd: "2026-08-14", minuly: { status: "declared" },
    navrh: { status: "in_progress", evidenceDate: "2026-09-15", change: { cs: "Vláda schválila přípravu plánu." } } },
  { akce: "overit", duvod: "prostredni-prechod" });
overStary("8.7 (delta): prostřední přechod bez data dokladu → pravidlo se nepoužije",
  { ...delta, stavOd: "2026-08-21", minuly: { status: "partial" },
    navrh: { status: "declared", change: { cs: "Rozpočet počítá s 50 %." } } },
  { akce: "overit", duvod: "prostredni-prechod" });
overStary("10.4: kódová zábrana projde vždy, i se starším dokladem",
  { ...delta, stavOd: "2026-08-21", minuly: { status: "fulfilled" },
    navrh: { status: "partial", evidenceDate: "2026-08-14", evidenceMissing: "sbirka-bez-uredniho-zdroje" } },
  { akce: "prijmout", duvod: "kodova-zabrana" });
overStary("doklad ze dne vstupu do stavu není starší (porovnává se ostře)",
  { ...delta, stavOd: "2026-08-21", minuly: { status: "declared" },
    navrh: { status: "in_progress", evidenceDate: "2026-08-21", change: { cs: "Vláda schválila návrh." } } },
  { akce: "overit", duvod: "prostredni-prechod" });
overStary("neznámý den vstupu (stavOd null) → pravidlo se nepoužije",
  { ...delta, stavOd: null, minuly: { status: "partial" },
    navrh: { status: "fulfilled", evidenceDate: "2026-01-01", change: { cs: "x" } } },
  { akce: "overit", duvod: "zapadka" });
overStary("vypnuté pravidlo: delta přechod nezadrží, jen ho označí ke kontrole",
  { ...delta, drzetStaryDoklad: false, stavOd: "2026-08-21", minuly: { status: "in_progress" },
    navrh: { status: "partial", evidenceDate: "2026-04-01", change: { cs: "JMHZ plně funkční." } } },
  { akce: "overit", varovani: true });
overStary("plný audit: 12.6 se starším dokladem se NEZADRŽÍ, jen označí ke kontrole",
  { plnyAudit: true, stavOd: "2026-08-03", minuly: { status: "not_started" },
    navrh: { status: "partial", evidenceDate: "2026-02-09", change: { cs: "Vláda 9. 2. 2026 schválila nařízení." } } },
  { akce: "overit", duvod: "prostredni-prechod", varovani: true });
overStary("plný audit: přechod do splněno se starším dokladem jde k ověření a je označený",
  { plnyAudit: true, stavOd: "2026-08-14", minuly: { status: "partial" },
    navrh: { status: "fulfilled", evidenceDate: "2026-01-01", change: { cs: "x" } } },
  { akce: "overit", duvod: "zapadka", varovani: true });

/* Den vstupu do dosavadního stavu ze snímků historie. 17.3 po ruční opravě
   18. 9. 2026: snímek téhož dne nese zase „částečně", řada tedy začíná 14. 8. */
{
  const sn = (datum, st) => ({ date: datum, statuses: { "17.3": st } });
  const historie = [sn("2026-09-18", "partial"), sn("2026-08-07", "in_progress"), sn("2026-08-14", "partial"),
    sn("2026-08-21", "partial"), sn("2026-09-11", "partial")];   // schválně neseřazené
  const pripady = [
    ["řada po ruční opravě začíná 14. 8. (i z neseřazených snímků)", stavOd("17.3", "partial", historie), "2026-08-14"],
    ["poslední snímek nese jiný stav → neznámo (null)", stavOd("17.3", "fulfilled", historie), null],
    ["bez historie → neznámo (null)", stavOd("17.3", "partial", []), null],
    ["bod, který ve snímcích není → neznámo (null)", stavOd("9.9", "partial", historie), null],
  ];
  for (const [proc, vyslo, ceka] of pripady) {
    dalsichKontrol++;
    const ok = vyslo === ceka;
    if (!ok) spadlo++;
    console.log(`${ok ? "ok  " : "CHYBA"} stavOd: ${proc}`);
    if (!ok) console.log(`      čekáno ${ceka}, vyšlo ${vyslo}`);
  }
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

console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${PRIPADY.length + dalsichKontrol + 2} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
