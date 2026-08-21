/* scripts/lib/odpoved.js — čtení odpovědi hodnoticího modelu.
 *
 * Odpověď má být {"items":[…]}. Když se v ní hodnocení kapitoly nenajde, celá
 * kapitola propadne a její body zůstanou týden staré, takže tolerance k tvaru
 * je tu levnější než přísnost.
 *
 * Proč to vzniklo: v delta režimu má kapitola často JEDINÝ bod k přehodnocení
 * a v takovém případě model odpověď zabalí jinak — v prvním delta páru selhaly
 * VŠECHNY čtyři jednobodové kapitoly a žádná z ostatních. V plném běhu se to
 * neukázalo, protože tam má kapitola nejmíň čtyři body.
 *
 * A hlavně: retry to nespraví. Od zavedení temperature 0 vrací model na stejný
 * vstup stejnou odpověď, takže čtyři pokusy o zopakování jsou čtyři stejná
 * selhání — jediná obrana je přečíst, co přišlo, nebo aspoň říct co to bylo.
 */

/** Vypadá záznam jako hodnocení bodu? Stačí id, zbytek dořeší volající. */
function jeZaznam(x) {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x) && typeof x.id === "string";
}

/**
 * @param text  text odpovědi modelu
 * @returns pole surových záznamů
 * @throws  Error s ukázkou odpovědi, když se pole nedá najít
 */
export function parsujHodnoceni(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("prázdná odpověď modelu");

  const kandidati = [];
  try { kandidati.push(JSON.parse(clean)); } catch { /* zkusí se výřezy níž */ }

  /* Výřez od první [ po poslední ] a totéž pro { }. Pokrývá prózu okolo
     i odpověď, kde model utrousí větu před JSON. */
  for (const [o, z] of [["[", "]"], ["{", "}"]]) {
    const a = clean.indexOf(o), b = clean.lastIndexOf(z);
    if (a === -1 || b === -1 || b < a) continue;
    try { kandidati.push(JSON.parse(clean.slice(a, b + 1))); } catch { /* další kandidát */ }
  }

  for (const k of kandidati) {
    const pole = naPoleZaznamu(k);
    if (pole) return pole;
  }

  /* Nedá se přečíst. Ukázka odpovědi je jediné, z čeho se příště pozná proč —
     bez ní zbyde jen pozice znaku v textu, který už nikdo neuvidí. */
  const ukazka = clean.slice(0, 300).replace(/\s+/g, " ");
  throw new Error(`v odpovědi není seznam hodnocení; začátek odpovědi: ${ukazka}`);
}

/** Převede přijatelný tvar odpovědi na pole záznamů, jinak null. */
function naPoleZaznamu(k) {
  if (Array.isArray(k)) {
    // Pole záznamů. Pole řetězců (typicky vyříznuté „sources") se nepočítá.
    return k.some(jeZaznam) ? k : null;
  }
  if (!k || typeof k !== "object") return null;

  if (Array.isArray(k.items) && k.items.some(jeZaznam)) return k.items;
  // Jiné rozumné klíče, kdyby model pojmenoval obálku po svém.
  for (const klic of ["hodnoceni", "evaluations", "results", "data", "body"]) {
    if (Array.isArray(k[klic]) && k[klic].some(jeZaznam)) return k[klic];
  }
  // Jediný bod vrácený jako holý objekt — přesně případ delta kapitoly s 1 bodem.
  if (jeZaznam(k)) return [k];
  /* Mapa id → záznam. Klíč je zdroj pravdy o id: kdyby ho vnitřek neměl nebo
     měl jiné, platí ten z klíče, jinak by záznam spadl na kontrole VALID_IDS. */
  const hodnoty = Object.entries(k);
  if (hodnoty.length && hodnoty.every(([id, v]) =>
    /^\d+\.\d+$/.test(id) && v && typeof v === "object" && !Array.isArray(v))) {
    return hodnoty.map(([id, v]) => ({ ...v, id }));
  }
  return null;
}
