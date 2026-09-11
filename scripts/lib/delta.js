/* scripts/lib/delta.js — delta sken: čtení jeho odpovědi a plán kapitoly.
 *
 * Sken vrací seznam datovaných událostí; na něm stojí celý týdenní běh, protože
 * bod bez události se vůbec nepřehodnocuje. Tím pádem má rozbitý parser a klidný
 * týden úplně stejný projev: nula událostí, nula přehodnocení, data beze změny.
 * Proto se tu nikdy nevyhazuje výjimka a nikdy se tiše nevrací prázdno: každý
 * důvod, proč událost vypadla, se pojmenuje a spočítá, a nečitelná odpověď nese
 * ukázku, ať se z logu dá poznat, co vlastně přišlo.
 *
 * Hledání seznamu sdílí s parserem hodnocení (vyrezy() z lib/odpoved.js). Dřív
 * tu bylo vlastní „od první [ po poslední ]" — přesně ta chyba, kterou parser
 * hodnocení 26. 8. 2026 dostal opravenou, jenže sem se oprava nepřenesla. Model
 * před seznam píše větu s odkazy typu „[4.2]", a tři týdenní běhy po sobě
 * (28. 8., 4. 9., 11. 9.) proto nepřečetly sken dvou až tří kapitol; kapitolu 4
 * ani jednou. Dvě implementace téhož se rozešly hned na první opravě.
 */
import { vyrezy } from "./odpoved.js";
import { bodyKPrehodnoceni } from "./prechody.js";

const jeObjekt = (u) => Boolean(u) && typeof u === "object" && !Array.isArray(u);
/** Vypadá prvek jako událost? Stačí, že nese id — zbytek prověří filtr níž. */
const jeUdalost = (u) => jeObjekt(u) && "id" in u;
const zkusJson = (s) => { try { return { ok: true, v: JSON.parse(s) }; } catch { return { ok: false }; } };

/* Najde v odpovědi seznam událostí. Vrací { pole } nebo { chyba }. */
function najdiSeznam(clean) {
  const cela = zkusJson(clean);
  if (cela.ok) {
    const v = cela.v;
    if (Array.isArray(v)) {
      return !v.length || v.some(jeUdalost) ? { pole: v } : { chyba: "pole-neni-seznam-udalosti" };
    }
    /* Seznam zabalený do objektu ({"udalosti": […]}) je pořád čitelný. Holý
       objekt s id ale ne: je to jedna událost místo seznamu a jeho vlastní pole
       („zdroje") by se jinak přečetlo jako seznam — prázdné dokonce jako klid. */
    if (jeObjekt(v) && !jeUdalost(v)) {
      const vnitrni = Object.values(v).find((x) => Array.isArray(x) && (!x.length || x.some(jeUdalost)));
      if (vnitrni) return { pole: vnitrni };
    }
    return { chyba: "pole-neni-seznam-udalosti" };
  }

  /* Próza okolo JSON. Výřezy podle SPÁROVANÝCH závorek: „[4.2]" v úvodní větě
     je taky pole (čísel), takže se přeskočí a seznam se najde až za ním. */
  let prazdne = false, precteno = false, zavorky = false;
  for (const vyrez of vyrezy(clean, "[", "]")) {
    zavorky = true;
    const r = zkusJson(vyrez);
    if (!r.ok) continue;
    precteno = true;
    if (Array.isArray(r.v) && r.v.some(jeUdalost)) return { pole: r.v };
    if (Array.isArray(r.v) && !r.v.length) prazdne = true;
  }
  if (!zavorky) return { chyba: "bez-json-pole" };
  /* Prázdné pole znamená klid, jen když v odpovědi není událost jinde —
     prázdné „zdroje" uvnitř holého objektu by se jinak přečetly jako klidný
     týden. Holý objekt je odchylka a řeší ho náhradní přehodnocení kapitoly. */
  if (prazdne) {
    const neseUdalost = [...vyrezy(clean, "{", "}")]
      .some((s) => { const r = zkusJson(s); return r.ok && jeUdalost(r.v); });
    if (!neseUdalost) return { pole: [] };
  }
  return { chyba: precteno ? "pole-neni-seznam-udalosti" : "nevalidni-json" };
}

