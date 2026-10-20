/* scripts/dev/parita/zmrazit.js — loader pro `node --import`, který z běhu
 * evaluate.js udělá deterministický pokus bez sítě a bez peněz.
 *
 *     PARITA_ODPOVEDI=synteticke ANTHROPIC_API_KEY=parita \
 *       node --import ./scripts/dev/parita/zmrazit.js scripts/evaluate.js
 *
 * Obvykle ho nespouštíš ručně — volá ho porovnej-vetve.js, a to pro OBĚ
 * strany (main i DEV2) tentýž soubor. Rozdíl ve výsledku pak může pocházet
 * jen z kódu pipeline, ne z prostředí, ve kterém běžel.
 *
 * Co dělá (stejný princip jako dump-prompts.js, evaluate.js zůstává netknutý):
 *   - Date: bez argumentů vrací PARITA_DNES (výchozí 2026-10-20T06:00Z).
 *   - setTimeout: čekání delší než 50 ms se zkrátí na nulu.
 *   - fetch:
 *       api.anthropic.com → podle PARITA_ODPOVEDI:
 *           synteticke  deterministický simulátor (syntetika.js)
 *           prazdne     „[]“ jako dump-prompts (cesty selhání a doptání)
 *           kazeta      přehrání nahrané odpovědi podle hashe těla
 *           nahrat      SKUTEČNÉ volání a zápis do kazety — STOJÍ PENÍZE,
 *                       jen ručně a jen s platným ANTHROPIC_API_KEY
 *       e-sbirka.gov.cz → fixtury ze scripts/dev/fixtury/ (v kazetě
 *                       a při nahrávání skutečná odpověď)
 *       cokoli jiného  → chyba. Parita nesmí sahat na živý web.
 *   - Každé tělo požadavku na model se připíše do PARITA_POZADAVKY (JSONL).
 *
 * Neznámý požadavek při přehrávání kazety je chyba, nikdy tiché pokračování:
 * prázdná odpověď by se v běhu tvářila jako klidný týden.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { odpovez, druhPozadavku } from "./syntetika.js";
import { kanonicky } from "./kanonicky.js";

const ZDE = dirname(fileURLToPath(import.meta.url));
const FIXTURY = join(ZDE, "..", "fixtury");
const REZIM = process.env.PARITA_ODPOVEDI || "synteticke";
const DNES = Date.parse(process.env.PARITA_DNES || "2026-10-20T06:00:00.000Z");
const POZADAVKY = process.env.PARITA_POZADAVKY || null;
const KAZETA = process.env.PARITA_KAZETA || null;

if (!["synteticke", "prazdne", "kazeta", "nahrat"].includes(REZIM)) {
  throw new Error(`PARITA_ODPOVEDI="${REZIM}" — povoleno synteticke | prazdne | kazeta | nahrat`);
}
if (Number.isNaN(DNES)) throw new Error(`PARITA_DNES není platné datum: ${process.env.PARITA_DNES}`);
if ((REZIM === "kazeta" || REZIM === "nahrat") && !KAZETA) throw new Error("režim kazeta/nahrat potřebuje PARITA_KAZETA");

/* Vstupní data strany se čtou TEĎ, před během: evaluate.js je na konci
   přepíše a simulátor má odpovídat podle toho, co běh dostal, ne podle toho,
   co vyrobil. */
const cist = (p, vychozi) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : vychozi);
const KONTEXT = {
  evals: cist(join(process.cwd(), "public", "evaluations.json"), { evals: {} }).evals || {},
  news: cist(join(process.cwd(), "public", "news.json"), { items: [] }).items || [],
  dnes: DNES,
};
const SBIRKA_REJSTRIK = JSON.parse(readFileSync(join(FIXTURY, "sbirka-rejstrik.json"), "utf8"));
const SBIRKA_ZNENI = JSON.parse(readFileSync(join(FIXTURY, "sbirka-zneni.json"), "utf8"));
/* Fixtura rejstříku je výřez a nemá ani jeden předpis, ke kterému je ve
   fixtuře i znění se skutečným textem — ověřovatel by tak nikdy nedostal
   cestu „znění načteno“. Doplní se proto dva předpisy, jejichž znění fixtura
   má (90 a 91/2026), s názvem označeným jako simulace. Jen tady, ne ve
   sdílené fixtuře, kterou čte test-sbirka.js. */
SBIRKA_REJSTRIK["2026"] = JSON.parse(JSON.stringify(SBIRKA_REJSTRIK["2026"]));
SBIRKA_REJSTRIK["2026"].dokumentySbirkyVMesici.push({ mesic: 4, sbirkyDokumentuSbirky: [{ dokumentySbirkyRejstrikInfo: [
  { staleUrl: "/sb/2026/90", nazev: "Zákon, kterým se mění zákon o pojistném na veřejné zdravotní pojištění (simulace parity)", kodDokumentuSbirky: "90/2026 Sb.", stavDokumentuSbirky: "AKTUALNE_PLATNY", datum: "2026-04-14" },
  { staleUrl: "/sb/2026/91", nazev: "Zákon, kterým se mění stavební zákon (simulace parity)", kodDokumentuSbirky: "91/2026 Sb.", stavDokumentuSbirky: "AKTUALNE_PLATNY", datum: "2026-04-14" },
] }] });
KONTEXT.predpisy2026 = predpisyZFixtury(SBIRKA_REJSTRIK["2026"]);

