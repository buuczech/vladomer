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

/* Značka předpisu: „č. 233/2026 Sb.“ i „233/2026 Sb.“. Slovo „Sb“ je povinné —
   bez něj by se sem chytalo „Usnesení vlády č. 1022/2025“, které o Sbírce
   netvrdí vůbec nic. Tečka za ním povinná není: model ji občas vynechá a na
   jedné tečce nemá viset, jestli se doklad ověřuje. Za „Sb“ ale nesmí následovat
   písmeno, jinak by „Sbírce“ prošlo jako zkratka. */
const ZNACKA_PREDPISU = /\b(?:č\.\s*)?(\d{1,4})\s*\/\s*(\d{4})\s+Sb\.?(?!\p{L})/gu;

/* Značky, které doklad tvrdí jako ČERSTVĚ VYDANÉ — ročník předpisu není starší
 * než rok dokladu. To je rozdíl mezi tvrzením a pojmenováním: „zákon
 * č. 117/1995 Sb.“ u dokladu z roku 2026 je jméno normy, kterou novela mění,
 * kdežto „zákon č. 233/2026 Sb.“ u dokladu z roku 2026 tvrdí, že takový
 * předpis toho roku vznikl. Ověřit se musí to druhé.
 *
 * POZOR, tohle NENÍ ta zrušená kontrola ročníků, i když sahá po stejné dvojici
 * čísel. Ta srážela, když se ročník značky LIŠIL od data dokladu, a trestala
 * tím novely starších zákonů — nejběžnější způsob, jak se tu slib plní.
 * Tahle je otočená: ozve se jen tehdy, když je značka stejně stará nebo mladší
 * než doklad. Novela projde, protože její ročník je starší.
 *
 * S nástupem vlády se ročník neporovnává schválně. O zásluhu rozhoduje datum
 * dokladu (predates-term), ne značka, a protože vláda nastoupila 15. 12. 2025,
 * „2025“ nerozliší její práci od práce té předchozí. Tady se nerozhoduje
 * o zásluze, jen o tom, jestli je potřeba pramen.
 */
export function cerstvaCislaPredpisu(dukaz, datum) {
  const rokDokladu = Number(String(datum || "").slice(0, 4));
  const out = new Set();
  if (!rokDokladu) return out;
  for (const m of String(dukaz || "").matchAll(ZNACKA_PREDPISU)) {
    if (Number(m[2]) >= rokDokladu) out.add(`${m[1]}/${m[2]}`);
  }
  return out;
}

/* Tvrzení o Sbírce vyslovené slovy, bez čísla. Bod 10.4 to 7. 8. 2026 napsal
   jako „novela č.... ve Sbírce zákonů (k publikaci)“ — číslo neměl, ale
   vyhlášení tvrdil, a doložit se musí i tohle. */
const SBIRKA_SLOVY = /(?:ve|v)\s+Sbírc\p{L}*|vyhlášen\p{L}*\s+ve?\s+Sbírk\p{L}*/iu;

/* Trpné příčestí od „vyhlásit“. Samo o sobě spouštěčem být NESMÍ: bod 7.1 má
   doklad „Usnesení vlády č. 1022/2025 … vyhlášeno 16. 12. 2025“, což je zcela
   legitimní nelegislativní splnění, a laťka by ho srazila. Váže se proto na
   přítomnost značky předpisu — viz tvrdiSbirku(). */
const VYHLASENO_SLOVESO = /vyhlášen\p{L}*/iu;

/** Nese doklad ZNAČKU předpisu, jakkoli starou? */
function maZnackuPredpisu(dukaz) {
  for (const _ of String(dukaz || "").matchAll(ZNACKA_PREDPISU)) return true;
  return false;
}