/**
 * @param text        text odpovědi modelu
 * @param platnaIds   Set id bodů, které do téhle kapitoly patří
 * @param maxZdroju   strop počtu URL u jedné události
 * @returns { udalosti, chyba, zahozeno: { ciziId, bezData }, ukazka? }
 */
export function parsujDeltaOdpoved(text, platnaIds, maxZdroju = 3) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  const nalez = najdiSeznam(clean);
  if (nalez.chyba) {
    return {
      udalosti: {}, zahozeno: { ciziId: 0, bezData: 0 }, chyba: nalez.chyba,
      // Bez ukázky zbude v logu jen kód chyby — a z toho se příčina nepozná.
      ukazka: clean.slice(0, 300).replace(/\s+/g, " "),
    };
  }

  const udalosti = {};
  const zahozeno = { ciziId: 0, bezData: 0 };
  for (const u of nalez.pole) {
    if (!jeObjekt(u)) continue;
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

/**
 * Co se v kapitole přehodnotí a jak přísně se posuzují přechody.
 *
 *   plný audit             → všechno; přechody jako v plném auditu
 *   delta, sken přečten    → jen body s událostí (a body bez hodnocení)
 *   delta, sken NEČITELNÝ  → celá kapitola; přechody jako v plném auditu
 *
 * Nečitelná kapitola se dřív přeskočila a tvářila se jako klidný týden. Brána
 * přechodů platí i při náhradním přehodnocení, takže se tím šum nevrací —
 * stojí to jen pár bodů navíc.
 *
 * `skenPokryl` říká, jestli se na body BEZ přehodnocení opravdu někdo díval.
 * Jen tehdy smějí dostat razítko overeno — viz prenesNeprehodnocene().
 */
export function planKapitoly({ rezim, sken, vsechnyBody, prevEvals }) {
  if (rezim !== "delta") {
    return { bodyKHodnoceni: vsechnyBody, plnyAudit: true, skenPokryl: false, nahradni: false, udalosti: null };
  }
  if (sken.chyba) {
    return { bodyKHodnoceni: vsechnyBody, plnyAudit: true, skenPokryl: false, nahradni: true, udalosti: {} };
  }
  return {
    bodyKHodnoceni: bodyKPrehodnoceni(vsechnyBody, sken.udalosti, prevEvals),
    plnyAudit: false, skenPokryl: true, nahradni: false, udalosti: sken.udalosti,
  };
}

/**
 * Body kapitoly, které běh nepřehodnotil.
 *
 * Razítko overeno a pravdivé „beze změny" dostanou JEN body, které pokryl
 * přečtený sken — běh se na ně podíval a událost nenašel. Web razítko ukazuje
 * jako „prověřeno beze změny" a podle něj taky rozhoduje, že kapitola není
 * zastaralá (App.jsx, prehled.js). 11. 9. 2026 ho přitom nesla kapitola 4,
 * jejíž sken nešel přečíst a na kterou se od 28. 8. nikdo nepodíval.
 *
 * Bod, který se měl přehodnotit a model ho v odpovědi vynechal, zůstane přesně
 * jak byl — bez razítka — a vrátí se ve `vynechane`, ať ho log pojmenuje.
 *
 * @returns { doplnit: { id → záznam }, vynechane: [id] }
 */
export function prenesNeprehodnocene({ vsechnyBody, pridat, dosavadni, plan, ted }) {
  const kHodnoceni = new Set(plan.bodyKHodnoceni.map((b) => b.id));
  const doplnit = {};
  const vynechane = [];
  for (const it of vsechnyBody) {
    if (pridat[it.id] || !dosavadni[it.id]) continue;
    if (kHodnoceni.has(it.id)) { vynechane.push(it.id); continue; }
    if (!plan.skenPokryl) continue;
    doplnit[it.id] = { ...dosavadni[it.id], change: { cs: "beze změny", en: "no change" }, overeno: ted };
  }
  return { doplnit, vynechane };
}