function predpisyZFixtury(odpoved) {
  const out = [];
  for (const mesic of (odpoved && odpoved.dokumentySbirkyVMesici) || []) {
    for (const s of mesic.sbirkyDokumentuSbirky || []) {
      for (const d of s.dokumentySbirkyRejstrikInfo || []) {
        const kod = String(d.kodDokumentuSbirky || "").replace(/\s*Sb\.?$/, "");
        if (/^\d+\/\d{4}$/.test(kod) && /^Zákon|^Nařízení/.test(d.nazev || "")) out.push(kod);
      }
    }
  }
  return out.sort();
}

/* --- čas a čekání ------------------------------------------------------- */
const SkutecneDate = Date;
class ZmrazeneDate extends SkutecneDate {
  constructor(...a) { if (a.length) super(...a); else super(DNES); }
  static now() { return DNES; }
}
globalThis.Date = ZmrazeneDate;

const skutecnyTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => skutecnyTimeout(fn, ms > 50 ? 0 : ms, ...a);

/* --- kazeta ------------------------------------------------------------- */
const hash = (s) => createHash("sha256").update(s).digest("hex");

const kazeta = REZIM === "kazeta" ? cist(KAZETA, null) : (REZIM === "nahrat" ? { verze: 1, polozky: [] } : null);
if (REZIM === "kazeta" && !kazeta) throw new Error(`kazeta ${KAZETA} neexistuje`);
const podleHashe = new Map((kazeta?.polozky || []).map((p) => [p.hash, p]));
if (REZIM === "nahrat") {
  process.on("exit", () => {
    mkdirSync(dirname(KAZETA), { recursive: true });
    writeFileSync(KAZETA, JSON.stringify({ ...kazeta, nahrano: new SkutecneDate().toISOString() }, null, 1));
    console.error(`[parita] kazeta: ${kazeta.polozky.length} položek → ${KAZETA}`);
  });
}

/* --- fetch -------------------------------------------------------------- */
const skutecnyFetch = globalThis.fetch;
let poradi = 0;

const odpovedJson = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => JSON.parse(JSON.stringify(data)),
  text: async () => JSON.stringify(data),
});

function sbirkaZFixtury(url, opt) {
  if (url.includes("/chronologicke-rejstriky/dokumenty-sbirky-po-mesicich")) {
    const rok = String(JSON.parse(opt.body).rok);
    return SBIRKA_REJSTRIK[rok] ? odpovedJson(SBIRKA_REJSTRIK[rok]) : odpovedJson({ chyba: "rok mimo fixturu" }, 404);
  }
  const m = decodeURIComponent(url).match(/\/sb\/(\d{4})\/(\d+)\/fragmenty/);
  if (m && SBIRKA_ZNENI[`${m[2]}/${m[1]}`]) return odpovedJson(SBIRKA_ZNENI[`${m[2]}/${m[1]}`]);
  return odpovedJson({ chyba: "mimo fixturu" }, 404);
}

globalThis.fetch = async (vstup, opt = {}) => {
  const url = String(vstup);
  const klicSbirky = `${opt.method || "GET"} ${url} ${opt.body || ""}`;

  if (url.startsWith("https://e-sbirka.gov.cz/")) {
    if (REZIM === "kazeta") {
      const p = podleHashe.get(hash(klicSbirky));
      if (!p) throw new Error(`[parita] e-Sbírka: požadavek není v kazetě: ${klicSbirky.slice(0, 160)}`);
      return odpovedJson(p.odpoved, p.status || 200);
    }
    if (REZIM === "nahrat") {
      const res = await skutecnyFetch(url, opt);
      const data = await res.json();
      kazeta.polozky.push({ hash: hash(klicSbirky), typ: "sbirka", klic: klicSbirky, status: res.status, odpoved: data });
      return odpovedJson(data, res.status);
    }
    return sbirkaZFixtury(url, opt);
  }

  if (url === "https://api.anthropic.com/v1/messages") {
    const telo = JSON.parse(opt.body);
    const druh = druhPozadavku(telo);
    poradi++;
    if (POZADAVKY) {
      mkdirSync(dirname(POZADAVKY), { recursive: true });
      appendFileSync(POZADAVKY, JSON.stringify({ n: poradi, druh, telo }) + "\n");
    }
    const h = hash(kanonicky(telo));
    if (REZIM === "prazdne") {
      return odpovedJson({ type: "message", role: "assistant", model: telo.model, stop_reason: "end_turn",
        content: [{ type: "text", text: "[]" }], usage: { input_tokens: 0, output_tokens: 1 } });
    }
    if (REZIM === "synteticke") return odpovedJson(odpovez(telo, KONTEXT));
    if (REZIM === "kazeta") {
      const p = podleHashe.get(h);
      if (!p) {
        throw new Error(`[parita] požadavek č. ${poradi} (${druh}) není v kazetě — tělo se liší od nahraného. `
          + "Buď se změnil program, nebo kazeta patří k jinému vstupu.");
      }
      return odpovedJson(p.odpoved, p.status || 200);
    }
    // nahrat — skutečné volání, stojí peníze
    const res = await skutecnyFetch(url, opt);
    const data = await res.json();
    kazeta.polozky.push({ hash: h, typ: "model", druh, telo, status: res.status, odpoved: data });
    return odpovedJson(data, res.status);
  }

  throw new Error(`[parita] zakázaný síťový požadavek: ${url.slice(0, 120)} — parita běží bez živého webu`);
};
