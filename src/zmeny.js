/* src/zmeny.js — změnil tenhle bod stav při posledním běhu?
 *
 * Jediné pravidlo pro panel „Změny od minulého týdne", šipky u bodů a přechod
 * v detailu bodu (App.jsx) i pro seznam změn v týdenním instagramovém příspěvku
 * (scripts/instagram/post.js). Kdyby si ho každé místo počítalo samo, řeklo by
 * web něco jiného než příspěvek.
 *
 * Samotné previousStatus ≠ status nestačí. Od delta režimu (28. 8. 2026) bod bez
 * události drží CELÝ minulý záznam včetně previousStatus, takže jeho poslední
 * skutečný přechod by se hlásil jako „tento týden" navždy. Bod 12.6 se změnil
 * 28. 8. a jako čerstvá změna ho web i příspěvky ukazovaly ještě 4., 11. a 18. 9.
 * Změna je čerstvá, jen když ji zapsal poslední běh: updatedAt leží v okně před
 * lastUpdated. Podržený přechod, přenesený bod ani ruční oprava, která vrátí
 * minulý záznam, updatedAt neposouvají, a proto sem nespadnou.
 */

/* Běh trvá do hodiny. Okno má rezervu pro zpožděnou dávku a pro druhý běh téhož
   dne (28. 8. 2026 proběhly dva); změnu z minulého týdne nechytí nikdy. */
const OKNO_MS = 12 * 3600 * 1000;

export function zmenaPoslednihoBehu(e, lastUpdated) {
  if (!e || !e.previousStatus || e.previousStatus === e.status) return false;
  const beh = Date.parse(lastUpdated || "");
  const zapsano = Date.parse(e.updatedAt || "");
  if (!Number.isFinite(beh) || !Number.isFinite(zapsano)) return false;
  const odstup = beh - zapsano;
  return odstup > -60_000 && odstup < OKNO_MS;
}
