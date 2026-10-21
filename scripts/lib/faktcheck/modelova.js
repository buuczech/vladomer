/* scripts/lib/faktcheck/modelova.js — modelová kontrola faktů (spec 004, vrstva M).
 *
 * Nezávislý model (faktcheck_model, výchozí Opus 5.5 — silnější a jiný než
 * hodnotitel) dostane, co web o bodu tvrdí, texty zdrojů stažené programem
 * (vrstva D, scripts/faktcheck.js) a pravidla vlastníka (scripts/nastaveni/
 * metodika.md). Rozloží text na tvrzení, ke každému dá verdikt s doslovnou
 * citací a podle pravidel řekne, jaký stav fakta zakládají.
 *
 * Kontrola kontrolora je v kódu, ne v promptu: citace se hledá ve staženém
 * textu zdroje znak po znaku (po sjednocení mezer, uvozovek a pomlček). Co
 * tam není, je NEOVERITELNE, ať model napsal cokoli — sebejistá fabulace
 * vypadá přesně jako citace, a jen text zdroje ji odliší (CLAUDE.md:
 * „wherever a check reads prose the model produced, ask what a confident
 * fabrication looks like to it“).
 */
import { render } from "../nastaveni.js";
import { vyrezy } from "../odpoved.js";

const VERDIKTY = new Set(["POTVRZENO", "VYVRACENO", "ZASTARALE", "NEOVERITELNE"]);
const STAVY = new Set(["fulfilled", "partial", "in_progress", "declared", "not_started", "broken"]);

/* Znění slibu s kapitolou a oddílem a pravidla vlastníka dostávají
   hodnotitel, ověřovatelé i kontrola faktů z jednoho místa (lib/prompty.js),
   aby se mezi rolemi nemohly rozejít. */
export { slibySKontextem, nactiMetodiku } from "../prompty.js";

const REZIM = {
  1: "KOLO 1: pracuj JEN s texty zdrojů výše. Nevyhledávej. Co v nich není, je NEOVERITELNE.",
  2: "KOLO 2: zdroje výše tvrzení nepotvrdily. Smíš vyhledávat (web search) na povolených webech. Citovat smíš jen stránku, kterou jsi našel, a citace musí doslova stát v jejím textu — program si stránku stáhne a citaci v ní dohledá. Úřední prameny (e-sbirka.gov.cz, psp.cz, senat.cz, vlada.gov.cz) mají přednost.",
};

/* Úřední údaje e-Sbírky jako citovatelný zdroj. Číslo, název a datum
   vyhlášení předpisu program ověřil v rejstříku Sbírky (vrstva D). Model je
   bez nich neměl odkud citovat a značil je „neověřitelné“ — v měření
   20. 10. 2026 tak „neověřil“ zákon 90/2026 Sb. u bodu 2.10, který program
   v e-Sbírce našel. Stránky e-Sbírky jsou aplikace v JavaScriptu, stažený
   text je prázdný, takže zdroj skládá program z rejstříku. */
const MESICE = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const datumCs = (iso) => { const [r, m, d] = String(iso).split("-").map(Number); return `${d}. ${MESICE[m - 1]} ${r}`; };
export function zdrojeSbirky(predpisy = []) {
  const videno = new Set();
  const out = [];
  for (const p of predpisy) {
    if (!p.nazev || !p.url || videno.has(p.kod)) continue;
    videno.add(p.kod);
    out.push({ url: p.url, text: `e-Sbírka, úřední údaje Sbírky zákonů ověřené programem: ${p.kod} Sb. — ${p.nazev}. Vyhlášeno ${datumCs(p.vyhlaseno)} (${p.vyhlaseno}).` });
  }
  return out;
}

/**
 * Prompt kontroly jednoho bodu.
 * @param zdroje  [{ url, text, bezZkraceni? }] — texty stažené vrstvou D (zkrácené; úplný seznam Sněmovny ne)
 * @param predpisy [{ kod, nazev, vyhlaseno }] — citované předpisy z rejstříku
 */
