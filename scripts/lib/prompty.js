/* scripts/lib/prompty.js — sestavení promptů, které se posílají modelu.
 *
 * Proč samostatný modul: prompty se zobrazují i na webu (sekce „Použité
 * prompty") včetně ukázky, jak vypadají po doplnění dat. Kdyby si je stránka
 * skládala po svém, první změna formátu tady by z ukázky udělala tiše lež —
 * a nepravdivá ukázka je horší než žádná. Build i týdenní běh proto volají
 * stejné funkce.
 *
 * evaluate.js sem nejde importovat obráceně: na úrovni modulu končí
 * process.exit(1), když chybí ANTHROPIC_API_KEY, což by shodilo build.
 *
 * Nic tu nevolá API ani nesahá na síť.
 */
import { readFileSync } from "node:fs";
import { render, readSettings } from "./nastaveni.js";
import { DATES, CHAPTERS } from "../../src/data.js";
import { nactiPlan, tabulkaPlanu } from "./plan.js";

const NAST = readSettings();
/* Plán legislativních prací vlády (lib/plan.js): je v repozitáři, ne na síti,
   takže se načte jednou a prompt zůstává deterministický. */
const PLAN = nactiPlan();

/* Stavová škála, nejsilnější první. Tohle pole JE kontrakt: evaluate.js podle
   něj validuje odpověď a prompt ho dostává přes {{SEZNAM_STAVU}}, takže se ty
   dvě věci nemohou rozejít. Bydlí u promptu, který je vyhlašuje. */
export const STATUSES = ["fulfilled", "partial", "in_progress", "declared", "not_started", "broken"];

export const STATUS_CS = {
  fulfilled: "splněno", partial: "částečně splněno", in_progress: "probíhá",
  declared: "jen deklarováno", not_started: "nezahájeno", broken: "porušeno/opuštěno",
  stalled: "porušeno/opuštěno", // legacy value from the pre-2026-07 scale
};

// Datum nástupu vlády v tvaru, v jakém ho vidí model: „15. 12. 2025“.
// Odvozené z DATES, aby prompt nemohl tvrdit jiné datum, než jaké vynucují
// kontroly v evaluate.js.
const D = new Date(DATES.tookOffice);
export const TERM_START_CS = `${D.getDate()}. ${D.getMonth() + 1}. ${D.getFullYear()}`;

/* Pravidla vlastníka webu (scripts/nastaveni/metodika.md, M1–M11). Čte je
   hodnotitel, oba ověřovatelé i kontrola faktů z jednoho souboru, aby se
   mezi rolemi nemohla rozejít. Normalizace jako readText v lib/nastaveni.js
   (BOM, CRLF, koncové mezery), aby text v promptu nezávisel na tom, kde běh
   jede. */
