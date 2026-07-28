/* Comparison data for previous Czech governments.
 *
 * Source: "Kvantitativní a politologická analýza plnění programových prohlášení
 * českých vlád (2014–2026)", which builds its figures on Demagog.cz slib audits
 * and gov.cz records.
 *
 * ── COMPARABILITY (important) ────────────────────────────────────────────────
 * These series count ONLY fully-kept promises ("Splněno") as a percentage of
 * the audited sample — Sobotka's curve ends at 51%, matching his final
 * "Splněno 51%" tally exactly.
 *
 * Vládoměr's headline figure is a WEIGHTED score (fulfilled = 100%,
 * in_progress = 50%), which is a different measure and roughly 5-7x higher
 * early in a term. Plotting the two together would be misleading.
 *
 * Therefore the chart uses a STRICT metric for the current government:
 *     strict % = fulfilled items / all items
 * which is definitionally the same thing the external series measure.
 *
 * Residual caveats the UI must disclose:
 *  - Sample sizes differ (156 / 50 / 50 promises vs. our 143 items).
 *  - Their assessor is human fact-checkers, ours is a language model.
 *  - Their curves are retrospective; ours is measured live each week.
 */

// Quarter index is 0-based from the start of the term (Q1/year 1 === 0).
export const QUARTER_COUNT = 16; // 4-year term

export function quarterLabel(i, lang) {
  const q = (i % 4) + 1, y = Math.floor(i / 4) + 1;
  return lang === "cs" ? `Q${q}/${y}. rok` : `Q${q}/yr ${y}`;
}
export function quarterShort(i) {
  return `Q${(i % 4) + 1}/${Math.floor(i / 4) + 1}`;
}

/** Which quarter of the term a date falls into (0-based, null if before start). */
export function quarterOf(dateMs, termStartMs) {
  const a = new Date(termStartMs), b = new Date(dateMs);
  if (b < a) return null;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    - (b.getDate() < a.getDate() ? 1 : 0);
  return Math.floor(months / 3);
}

/* Values are cumulative "Splněno" %, indexed by quarter (null = no data:
   government had already fallen, or the quarter hasn't happened yet). */
export const GOVERNMENTS = [
  {
    id: "sobotka",
    name: { cs: "Vláda B. Sobotky", en: "Sobotka cabinet" },
    period: "2014–2017",
    parties: "ČSSD + ANO + KDU-ČSL",
    color: "#F59E0B",
    promises: 156,
    final: { fulfilled: 51, partial: 9, broken: 40 },
    series: [2, 6, 11, 16, 22, 28, 33, 38, 41, 44, 46, 48, 49, 50, 51, null],
  },
  {
    id: "babis1",
    name: { cs: "Vláda A. Babiše I", en: "Babiš cabinet I" },
    period: "2017–2018",
    parties: "ANO (bez důvěry)",
    color: "#94A0B2",
    promises: null,
    final: null,
    // Fell in Q2/2018 without ever winning a confidence vote.
    series: [1, 4, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  },
  {
    id: "babis2",
    name: { cs: "Vláda A. Babiše II", en: "Babiš cabinet II" },
    period: "2018–2021",
    parties: "ANO + ČSSD (s tolerancí KSČM)",
    color: "#A78BFA",
    promises: 50,
    final: { fulfilled: 44, partial: 26, broken: 30 },
    series: [3, 8, 14, 20, 26, 30, 33, 35, 38, 40, 41, 42, 43, 44, 44, null],
  },
  {
    id: "fiala",
    name: { cs: "Vláda P. Fialy", en: "Fiala cabinet" },
    period: "2021–2025",
    parties: "ODS + KDU-ČSL + TOP 09 + Piráti + STAN",
    color: "#38BDF8",
    promises: 50,
    final: { fulfilled: 32, partial: 28, broken: 40 },
    series: [2, 5, 9, 14, 18, 21, 23, 25, 27, 29, 30, 31, 31, 32, 32, null],
  },
];

/** The external analysis' own (single-point) figure for the current cabinet,
 *  shown only as a methodology footnote — never mixed into the live series. */
export const CURRENT_EXTERNAL_Q1 = 2;

export const CURRENT_GOV = {
  id: "babis3",
  name: { cs: "Vláda A. Babiše III", en: "Babiš cabinet III" },
  period: "2025–",
  color: "#10B981",
};