export function promptKontroly({ id, slib, e, predpisy = [], zdroje = [], metodika, dnes, nastup, kolo = 1, maxZnakuZdroje = 8000 }) {
  const stav = `${e.status}${e.unverifiable ? " (neměřitelné)" : ""}`;
  const predpisyText = predpisy.length
    ? predpisy.map((p) => `- ${p.kod} Sb.${p.nazev ? ` — ${p.nazev}, vyhlášeno ${p.vyhlaseno}` : " — ve Sbírce zákonů NENÍ (nebo rok mimo rejstřík)"}`).join("\n")
    : "(žádné)";
  const zdrojeText = zdroje.length
    ? zdroje.map((z, i) => `[${i + 1}] ${z.url}\n${String(z.text || "").slice(0, z.bezZkraceni ? undefined : maxZnakuZdroje).replace(/\{\{/g, "{ {")}`).join("\n\n")
    : "(žádný zdroj se nepodařilo stáhnout)";
  const bezpecne = (s) => String(s || "—").replace(/\{\{/g, "{ {");
  return render("prompt-faktcheck.md", {
    DATUM_NASTUPU_VLADY: nastup,
    DNES: dnes,
    METODIKA: metodika,
    ID_BODU: id,
    ZNENI_SLIBU: bezpecne(slib),
    STAV: stav,
    DOKLAD: bezpecne(e.evidence),
    DATUM_DOKLADU: e.evidenceDate || "—",
    KOMENTAR: bezpecne(e.comment && e.comment.cs),
    ZMENA: bezpecne(e.change && e.change.cs),
    PREDPISY: predpisyText,
    ZDROJE: zdrojeText,
    REZIM_KOLA: REZIM[kolo],
  });
}

/** Přečte odpověď: poslední spárovaný {…}, který má pole tvrzeni. */
export function parsujKontrolu(text) {
  const kandidati = [...vyrezy(String(text || ""), "{", "}")];
  for (let i = kandidati.length - 1; i >= 0; i--) {
    let j;
    try { j = JSON.parse(kandidati[i]); } catch { continue; }
    if (j && Array.isArray(j.tvrzeni)) {
      return {
        tvrzeni: j.tvrzeni.filter((t) => t && typeof t.text === "string").map((t) => ({
          text: t.text,
          verdikt: VERDIKTY.has(t.verdikt) ? t.verdikt : "NEOVERITELNE",
          nese_stav: t.nese_stav === true,
          citace: typeof t.citace === "string" ? t.citace : "",
          url: typeof t.url === "string" ? t.url : "",
          // Tvrzení, že něco NENASTALO — citací doložit nejde (pravidlo vlastníka A, 21. 10. 2026).
          absence: t.absence === true,
        })),
        stav_podle_pravidel: STAVY.has(j.stav_podle_pravidel) ? j.stav_podle_pravidel : null,
        pravidlo: typeof j.pravidlo === "string" && /^M\d+$/.test(j.pravidlo) ? j.pravidlo : null,
        zduvodneni: String(j.zduvodneni || "").slice(0, 600),
      };
    }
  }
  throw new Error(`kontrola: v odpovědi chybí objekt s polem „tvrzeni“ (JSON) — začátek: ${JSON.stringify(String(text || "").slice(0, 200))}`);
}

/* Sjednocení pro hledání citace: mezery, uvozovky, pomlčky, velikost písmen. */
export function normalizuj(s) {
  return String(s || "")
    .replace(/[   ]/g, " ")
    .replace(/[„“”"‚‘’'«»]/g, "\"")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export const klicUrl = (u) => String(u || "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").toLowerCase();

/**
 * Kontrola kontrolora: verdikt s citací platí, jen když citace doslova stojí
 * v textu zdroje, který program sám stáhl. Jinak NEOVERITELNE.
 * @param texty Map(klicUrl → text)
 */
export function overCitace(vysledek, texty) {
  let zahozeno = 0;
  const tvrzeni = vysledek.tvrzeni.map((t) => {
    if (t.verdikt === "NEOVERITELNE") return t;
    const text = texty.get(klicUrl(t.url));
    const citace = normalizuj(t.citace);
    let duvod = null;
    if (!text) duvod = "zdroj-nestazen";
    else if (citace.split(" ").length < 3) duvod = "citace-prilis-kratka";
    else if (!normalizuj(text).includes(citace)) duvod = "citace-nenalezena";
    if (!duvod) return { ...t, overeno: true };
    zahozeno++;
    return { ...t, puvodni_verdikt: t.verdikt, verdikt: "NEOVERITELNE", duvod_zahozeni: duvod };
  });
  return { ...vysledek, tvrzeni, zahozeno };
}

/**
 * Souhrn bodu pro vrstvu R a report.
 *   vyvraceno          ověřeně vyvrácená tvrzení, na kterých stojí stav → bod se podrží
 *   neovereno          tvrzení nesoucí stav, která se nepodařilo ověřit → kolo 2 / člověk
 *   neovereno_absence  z toho tvrzení, že něco NENASTALO („návrh nebyl předložen“):
 *                      citací doložit nejdou. Rozhodnutí vlastníka (21. 10. 2026,
 *                      varianta A): bod, jehož stav se nemění, kvůli nim nedrží —
 *                      KROMĚ „nezahájeno“, kde je tvrzení, že se nic nestalo,
 *                      celým důvodem stavu. Bez té výjimky by v měření 20. 10.
 *                      prošlo 15.7 „nezahájeno“, ačkoli zákon je ve výhledu
 *                      legislativních prací (pravda: „deklarováno“) — a podhodnotit
 *                      plnění je pro web horší směr. Při změně stavu drží vždy
 *                      (vrstva R). Platí do napojení otevřených dat Sněmovny (spec 006).
 *   spor_o_stav        pravidla dávají jiný stav, než má web → člověk
 */
export function shrnutiBodu(id, e, vysledek) {
  const nesouci = vysledek.tvrzeni.filter((t) => t.nese_stav);
  const vyvraceno = nesouci.filter((t) => t.verdikt === "VYVRACENO" || t.verdikt === "ZASTARALE");
  const stavWebu = e.unverifiable ? "unverifiable" : e.status;
  /* Absence nedrží jen tam, kde model z OVĚŘENÝCH faktů došel ke stejnému
     stavu, jaký má web. V měření 21. 10. prošlo 16.3 „deklarováno“ na
     tvrzeních „vláda se k programu nevyjádřila“ — ta stavu odporují, model
     stav podle pravidel neurčil (null) a pravda je „nezahájeno“. */
  const absenceDrzi = stavWebu === "not_started" || vysledek.stav_podle_pravidel !== e.status;
  const neovereno = nesouci.filter((t) => t.verdikt === "NEOVERITELNE" && (!t.absence || absenceDrzi));
  const neoverenoAbsence = nesouci.filter((t) => t.verdikt === "NEOVERITELNE" && t.absence);
  const spor = Boolean(vysledek.stav_podle_pravidel) && !e.unverifiable && vysledek.stav_podle_pravidel !== e.status;
  return {
    bod: id,
    stav_webu: stavWebu,
    stav_podle_pravidel: vysledek.stav_podle_pravidel,
    pravidlo: vysledek.pravidlo,
    vyvraceno: vyvraceno.length,
    neovereno: neovereno.length,
    neovereno_absence: neoverenoAbsence.length,
    potvrzeno: nesouci.filter((t) => t.verdikt === "POTVRZENO").length,
    spor_o_stav: spor,
    cisty: !vyvraceno.length && !neovereno.length && !spor,
  };
}