export function nactiMetodiku() {
  return readFileSync(new URL("../nastaveni/metodika.md", import.meta.url), "utf8")
    .replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

/* Doslovné znění slibu z programového prohlášení (scripts/nastaveni/
   zneni-slibu.json, převedl scripts/dev/zneni-slibu.py). Text bodu v src/
   data.js je zkratka a model podle zkratky hodnotí jiný slib, než vláda dala:
   15.2 „Digitalizace stavebního řízení“ slibuje digitalizaci „založenou na
   modulovém řešení … včetně adekvátního pilotního ověření“, a ve čtyřech
   měřeních z 21.–22. 10. 2026 model uznal starý Portál stavebníka jako část
   slibu. Podnadpis prohlášení je kontext: příspěvek na bydlení (3.2) stojí
   pod „…podmínky pro policisty a hasiče“. */
const ZNENI = JSON.parse(readFileSync(new URL("../nastaveni/zneni-slibu.json", import.meta.url), "utf8")).body;
export const zneniSlibu = (id) => ZNENI[id] || null;
const citace = (id) => {
  const z = ZNENI[id];
  return z ? `Znění v programovém prohlášení${z.nadpis ? ` (podnadpis „${z.nadpis}“)` : ""}: „${z.zneni}“` : "";
};

/* Znění slibu i s kapitolou a oddílem programového prohlášení. Text bodu je
   zkrácený a bez nich nejednoznačný: „Příspěvek na bydlení až 6 000 Kč/měsíc
   dle regionu“ (3.2) je z oddílu o platech bezpečnostních složek, tedy pro
   policisty — v měření 21. 10. 2026 ho hodnotitel i kontrola bez oddílu
   „splnili“ superdávkou, přesně podle příkladu z pravidla M10.
   @returns { id → „text (kapitola „…“, oddíl „…“). Znění v programovém prohlášení: „…““ } */
export function slibySKontextem(kapitoly) {
  const out = {};
  for (const c of kapitoly) for (const g of c.groups) for (const i of g.items) {
    const z = citace(i.id);
    out[i.id] = `${i.cs} (kapitola „${c.title.cs}“${g.title && g.title.cs ? `, oddíl „${g.title.cs}“` : ""})${z ? `. ${z}` : ""}`;
  }
  return out;
}
const SLIBY = slibySKontextem(CHAPTERS);
/** Znění bodu pro ověřovatele: text s kapitolou a oddílem. */
export const zneniSKontextem = (it) => SLIBY[it.id] || it.cs;
/* Oddíl bodu pro seznamy bodů jedné kapitoly — kapitolu prompt uvádí zvlášť. */
const ODDIL = {};
for (const c of CHAPTERS) for (const g of c.groups) for (const i of g.items) ODDIL[i.id] = (g.title && g.title.cs) || null;

export function truncate(s, n) { s = s || ""; return s.length > n ? s.slice(0, n) + "…" : s; }

export function historyFor(id, snapshots) {
  return snapshots
    .map((s) => (s.statuses && s.statuses[id] ? `${s.date} ${STATUS_CS[s.statuses[id]] || s.statuses[id]}` : null))
    .filter(Boolean)
    .slice(-NAST.historie_v_promptu)
    .join(", ");
}

/** Seznam bodů jedné oblasti i s kontextem z minulých týdnů. */
export function radkyBodu(items, prevEvals, snapshots) {
  return items
    .map((it) => {
      const p = prevEvals[it.id];
      const prev = p
        ? `předchozí stav: ${STATUS_CS[p.status] || p.status}; předchozí komentář: "${truncate((p.comment && p.comment.cs) || "", NAST.delka_predchoziho_komentare)}"`
        : "bez předchozího hodnocení";
      const hist = historyFor(it.id, snapshots);
      const z = citace(it.id);
      return `- [${it.id}] ${it.cs}${ODDIL[it.id] ? ` (oddíl „${ODDIL[it.id]}“)` : ""}${z ? `\n   ${z}` : ""}\n   ${prev}${hist ? `; historie stavu: ${hist}` : ""}`;
    })
    .join("\n");
}

/** Prompt pro hodnocení jedné oblasti. */
/* Volitelné „body" dovolují poslat jen část kapitoly. Používá to evaluate.js,
   když je kapitola tak velká, že se odpověď nevejde do max_tokens; text promptu
   se tím nemění, jen seznam bodů v něm. Bez toho parametru se chová jako dřív,
   takže výpis promptů na webu zůstává stejný. */
/* Co se dosadí místo rejstříku Sbírky, když se ho nepodařilo načíst (nebo je
   vypnutý). Pokyn v promptu platí jen „je-li seznam uvedený" — bez seznamu by
   tvrzení „co v seznamu není, nevyšlo" zapřelo každé skutečné splnění. */
export const REJSTRIK_NEDOSTUPNY = "(Seznam se tentokrát nepodařilo načíst. Číslo předpisu uveď jen tehdy, když ho máš doslova z nalezeného zdroje.)";
/* Totéž pro seznam sněmovních tisků (lib/psp.js): bez seznamu by věta „návrh,
   který v seznamu není, předložen nebyl“ zapřela každý skutečný návrh. */
export const TISKY_NEDOSTUPNE = "(Seznam tisků se tentokrát nepodařilo načíst. Stádium legislativního procesu uveď jen tehdy, když ho máš doslova z nalezeného zdroje.)";

export function promptHodnoceni(ch, prevEvals, snapshots, body, rejstrik = null, tisky = null) {
  const items = body || ch.groups.flatMap((g) => g.items);
  return render("prompt-hodnoceni.md", {
    DATUM_NASTUPU_VLADY: TERM_START_CS,
    NAZEV_OBLASTI: ch.title.cs,
    MAX_ZDROJU: NAST.maximalne_zdroju,
    METODIKA: nactiMetodiku(),
    REJSTRIK_SBIRKY: rejstrik || REJSTRIK_NEDOSTUPNY,
    TISKY_PSP: tisky || TISKY_NEDOSTUPNE,
    PLAN_LEGISLATIVY: tabulkaPlanu(PLAN, ch.id),
    SEZNAM_BODU: radkyBodu(items, prevEvals, snapshots),
    SEZNAM_STAVU: STATUSES.join("|"),
  });
}

/** Prompt pro zprávy týdne. Datum se předává, ať jde ukázka vyrobit deterministicky. */
export function promptZpravy(dnesniDatum) {
  return render("prompt-zpravy.md", {
    DNESNI_DATUM: dnesniDatum,
    POCET_DNI: NAST.zpravy_pocet_dni,
    POCET_ZPRAV_K_NAVRZENI: NAST.pocet_zprav + NAST.zprav_navic_k_vyberu,
  });
}

/* Varianty s nesmyslnými, ale platnými vstupy — jen pro preflight(), který
   ověřuje, že se šablony vůbec vyrenderují, ještě před prvním voláním API. */
/* Týdenní sken událostí (delta běh). Neptá se „jaký je stav?", ale „co se
   od minula STALO?" — přehodnocují se pak jen body s nalezenou událostí,
   ostatní stav drží. To je jádro stabilizace: bez události není co losovat. */
export function promptDeltaScan(ch, prevEvals, odData, body) {
  const items = body || ch.groups.flatMap((g) => g.items);
  const radky = items.map((it) => {
    const p = prevEvals[it.id];
    return `- [${it.id}] ${it.cs} (${ODDIL[it.id] ? `oddíl „${ODDIL[it.id]}“; ` : ""}dosavadní stav: ${p ? STATUS_CS[p.status] || p.status : "bez hodnocení"})`;
  }).join("\n");
  return render("prompt-delta.md", {
    DATUM_NASTUPU_VLADY: TERM_START_CS,
    OD_DATA: odData,
    NAZEV_OBLASTI: ch.title.cs,
    MAX_ZDROJU: NAST.maximalne_zdroju,
    SEZNAM_BODU: radky,
  });
}

/* Ověření navrženého přechodu stavu (brána v lib/prechody.js vrátila
   „overit"). Úzký dotaz: otázka nezní „jaký je stav?", ale „nese TENHLE
   doklad TENHLE přechod?" — výchozí odpověď je NE. Ověřovatel smí citovaný
   předpis vyhledat (vyhledavani_overeni); MINULY_OD je den vstupu do
   dosavadního stavu (stavOd), ne den posledního přepisu záznamu. */
export function promptOvereniPrechodu({ bod, minulyStav, minulyOd, novyStav, doklad, datumDokladu, zmena, komentar, predpisy, prostredni = false }) {
  /* Prostřední přechody mají vlastní šablonu. Pravidla té přísné mluví jen
     o Sbírce zákonů a o obratu ze „splněno" — na „deklarováno → probíhá" by
     model neměl podle čeho rozhodnout a spadl by na výchozí NE, takže by web
     zamrzl na místě. */
  return render(prostredni ? "prompt-overeni-prostredniho.md" : "prompt-overeni-prechodu.md", {
    BOD: bod,
    MINULY_STAV: STATUS_CS[minulyStav] || minulyStav,
    MINULY_OD: minulyOd || "neznámo",
    NOVY_STAV: STATUS_CS[novyStav] || novyStav,
    DOKLAD: doklad || "(žádný)",
    DATUM_DOKLADU: datumDokladu || "(bez data)",
    PREDPISY: predpisy || "(Program čísla předpisů neověřoval.)",
    METODIKA: nactiMetodiku(),
    ZMENA: zmena || "(neuvedeno)",
    KOMENTAR: komentar || "(neuveden)",
  });
}

/* Doptání v téže konverzaci, když odpověď hodnocení nejde přečíst (model
   napsal rozbor místo JSON). Je to jiný vstup než první dotaz, takže na rozdíl
   od opakování při temperature 0 dostane jinou odpověď. Viz evaluateChapter. */
export function promptDoptani(ids) {
  return render("prompt-doptani.md", { SEZNAM_ID: ids.join(", ") });
}

export function promptHodnoceniKontrola() {
  return render("prompt-hodnoceni.md", {
    DATUM_NASTUPU_VLADY: TERM_START_CS,
    NAZEV_OBLASTI: "kontrola",
    MAX_ZDROJU: NAST.maximalne_zdroju,
    METODIKA: nactiMetodiku(),
    REJSTRIK_SBIRKY: REJSTRIK_NEDOSTUPNY,
    TISKY_PSP: TISKY_NEDOSTUPNE,
    PLAN_LEGISLATIVY: tabulkaPlanu(PLAN, 0),
    SEZNAM_BODU: "- [0.0] kontrola",
    SEZNAM_STAVU: STATUSES.join("|"),
  });
}
