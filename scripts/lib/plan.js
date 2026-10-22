/* scripts/lib/plan.js — Plán legislativních prací vlády a Výhled (spec 006, T008).
 *
 * Podle pravidla M6 je úkol v Plánu legislativních prací nebo ve Výhledu
 * „deklarováno“. Model plán vyhledáváním nenacházel: plán je 91stránkové PDF,
 * a hodnotitel proto dával „nezahájeno“ bodům, které vláda formálně plánuje
 * (10.8, 15.7, 7.8 a 3.2 v měřeních 21. 10. 2026). Program ho čte za něj, jako
 * e-Sbírku a data Sněmovny.
 *
 * Data: scripts/nastaveni/plan-legislativy.json, převedená z PDF nástrojem
 * scripts/dev/plan-legislativy.py (jednou za rok, při novém plánu). Každý
 * úkol nese kapitoly Vládoměru: podle vazby, kterou vláda v plánu sama
 * uvedla („Vztah úkolů k programovým prioritám vlády“), jinak podle resortu.
 * Kapitola dostane jen svoje úkoly — celý plán by prompt zdražil desetkrát.
 *
 * Nic tu nesahá na síť: plán je v repozitáři, takže prompt je deterministický.
 */
import { readFileSync } from "node:fs";

export const CESTA_PLANU = new URL("../nastaveni/plan-legislativy.json", import.meta.url);
export function nactiPlan() { return JSON.parse(readFileSync(CESTA_PLANU, "utf8")); }

const zkrat = (s, n) => { s = String(s || "").trim(); return s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s; };
// „Návrh zákona, kterým se mění zákon č. 117/1995 Sb., o státní sociální podpoře, ve znění pozdějších předpisů“ → bez „ve znění…“
const nazev = (u) => u.nazev.replace(/,? ve znění pozdějších předpisů/g, "").replace(/\s+,/g, ",");
const termin = (u) => {
  const m = String(u.vlade || "").match(/^(\d\d)\.(\d\d)$/);
  if (m) return `${Number(m[1])}/20${m[2]}`;
  const q = String(u.vlade || "").match(/^(\d{4})\s*(\d)\.\s*Q$/);
  return q ? `${q[2]}. čtvrtletí ${q[1]}` : u.vlade || "neuveden";
};
const oznaceni = (u) => `${u.zdroj === "plan" ? "Plán" : "Výhled"}, ${String(u.predkladatel || "").split(/\s+/)[0] || u.resort} č. ${u.cislo}${u.zdroj === "vyhled" && u.rok ? ` (${u.rok})` : ""}`;

/** Úkoly jedné kapitoly: nejdřív ty, které vláda ke slibům sama přiřadila. */
export function ukolyKapitoly(plan, kapitola) {
  const k = Number(kapitola);
  const vse = plan.ukoly.filter((u) => (u.kapitoly || []).includes(k));
  return [...vse.filter((u) => u.vazba), ...vse.filter((u) => !u.vazba)];
}

export const BEZ_UKOLU = "(K této oblasti nemá plán ani výhled žádný úkol.)";

/** Text pro prompt hodnocení ({{PLAN_LEGISLATIVY}}). */
export function tabulkaPlanu(plan, kapitola) {
  const ukoly = ukolyKapitoly(plan, kapitola);
  if (!ukoly.length) return BEZ_UKOLU;
  const s = ukoly.filter((u) => u.vazba), bez = ukoly.filter((u) => !u.vazba);
  const r = [`Plán legislativních prací vlády na zbývající část roku 2026 a Výhled legislativních prací na léta 2027–2029 (${plan.usneseni}).`];
  if (s.length) {
    r.push("Úkoly, které vláda v plánu sama přiřadila ke slibům programového prohlášení:");
    for (const u of s) r.push(`- ${oznaceni(u)}, předložit vládě ${termin(u)}: ${nazev(u)}.${u.cil ? ` Cíl: ${zkrat(u.cil, 220)}` : ""} Slib podle vlády: „${zkrat(u.program, 300)}“`);
  }
  if (bez.length) {
    r.push("Další úkoly odpovědného resortu, které vláda k programovému prohlášení nepřiřadila:");
    for (const u of bez) r.push(`- ${oznaceni(u)}, předložit vládě ${termin(u)}: ${zkrat(nazev(u), 220)}`);
  }
  return r.join("\n");
}

/** Citovatelný zdroj pro kontrolu faktů: úkoly kapitoly bodu, zvlášť plán a výhled (každý má vlastní PDF). */
export function zdrojePlanu(plan, kapitola) {
  const out = [];
  for (const zdroj of ["plan", "vyhled"]) {
    const ukoly = ukolyKapitoly(plan, kapitola).filter((u) => u.zdroj === zdroj);
    if (!ukoly.length) continue;
    const url = (plan.zdroje.find((z) => z.druh === zdroj) || {}).url;
    const co = zdroj === "plan" ? "Plán legislativních prací vlády na zbývající část roku 2026" : "Výhled legislativních prací vlády na léta 2027 až 2029";
    out.push({
      url: `${url}#kapitola-${kapitola}`,
      bezZkraceni: true,
      text: `${co} (${plan.usneseni}; úřední dokument, úkoly převedl program). Úkoly k oblasti č. ${kapitola}:\n${ukoly.map((u) => `${oznaceni(u)}, předložit vládě ${termin(u)}: ${nazev(u)}.${u.cil ? ` Cíl: ${u.cil}` : ""}${u.vazba ? ` Vztah k programovému prohlášení: ${u.program}` : ""}`).join("\n")}`,
    });
  }
  return out;
}
