/* scripts/dev/test-zabrany.js — laťka na doklad u „splněno“, offline a zdarma.
 *
 *     node scripts/dev/test-zabrany.js
 *
 * Pravidlo v lib/dukaz.js je čistě textové a jeho selhání je drahé: tiše
 * posune čísla na veřejném webu a nikdo si toho nemusí všimnout týdny. Přesně
 * to se stalo — kontrola srážela běžné novely starších zákonů, takže web
 * podhodnocoval plnění a u téhož bodu ukazoval odznak „částečně splněno“ nad
 * komentářem, který tvrdil, že slib je naplněn.
 *
 * Vzorky níž proto nejsou vymyšlené. Jsou to doslovné doklady z běhu
 * ze 14. 8. 2026, včetně toho, kvůli kterému kontrola vznikla.
 */
import { duvodDegradace } from "../lib/dukaz.js";
import { DATES } from "../../src/data.js";

const PRAVIDLA = { minDelkaDokladu: 20, nastup: DATES.tookOffice };

const PRIPADY = [
  // --- musí projít: čin spadá do volebního období ---------------------------
  {
    proc: "10.4 — novela staršího zákona, datum = schválení Senátem",
    dukaz: "zákon č. 117/1995 Sb., o státní sociální podpoře, schválený Sněmovnou "
      + "8. 7. 2026, Senátem 29. 7. 2026, nábytí účinnosti 1. 10. 2026 pro nově "
      + "narozené děti od 1. 1. 2027",
    datum: "2026-07-29",
    ceka: null,
  },
  {
    proc: "14.1 — starší nařízení, datum = dohoda tripartity",
    dukaz: "Nařízení vlády č. 341/2017 Sb. (valorizace od 1. dubna 2026)",
    datum: "2026-01-22",
    ceka: null,
  },
  {
    proc: "předpis z tohoto období, datum účinnosti je taky v období",
    dukaz: "zákon č. 250/2026 Sb., schválen 3. 3. 2026, účinný od 1. 7. 2026",
    datum: "2026-07-01",
    ceka: null,
  },
  {
    proc: "nelegislativní krok bez čísla předpisu",
    dukaz: "Vláda usnesením ze 4. 2. 2026 zřídila fond a uvolnila 2 mld. Kč, "
      + "peníze rozeslány krajům v březnu 2026",
    datum: "2026-02-04",
    ceka: null,
  },

  // --- musí spadnout ---------------------------------------------------------
  {
    proc: "17.3 — starší zákon, datum = jeho účinnost (převzato z minulé vlády)",
    dukaz: "Zákon o daních z příjmů č. 586/1992 Sb., změny účinné od 1. 1. 2026; "
      + "daňový odpočet zvýšen z 100 % na 150 % do 50 mil. Kč",
    datum: "2026-01-01",
    ceka: "date-mismatch",
  },
  {
    proc: "původní případ, kvůli kterému kontrola vznikla (měsíc slovem)",
    dukaz: "č. 270/2025 Sb., účinný od 1. ledna 2026, zavádí slevu pro rodiny",
    datum: "2026-01-01",
    ceka: "date-mismatch",
  },
  {
    proc: "doklad kratší než minimum",
    dukaz: "schváleno",
    datum: "2026-05-05",
    ceka: "no-evidence",
  },
  {
    proc: "doklad bez data",
    dukaz: "Sněmovna schválila novelu zákona o pobytu cizinců ve třetím čtení",
    datum: "",
    ceka: "no-date",
  },
  {
    proc: "datum před nástupem vlády",
    dukaz: "Zákon č. 74/2024 Sb. nabyl účinnosti 1. 1. 2025, vláda se k němu hlásí",
    datum: "2025-01-01",
    ceka: "predates-term",
  },
];

let spadlo = 0;
for (const p of PRIPADY) {
  const mam = duvodDegradace("fulfilled", p.dukaz, p.datum, PRAVIDLA);
  const ok = mam === p.ceka;
  if (!ok) spadlo++;
  console.log(`${ok ? "ok  " : "CHYBA"} ${p.proc}`);
  if (!ok) console.log(`      čekáno ${p.ceka ?? "beze změny"}, vyšlo ${mam ?? "beze změny"}`);
}

// Laťka platí jen na „splněno“ — nižší stavy se nesmí sráżet ještě níž.
const jineStavy = ["partial", "in_progress", "declared", "not_started", "broken"]
  .filter((s) => duvodDegradace(s, "", "", PRAVIDLA) !== null);
if (jineStavy.length) {
  spadlo++;
  console.log(`CHYBA laťka zasáhla i do stavů: ${jineStavy.join(", ")}`);
} else {
  console.log("ok   laťka se drží jen stavu „splněno“");
}

console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${PRIPADY.length + 1} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