/* Opírá se doklad o předpis ve Sbírce zákonů? Tři cesty, protože model píše
 * všechny tři a každá zvlášť je propustná:
 *
 *   a) ČERSTVÁ ZNAČKA — „č. 233/2026 Sb.“ u dokladu z roku 2026.
 *   b) SLOVY — „ve Sbírce zákonů“ i bez čísla.
 *   c) STARÁ ZNAČKA + VYHLÁŠENO — „novela zákona č. 117/1995 Sb. byla vyhlášena
 *      20. 8. 2026“. Tvrdí se tu vyhlášení, ale nové číslo u toho nestojí, takže
 *      (a) mlčí a (b) taky, protože slovo „Sbírka“ ve větě není. Bez téhle větve
 *      by stačilo vyhlášení napsat opisem a zábrana by ho nechala projít.
 *
 * (c) je nejširší a nese cenu: „vyhlášeno výběrové řízení podle zákona
 * č. 137/2006 Sb.“ sepne taky, ačkoli o Sbírku nejde. Sráží se ale jen na
 * „částečně splněno“ s viditelnou vysvětlivkou a stačí doplnit pramen. Na
 * celé auditní stopě (32 hodnocení „splněno“ z pěti běhů) nepřidala (c) ani
 * jedno sražení navíc — cena je zatím teoretická, mezera nebyla.
 */
export function tvrdiSbirku(dukaz, datum) {
  const t = String(dukaz || "");
  if (cerstvaCislaPredpisu(dukaz, datum).size > 0) return true;
  if (SBIRKA_SLOVY.test(t)) return true;
  return maZnackuPredpisu(t) && VYHLASENO_SLOVESO.test(t);
}

/* Prameny, kde se značka ve Sbírce dá opravdu dohledat: e-Sbírka a komory,
 * jejichž stránka sněmovního tisku číslo po vyhlášení nese.
 *
 * gov.cz tu schválně NENÍ, ačkoli je to úřední doména. Pokrývá totiž i každou
 * tiskovou zprávu ministerstva, a tiskovou zprávou o hlasování Sněmovny se
 * vyhlášení nedokládá. Přesně na tom 21. 8. 2026 propadl bod 10.4: doklad
 * „Zákon č. 233/2026 Sb. … podepsaný prezidentem“ prošel, protože jeho jediný
 * „úřední“ pramen byl mpsv.gov.cz — článek o tom, že novelu schválila Sněmovna.
 */
export const PRAMENY_SBIRKY = ["e-sbirka.cz", "e-sbirka.gov.cz", "psp.cz", "senat.cz"];

/* Zdroj bere v obou tvarech: objekt {url} z ostrého běhu i holý řetězec, jak
   ho nese audit.json. */
export function maPramenSbirky(zdroje, domeny = PRAMENY_SBIRKY) {
  for (const z of zdroje || []) {
    const url = typeof z === "string" ? z : (z && z.url) || "";
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (domeny.some((d) => host === d || host.endsWith("." + d))) return true;
  }
  return false;
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
  "sbirka-bez-uredniho-zdroje": "partial",
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
export function duvodDegradace(stav, dukaz, datum, { minDelkaDokladu, nastup, latkaPoruseno = false, zdroje = null }) {
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
  /* Číslo zákona ve Sbírce se dá napsat, aniž by existovalo. Bod 2.10 dostal
     21. 8. 2026 doklad „Zákon č. 270/2026 Sb., vyhlášen 26. 5. 2026" z toho, že
     Sněmovna toho dne přehlasovala veto Senátu — a ověřovatel to potvrdil,
     protože nemá vyhledávání a číslo si nemohl ověřit. Text tvrzení se tedy
     nebere na slovo: musí u něj stát pramen, kde to jde dohledat.

     První verze téhle zábrany díru nezavřela a stálo to bod 10.4: ptala se na
     jakékoli „Sb." a spokojila se s jakoukoli doménou gov.cz, takže ji uspokojil
     ministerský článek o hlasování Sněmovny. Ptá se proto na dvě věci najednou
     — jestli doklad o Sbírku vůbec OPÍRÁ (tvrdiSbirku, ne pouhá zmínka staršího
     předpisu) a jestli u toho stojí pramen, kde ta značka JE (PRAMENY_SBIRKY).

     Kontroluje se jen když volající zdroje předá (zpětná dohledatelnost
     starších dat se tím nemění — viz prepocet-degradaci.js). */
  if (zdroje && tvrdiSbirku(dukaz, datum) && !maPramenSbirky(zdroje, PRAMENY_SBIRKY)) {
    return "sbirka-bez-uredniho-zdroje";
  }
  return null;
}
