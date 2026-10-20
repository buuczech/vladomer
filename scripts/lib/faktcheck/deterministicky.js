/* scripts/lib/faktcheck/deterministicky.js — deterministická kontrola faktů (spec 004, vrstva D).
 *
 * Co program ví přesně, kontroluje program — model se na to neptá (ústava, II).
 * Každý nález má závažnost:
 *   CHYBA     tvrzení je prokazatelně nepravdivé proti primárnímu záznamu
 *             (číslo předpisu, které ve Sbírce není; datum vyhlášení jiné než
 *             v e-Sbírce; doklad datovaný do budoucnosti). Nese-li tvrzení stav,
 *             bod se podrží na posledním ověřeném záznamu (vrstva R).
 *   VAROVANI  podezření, které může být i v pořádku (anglický překlad uvádí
 *             jiné číslo, protože česky je slovy; doklad starší než nástup
 *             vlády u „probíhá“). Posoudí ho modelová vrstva a člověk.
 *
 * Hlavně se tu NEOPISUJÍ pravidla pipeline: existence předpisu je overZnacky
 * a datum vyhlášení opravDatumVyhlaseni z lib/sbirka.js — tytéž funkce, podle
 * kterých evaluate.js hodnocení zapsal.
 *
 * Kalibrace na datech z 20. 10. 2026 (proto nejsou budoucí data v komentáři
 * chybou): 9 „budoucích“ dat v komentářích byly vesměs účinnosti („od 1. 1.
 * 2027“), jediné dva rozdíly cs/en byly „8. červen 2026“ v prvním pádě (parser
 * ho dřív neznal) a „devět procent“ slovy proti „9 %“.
 */
import { overZnacky, hlavniPredpis, opravDatumVyhlaseni } from "../sbirka.js";

const pad = (n) => String(n).padStart(2, "0");

/* Měsíce česky v 1. i 2. pádě. Delší tvary první: „červenec“ před „červen“. */
const MESICE_CS = [
  ["ledna", 1], ["leden", 1], ["února", 2], ["únor", 2], ["března", 3], ["březen", 3], ["dubna", 4], ["duben", 4],
  ["května", 5], ["květen", 5], ["července", 7], ["červenec", 7], ["června", 6], ["červen", 6], ["srpna", 8], ["srpen", 8],
  ["září", 9], ["října", 10], ["říjen", 10], ["listopadu", 11], ["listopad", 11], ["prosince", 12], ["prosinec", 12],
];
const MESIC_CS = new Map(MESICE_CS);
const RE_MESIC_CS = new RegExp(`\\b(\\d{1,2})\\.\\s?(${MESICE_CS.map(([m]) => m).join("|")})\\s(\\d{4})\\b`, "gu");
const MESICE_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Data v českém textu jako RRRR-MM-DD (číslem, slovem, ISO). */
export function datumyCs(text) {
  const t = String(text || "");
  const out = [];
  for (const m of t.matchAll(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/g)) out.push(`${m[3]}-${pad(m[2])}-${pad(m[1])}`);
  for (const m of t.matchAll(RE_MESIC_CS)) out.push(`${m[3]}-${pad(MESIC_CS.get(m[2]))}-${pad(m[1])}`);
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(m[0]);
  return out;
}

/** Data v anglickém textu („16 Dec 2025“, „June 8, 2026“, ISO). */
export function datumyEn(text) {
  const t = String(text || "");
  const out = [];
  for (const m of t.matchAll(/\b(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s(\d{4})\b/g)) out.push(`${m[3]}-${pad(MESICE_EN[m[2].toLowerCase()])}-${pad(m[1])}`);
  for (const m of t.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s(\d{1,2}),?\s(\d{4})\b/g)) out.push(`${m[3]}-${pad(MESICE_EN[m[1].toLowerCase()])}-${pad(m[2])}`);
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(m[0]);
  return out;
}

/** Čísla předpisů („152/2026 Sb.“, v angličtině i „Coll.“). */
export function znackySb(text) {
  return [...String(text || "").matchAll(/(\d{1,4})\s*\/\s*(\d{4})\s+(?:Sb|Coll)\b/g)].map((m) => `${Number(m[1])}/${m[2]}`);
}

