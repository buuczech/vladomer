/* scripts/lib/delta.js — čtení odpovědi delta skenu.
 *
 * Sken vrací seznam datovaných událostí; na něm stojí celý týdenní běh, protože
 * bod bez události se vůbec nepřehodnocuje. Tím pádem má rozbitý parser a klidný
 * týden úplně stejný projev: nula událostí, nula přehodnocení, data beze změny.
 * To je zákeřné — v měření stability by se to ukázalo jako dokonalá
 * reprodukovatelnost. Proto se tu nikdy nevyhazuje výjimka a nikdy se tiše
 * nevrací prázdno: každý důvod, proč událost vypadla, se pojmenuje a spočítá,
 * ať to volající může vypsat do logu.
 */

/**
 * @param text        text odpovědi modelu
 * @param platnaIds   Set id bodů, které do téhle kapitoly patří
 * @param maxZdroju   strop počtu URL u jedné události
 * @returns { udalosti, chyba, zahozeno: { ciziId, bezData } }
 */
export function parsujDeltaOdpoved(text, platnaIds, maxZdroju = 3) {
  const prazdno = { udalosti: {}, zahozeno: { ciziId: 0, bezData: 0 } };
  const clean = String(text || "").replace(/```json|```/g, "").trim();

  const a = clean.indexOf("[");
  const b = clean.lastIndexOf("]");
  /* Model odpověděl prózou. Prompt žádá pole i pro nulový nález, takže tohle
     není „nic se nestalo" — je to odchylka a musí být vidět. */
  if (a === -1 || b === -1 || b < a) return { ...prazdno, chyba: "bez-json-pole" };

  let parsed;
  try {
    parsed = JSON.parse(clean.slice(a, b + 1));
  } catch {
    return { ...prazdno, chyba: "nevalidni-json" };
  }
  if (!Array.isArray(parsed)) return { ...prazdno, chyba: "neni-pole" };

  /* Vyříznutí prvních závorek je shovívavé schválně — model občas pole zabalí
     do objektu a to je pořád čitelné. Zrádné je, když odpoví JEDNOU událostí
     jako holým objektem: vyřízne se pak pole „zdroje", vyjde seznam řetězců,
     žádná událost z něj není a bez tohohle by to prošlo jako klidný týden. */
  if (parsed.length && !parsed.some((u) => u && typeof u === "object" && !Array.isArray(u))) {
    return { ...prazdno, chyba: "pole-neni-seznam-udalosti" };
  }

  const udalosti = {};
  const zahozeno = { ciziId: 0, bezData: 0 };
  for (const u of parsed) {
    if (!u || typeof u !== "object") continue;
    if (!platnaIds.has(u.id)) { zahozeno.ciziId++; continue; }
    // Událost bez data není událost: brána i západka stojí na datovaném dokladu.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(u.datum || "")) { zahozeno.bezData++; continue; }
    udalosti[u.id] = {
      udalost: String(u.udalost || "").slice(0, 300),
      datum: u.datum,
      zdroje: Array.isArray(u.zdroje) ? u.zdroje.filter((z) => typeof z === "string").slice(0, maxZdroju) : [],
    };
  }
  return { udalosti, chyba: null, zahozeno };
}
