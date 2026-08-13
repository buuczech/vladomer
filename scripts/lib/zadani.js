/* scripts/lib/zadani.js — kontrola souborů v ig-posts/.
 *
 * Zadání píše člověk, takže se kontroluje dřív, než se cokoli vykreslí nebo
 * označí k publikaci: chyba v souboru má spadnout hned a srozumitelně, ne až
 * na Instagramu.
 *
 * Formáty jsou dva a plánovač je jeden, proto kontrola bydlí tady a ne
 * v jednotlivých skriptech — jinak by plánovač musel mít vlastní kopii
 * pravidel, která by se rozešla s tou, podle které se doopravdy kreslí.
 *
 * Zadání bez pole „typ" je carousel; historické soubory tak fungují dál.
 */
import { MAX_SLIDU } from "./instagram.js";

export const PROLNUTI = 0.5;     // prolnutí mezi scénami reelu, ve vteřinách
export const MIN_DELKA = 3;      // Instagram bere reel od tří vteřin
export const MAX_DELKA = 90;     // delší reel tenhle automat nedělá
export const MAX_BODU = 4;       // bodů na jednu scénu reelu
export const MAX_KOMENTAR = 220; // znaků mluveného textu na scénu, zhruba 14 s

const chyba = (chyby) => {
  if (chyby.length) throw new Error(`zadání není v pořádku:\n        - ${chyby.join("\n        - ")}`);
};

/** Scény se překrývají o prolnutí, takže výsledek je kratší než jejich součet. */
export function celkovaDelka(z) {
  const sceny = z.sceny || [];
  const soucet = sceny.reduce((s, x) => s + (Number(x.trvani) || 0), 0);
  return Math.round((soucet - PROLNUTI * Math.max(0, sceny.length - 1)) * 100) / 100;
}

export function zkontrolujCarousel(z) {
  const chyby = [];
  if (!z.titulek) chyby.push("chybí „titulek“");
  if (!z.popisek) chyby.push("chybí „popisek“");
  if (!Array.isArray(z.slidy) || !z.slidy.length) chyby.push("chybí „slidy“ (aspoň jeden)");
  (z.slidy || []).forEach((s, i) => {
    const kde = `slide ${i + 1}`;
    if (!s.nadpis) chyby.push(`${kde}: chybí „nadpis“`);
    if (!Array.isArray(s.body) || !s.body.length) chyby.push(`${kde}: chybí „body“`);
    if (s.typ && !["odrazky", "kroky"].includes(s.typ)) {
      chyby.push(`${kde}: „typ“ musí být „odrazky“ nebo „kroky“, ne „${s.typ}“`);
    }
    if ((s.body || []).length > 5) chyby.push(`${kde}: ${s.body.length} bodů se na slide nevejde, nejvýš 5`);
  });
  // Obálka plus informační slidy; Instagram bere v carouselu 2 až 10 obrázků.
  const celkem = 1 + (z.slidy || []).length;
  if (celkem > MAX_SLIDU) {
    chyby.push(`celkem ${celkem} slidů, Instagram jich v carouselu unese nejvýš ${MAX_SLIDU}`);
  }
  chyba(chyby);
}

export function zkontrolujReel(z) {
  const chyby = [];
  if (!z.popisek) chyby.push("chybí „popisek“");
  if (!Array.isArray(z.sceny) || z.sceny.length < 2) chyby.push("chybí „sceny“ (aspoň dvě)");
  if (z.hudba !== undefined && typeof z.hudba !== "string") {
    chyby.push("„hudba“ musí být „auto“, „zadna“, nebo jméno souboru ve scripts/nastaveni/hudba/");
  }

  (z.sceny || []).forEach((s, i) => {
    const kde = `scéna ${i + 1}`;
    if (!["text", "cislo", "body"].includes(s.typ)) {
      chyby.push(`${kde}: „typ“ musí být text, cislo nebo body`);
      return;
    }
    /* Mluvené slovo patří ke každé scéně. Když ho tam někdo výjimečně nechce,
       musí to napsat prázdným řetězcem — aby se na komentář nedalo zapomenout
       jenom tím, že se pole vynechá. */
    if (typeof s.komentar !== "string") {
      chyby.push(`${kde}: chybí „komentar“ (mluvený text; prázdný řetězec = scéna beze slov)`);
    } else if (s.komentar.length > MAX_KOMENTAR) {
      chyby.push(`${kde}: komentář má ${s.komentar.length} znaků, nejvýš ${MAX_KOMENTAR} `
        + "— delší věta scénu neúnosně natáhne");
    }
    if (!(s.trvani > 0)) chyby.push(`${kde}: chybí kladné „trvani“ ve vteřinách`);
    else if (s.trvani <= PROLNUTI) chyby.push(`${kde}: „trvani“ musí být delší než prolnutí ${PROLNUTI} s`);
    if (s.typ === "text" && !s.titulek) chyby.push(`${kde}: chybí „titulek“`);
    if (s.typ === "cislo" && (s.cislo === undefined || s.cislo === "")) chyby.push(`${kde}: chybí „cislo“`);
    if (s.typ === "body") {
      if (!s.nadpis) chyby.push(`${kde}: chybí „nadpis“`);
      if (!Array.isArray(s.body) || !s.body.length) chyby.push(`${kde}: chybí „body“`);
      // Reel se čte v pohybu; víc řádků si nikdo nestihne přečíst.
      if ((s.body || []).length > MAX_BODU) {
        chyby.push(`${kde}: ${s.body.length} bodů je na reel moc, nejvýš ${MAX_BODU}`);
      }
    }
  });

  const delka = celkovaDelka(z);
  if (delka < MIN_DELKA) chyby.push(`celkem ${delka} s, Instagram bere reel od ${MIN_DELKA} s`);
  if (delka > MAX_DELKA) chyby.push(`celkem ${delka} s, tenhle automat dělá reely nejvýš ${MAX_DELKA} s`);

  chyba(chyby);
}

/** Vrátí „reel" nebo „carousel"; neznámý typ odmítne. */
export function druh(z) {
  if (!z.typ || z.typ === "carousel") return "carousel";
  if (z.typ === "reel") return "reel";
  throw new Error(`neznámý „typ“ zadání: „${z.typ}“. Povolené je „reel“, nebo pole vynechat (carousel).`);
}

/** Zkontroluje zadání podle jeho druhu a druh vrátí. */
export function zkontroluj(z) {
  const d = druh(z);
  if (d === "reel") zkontrolujReel(z); else zkontrolujCarousel(z);
  return d;
}
