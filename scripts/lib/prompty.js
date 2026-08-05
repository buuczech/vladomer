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
import { render, readSettings } from "./nastaveni.js";
import { DATES } from "../../src/data.js";

const NAST = readSettings();

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
      return `- [${it.id}] ${it.cs}\n   ${prev}${hist ? `; historie stavu: ${hist}` : ""}`;
    })
    .join("\n");
}

/** Prompt pro hodnocení jedné oblasti. */
export function promptHodnoceni(ch, prevEvals, snapshots) {
  const items = ch.groups.flatMap((g) => g.items);
  return render("prompt-hodnoceni.md", {
    DATUM_NASTUPU_VLADY: TERM_START_CS,
    NAZEV_OBLASTI: ch.title.cs,
    MAX_ZDROJU: NAST.maximalne_zdroju,
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
export function promptHodnoceniKontrola() {
  return render("prompt-hodnoceni.md", {
    DATUM_NASTUPU_VLADY: TERM_START_CS,
    NAZEV_OBLASTI: "kontrola",
    MAX_ZDROJU: NAST.maximalne_zdroju,
    SEZNAM_BODU: "- [0.0] kontrola",
    SEZNAM_STAVU: STATUSES.join("|"),
  });
}
