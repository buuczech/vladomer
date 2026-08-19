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
import { duvodDegradace, CIL_DEGRADACE } from "../lib/dukaz.js";
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
  {
    proc: "14.4 — návrh teprve míří do Sněmovny (skutečný doklad z 14. 8. 2026)",
    dukaz: "Vláda schválila návrh zákona na zasedání 15. června 2026; norma již "
      + "prošla vládou a směřuje k Poslanecké sněmovně",
    datum: "2026-06-15",
    ceka: "not-through-process",
  },
  {
    proc: "návrh v prvním čtení",
    dukaz: "Poslanecká sněmovna projednává vládní návrh novely v prvním čtení, "
      + "hlasování 12. 5. 2026",
    datum: "2026-05-12",
    ceka: "not-through-process",
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

/* Laťka smí sáhnout jen na „splněno“ a — když je zapnutá — na „porušeno“.
   Ostatní stavy se nesmí srážet nikdy: „probíhá“ bez dokladu je legitimní
   popis rozdělané práce, ne tvrzení, které by se mělo dokládat. */
const NEDOTKNUTELNE = ["partial", "in_progress", "declared", "not_started"];
const zasazene = NEDOTKNUTELNE
  .filter((s) => duvodDegradace(s, "", "", { ...PRAVIDLA, latkaPoruseno: true }) !== null);
if (zasazene.length) {
  spadlo++;
  console.log(`CHYBA laťka zasáhla i do stavů: ${zasazene.join(", ")}`);
} else {
  console.log("ok   laťka se nedotkne stavů mezi „splněno“ a „porušeno“");
}

/* „Porušeno“ je obvinění a bez dokladu nemá o co se opřít. Laťka je ale
   vypnutá, dokud si o doklad neřekne i prompt — zapnutá dřív by srazila
   devět hodnocení, jejichž doklad je prázdný podle staré instrukce. */
const vypnuta = duvodDegradace("broken", "", "", { ...PRAVIDLA, latkaPoruseno: false });
if (vypnuta !== null) {
  spadlo++;
  console.log(`CHYBA vypnutá laťka u „porušeno“ přesto srazila: ${vypnuta}`);
} else {
  console.log("ok   vypnutá laťka „porušeno“ nechává bez dokladu projít");
}

const zapnuta = duvodDegradace("broken", "", "", { ...PRAVIDLA, latkaPoruseno: true });
if (zapnuta !== "broken-no-evidence") {
  spadlo++;
  console.log(`CHYBA zapnutá laťka u „porušeno“ bez dokladu vrátila ${zapnuta ?? "null"}`);
} else {
  console.log("ok   zapnutá laťka „porušeno“ bez dokladu sráží");
}

const sDokladem = duvodDegradace("broken",
  "ministr Juchelka 14. 7. 2026 oznámil, že zastropování nebude v první vlně reformy",
  "2026-07-14", { ...PRAVIDLA, latkaPoruseno: true });
if (sDokladem !== null) {
  spadlo++;
  console.log(`CHYBA doložené „porušeno“ přesto spadlo: ${sDokladem}`);
} else {
  console.log("ok   doložené „porušeno“ obstojí");
}

/* Kam se sráží, se nesmí rozejít s klíči důvodů. */
const bezCile = Object.keys(CIL_DEGRADACE).filter((k) => !CIL_DEGRADACE[k]);
if (bezCile.length) { spadlo++; console.log(`CHYBA důvod bez cílového stavu: ${bezCile.join(", ")}`); }
else console.log("ok   každý důvod degradace má cílový stav");

console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${PRIPADY.length + 5} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