/** Procenta jako čísla („9 %“, „4,5 %“). Slovy psaná („devět procent“) se nečtou. */
export function procenta(text) {
  return [...String(text || "").matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((m) => m[1].replace(",", "."));
}

const multimnozina = (pole) => [...pole].sort().join(", ");
const POLARITA = [
  ["fulfilled", /^(ano,\s*)?splněno\b/i],
  ["partial", /^(ano,\s*)?částečně splněno\b/i],
  ["broken", /^(ne,\s*)?(porušeno|slib (byl )?porušen)\b/i],
];

/**
 * Nálezy jednoho bodu.
 * @param id       id bodu
 * @param e        záznam z evaluations.json
 * @param kontext  { dnes: "RRRR-MM-DD", nastup: "RRRR-MM-DD", rejstrik: Map | null }
 * @returns [{ bod, pravidlo, zavaznost, nesestav, text }]
 *   nesestav = nález se týká tvrzení, na kterém stojí stav (doklad, „splněno“/„porušeno“)
 */
export function kontrolaBodu(id, e, { dnes, nastup, rejstrik = null }) {
  const nalezy = [];
  const pridej = (pravidlo, zavaznost, text, nesestav = false) => nalezy.push({ bod: id, pravidlo, zavaznost, nesestav, text });
  const silny = e.status === "fulfilled" || e.status === "broken";

  // D1 — datum dokladu
  if (e.evidenceDate && e.evidenceDate > dnes) {
    pridej("doklad-z-budoucnosti", "CHYBA", `datum dokladu ${e.evidenceDate} je po dni běhu ${dnes}`, true);
  }
  if (e.evidenceDate && e.evidenceDate < nastup && !silny) {
    pridej("doklad-pred-nastupem", "VAROVANI", `doklad z ${e.evidenceDate}, před nástupem vlády ${nastup}, nese stav „${e.status}“ — jde o krok této vlády?`, false);
  }

  // D2 — předpisy proti rejstříku Sbírky (tytéž funkce jako evaluate.js)
  if (rejstrik) {
    const texty = [["doklad", e.evidence], ["komentář", e.comment && e.comment.cs], ["změna", e.change && e.change.cs]];
    for (const [kde, text] of texty) {
      if (!text) continue;
      const z = overZnacky(text, rejstrik);
      if (!z) continue;
      for (const kod of z.neexistujici) {
        pridej("neexistujici-predpis", "CHYBA", `${kde} cituje ${kod} Sb., který ve Sbírce zákonů není`, kde === "doklad" || silny);
      }
      if (kde === "doklad" && z.overene.length === 1) {
        const hlavni = hlavniPredpis(z.overene);
        if (opravDatumVyhlaseni(text, hlavni.vyhlaseno).zmeneno) {
          pridej("datum-vyhlaseni", "CHYBA", `doklad uvádí jiné datum vyhlášení ${hlavni.kod} Sb., než má e-Sbírka (${hlavni.vyhlaseno})`, true);
        }
      }
    }
    // „splněno“ s ověřeným předpisem: datum dokladu má být datum vyhlášení (evaluate.js ho tak zapisuje)
    if (e.status === "fulfilled" && e.sbirka && e.sbirka.overene && e.sbirka.overene.length) {
      const hlavni = hlavniPredpis(e.sbirka.overene);
      if (e.evidenceDate && e.evidenceDate !== hlavni.vyhlaseno) {
        pridej("datum-dokladu-vs-sbirka", "VAROVANI", `datum dokladu ${e.evidenceDate}, ale ${hlavni.kod} Sb. vyhlášen ${hlavni.vyhlaseno}`, true);
      }
    }
  }

  // D3 — česká a anglická verze říkají totéž (data, předpisy, procenta)
  for (const pole of ["comment", "change"]) {
    const cs = (e[pole] && e[pole].cs) || "";
    const en = (e[pole] && e[pole].en) || "";
    if (!cs || !en) continue;
    for (const [co, f, g] of [["data", datumyCs, datumyEn], ["předpisy", znackySb, znackySb], ["procenta", procenta, procenta]]) {
      const a = multimnozina(f(cs)), b = multimnozina(g(en));
      if (a !== b) pridej("cs-en", "VAROVANI", `${pole}: ${co} se liší — cs [${a}], en [${b}]`, false);
    }
  }

  // D6 — komentář na začátku tvrdí jiný stav než status
  const zacatek = ((e.comment && e.comment.cs) || "").trim();
  for (const [stav, re] of POLARITA) {
    if (re.test(zacatek) && e.status !== stav) {
      pridej("polarita", "VAROVANI", `komentář začíná „${zacatek.slice(0, 40)}…“, ale stav je „${e.status}“`, true);
    }
  }
  return nalezy;
}

/** Roky citované v datech — kvůli načtení rejstříku i pro starší novelizované zákony. */
export function citovaneRoky(evals) {
  const roky = new Set();
  for (const e of Object.values(evals)) {
    for (const t of [e.evidence, e.comment && e.comment.cs, e.change && e.change.cs]) {
      for (const k of znackySb(t)) roky.add(Number(k.split("/")[1]));
    }
  }
  return [...roky].sort();
}
