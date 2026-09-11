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

/* Tvrzení o Sbírce bez úředního pramene. Skutečný případ z 21. 8. 2026: bod
   2.10 dostal doklad „Zákon č. 270/2026 Sb., vyhlášen 26. 5. 2026" z toho, že
   Sněmovna toho dne přehlasovala veto Senátu — číslo zákona nikdo neviděl
   a ověřovatel ho neměl jak zkontrolovat, protože nemá vyhledávání. */
const MEDIALNI = [{ url: "https://www.novinky.cz/clanek/1" }];
const UREDNI = [{ url: "https://www.psp.cz/sqw/historie.sqw?o=10&t=42" }];
/* Ministerstvo je úřední doména, ale tiskovou zprávou o hlasování Sněmovny se
   vyhlášení nedokládá. Kvůli tomuhle rozdílu bod 10.4 zábranou prošel. */
const MINISTERSTVO = [
  { url: "https://mpsv.gov.cz/rodicovsky-prispevek-vzroste-na-400-000-korun" },
];
const CESKENOVINY_MPSV = [
  { url: "https://www.ceskenoviny.cz/zpravy/pavel-podepsal-rust-rodicovske/2862922" },
  { url: "https://mpsv.gov.cz/rodicovsky-prispevek-vzroste-na-400-000-korun" },
];
const CT24_DENIKREFERENDUM = [
  { url: "https://ct24.ceskatelevize.cz/clanek/domaci/kulturni-instituce-372142" },
  { url: "https://denikreferendum.cz/clanek/238472-platy-vkulture-jsouzalostne" },
];
const SBIRKA = [
  /* --- doslovné doklady bodu 10.4, tři po sobě jdoucí běhy ------------------
     Ukazují celý rozsah pravidla na jediné položce: v jednom týdnu novela
     staršího zákona (projde), v druhém tvrzení o Sbírce bez čísla (spadne),
     ve třetím čerstvé číslo bez pramene (spadne). Mezi druhým a třetím se
     číslo objevilo z ničeho — a právě to zábrana chytá. */
  {
    proc: "10.4 z 21. 8. — čerstvé číslo, prameny jen o podpisu a hlasování",
    dukaz: "Zákon č. 233/2026 Sb., kterým se mění zákon č. 117/1995 Sb., o státní "
      + "sociální podpoře, podepsaný prezidentem Petrem Pavlem dne 17. srpna 2026. "
      + "Rodičovský příspěvek vzroste od 1. ledna 2027 na 400 000 Kč (z 350 000 Kč).",
    datum: "2026-08-17", zdroje: CESKENOVINY_MPSV, ceka: "sbirka-bez-uredniho-zdroje",
  },
  {
    proc: "10.4 z 21. 8. — totéž se sněmovním tiskem projde",
    dukaz: "Zákon č. 233/2026 Sb., kterým se mění zákon č. 117/1995 Sb., o státní "
      + "sociální podpoře, podepsaný prezidentem Petrem Pavlem dne 17. srpna 2026. "
      + "Rodičovský příspěvek vzroste od 1. ledna 2027 na 400 000 Kč (z 350 000 Kč).",
    datum: "2026-08-17", zdroje: [...CESKENOVINY_MPSV, ...UREDNI], ceka: null,
  },
  {
    proc: "10.4 ze 7. 8. — tvrzení o Sbírce slovy, bez čísla",
    dukaz: "Senát schválil 29. 7. 2026, novela č.... ve Sbírce zákonů (k publikaci)",
    datum: "2026-07-29", zdroje: MEDIALNI, ceka: "sbirka-bez-uredniho-zdroje",
  },
  {
    proc: "10.4 ze 14. 8. — novela staršího zákona NESMÍ spadnout ani jen z médií",
    dukaz: "zákon č. 117/1995 Sb., o státní sociální podpoře, schválený Sněmovnou "
      + "8. 7. 2026, Senátem 29. 7. 2026, nábytí účinnosti 1. 10. 2026 pro nově "
      + "narozené děti od 1. 1. 2027",
    datum: "2026-07-29", zdroje: CESKENOVINY_MPSV, ceka: null,
  },

  /* --- opisy, kterými by vyhlášení jinak proklouzlo -------------------------
     Obojí našel až útok na hotové pravidlo, ne korpus: v auditní stopě takový
     doklad zatím není, ale napsat se dá a zábrana by mlčela. */
  {
    proc: "vyhlášení opsané bez slova „Sbírka“, jen se starou značkou",
    dukaz: "novela zákona č. 117/1995 Sb. byla vyhlášena 20. 8. 2026, rodičovský "
      + "příspěvek se zvyšuje na 400 000 Kč",
    datum: "2026-08-20", zdroje: MEDIALNI, ceka: "sbirka-bez-uredniho-zdroje",
  },
  {
    proc: "čerstvá značka bez tečky za „Sb“",
    dukaz: "Zákon č. 233/2026 Sb, kterým se mění zákon č. 117/1995 Sb., podepsán "
      + "prezidentem 17. 8. 2026",
    datum: "2026-08-17", zdroje: MEDIALNI, ceka: "sbirka-bez-uredniho-zdroje",
  },

  // --- zúžení pramenů: ministerstvo už nestačí -------------------------------
  {
    proc: "2.10 — vymyšlené číslo s tiskovou zprávou ministerstva se srazí",
    dukaz: "Zákon č. 270/2026 Sb., vyhlášen 26. května 2026; účinnost od 1. července 2026",
    datum: "2026-05-26", zdroje: MINISTERSTVO, ceka: "sbirka-bez-uredniho-zdroje",
  },

  // --- co se pravidla nesmí ani dotknout -------------------------------------
  {
    proc: "14.1 ze 14. 8. — starší nařízení jako kontext, jen média",
    dukaz: "Nařízení vlády č. 341/2017 Sb. (valorizace od 1. dubna 2026)",
    datum: "2026-01-22", zdroje: CT24_DENIKREFERENDUM, ceka: null,
  },
  {
    proc: "7.1 — nelegislativní splnění usnesením vlády, jediný mediální zdroj",
    dukaz: "Usnesení vlády č. 1022/2025 ze dne 15. 12. 2025 schválilo převzetí "
      + "veškerého financování POZE ve výši 41,734 mld. Kč ročně, vyhlášeno 16. 12. 2025",
    datum: "2025-12-16", zdroje: MEDIALNI, ceka: null,
  },
  {
    proc: "12.2 — nelegislativní splnění jmenováním, média a ministerstvo",
    dukaz: "Potravinový ombudsman jmenován 26.2.2026 (Jindřích Fialka); funkce "
      + "zavedena bez nové byrokracie, vláda deklarovala splnění této priority",
    datum: "2026-02-26", zdroje: MINISTERSTVO, ceka: null,
  },

  {
    proc: "číslo zákona ve Sbírce jen z médií se srazí",
    dukaz: "Zákon č. 270/2026 Sb., vyhlášen 26. května 2026; účinnost od 1. července 2026",
    datum: "2026-05-26", zdroje: MEDIALNI, ceka: "sbirka-bez-uredniho-zdroje",
  },
  {
    proc: "totéž tvrzení s úředním pramenem projde",
    dukaz: "Zákon č. 270/2026 Sb., vyhlášen 26. května 2026; účinnost od 1. července 2026",
    datum: "2026-05-26", zdroje: UREDNI, ceka: null,
  },
  {
    proc: "doklad bez zmínky o Sbírce se novým pravidlem neřeší",
    dukaz: "Opatření bylo zavedeno a od 1. 7. 2026 se podle něj postupuje, potvrdilo ministerstvo",
    datum: "2026-07-01", zdroje: MEDIALNI, ceka: null,
  },
  {
    proc: "bez předaných zdrojů se nová kontrola vůbec nespouští (starší data)",
    dukaz: "Zákon č. 270/2026 Sb., vyhlášen 26. května 2026",
    datum: "2026-05-26", zdroje: null, ceka: null,
  },
];

let spadlo = 0;
for (const p of SBIRKA) {
  const mam = duvodDegradace("fulfilled", p.dukaz, p.datum, { ...PRAVIDLA, zdroje: p.zdroje });
  const ok = mam === p.ceka;
  if (!ok) spadlo++;
  console.log(`${ok ? "ok  " : "CHYBA"} ${p.proc}`);
  if (!ok) console.log(`      čekáno ${p.ceka ?? "beze změny"}, vyšlo ${mam ?? "beze změny"}`);
}

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

// Pět na konci jsou kontroly nedotknutelných stavů a laťky u „porušeno“ níž;
// případy ze SBIRKA se dřív do součtu nepočítaly vůbec.
const CELKEM = PRIPADY.length + SBIRKA.length + 5;
console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${CELKEM} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
