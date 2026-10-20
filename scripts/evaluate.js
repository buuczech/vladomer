/* scripts/evaluate.js
 * Weekly server-side evaluation.
 *  - Grades each commitment from MULTIPLE angles ("yes, but…" / "no, but…").
 *  - Feeds last week's status + comment + history into the prompt.
 *  - Captures the URLs the web search actually returned and keeps only the
 *    model-cited ones that match those real results (invented URLs dropped).
 *  - Writes public/evaluations.json AND appends a weekly snapshot to history.json.
 *
 * NOTE: no assistant "prefill" is used — prefilling the reply suppresses the
 * web_search tool, which would mean no real sources and weaker grounding.
 * JSON is kept clean via instruction + bracket extraction + retry instead.
 *
 * Run:  ANTHROPIC_API_KEY=sk-ant-... npm run evaluate
 *
 * Set CHAPTER_LIMIT=1 to only evaluate the first N chapters (used by the
 * dev branch's workflow to test cheaply without spending on all 18).
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { CHAPTERS, DATES } from "../src/data.js";
import { render, readList, readSettings, assertFields } from "./lib/nastaveni.js";
import {
  POLE_KOREKTURY, jazykPole, ctiPole, zapisPole, ocisti, opravDavku, zkontrolujPrompt,
} from "./lib/korektura.js";
/* Sestavení promptů žije v samostatném modulu, protože je používá i build
   pro sekci „Použité prompty" na webu. Tady se tedy nic neskládá ručně —
   jinak by se ukázka na webu mohla rozejít s tím, co se opravdu odesílá. */
import {
  STATUSES, STATUS_CS, promptHodnoceni, promptZpravy, promptHodnoceniKontrola,
  promptOvereniPrechodu, promptDeltaScan, promptDoptani,
} from "./lib/prompty.js";
import { duvodDegradace, CIL_DEGRADACE } from "./lib/dukaz.js";
import { posudPrechod, stavOd as spocitejStavOd } from "./lib/prechody.js";
import { parsujDeltaOdpoved, planKapitoly, prenesNeprehodnocene } from "./lib/delta.js";
import { parsujHodnoceni, vyrezy } from "./lib/odpoved.js";
import { nactiRejstrik, overZnacky, hlavniPredpis, opravDatumVyhlaseni, tabulkaRejstriku, popisProOverovatele, nactiZneni } from "./lib/sbirka.js";

/* Prompty, čísla a seznamy zdrojů žijí ve scripts/nastaveni/, aby se daly
   upravovat bez zásahu do JavaScriptu. Špatná úprava tam zastaví běh českou
   chybou ještě před prvním voláním API — nikdy nemůže vzniknout napůl
   vyrenderovaný prompt. */
const NAST = readSettings();
const WEBY_HODNOCENI = readList("weby-hodnoceni.txt");
const WEBY_ZPRAVY = readList("weby-zpravy.txt");

// Nothing this cabinet did can predate its own appointment. The first full run
// on the strict scale credited it with laws published in August 2025 — i.e.
// the previous government's work — so the cut-off is enforced in code.

const CHAPTER_LIMIT = process.env.CHAPTER_LIMIT ? Number(process.env.CHAPTER_LIMIT) : CHAPTERS.length;

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || NAST.model; // env still wins, for one-off experiments
const KOR_MODEL = process.env.KOREKTURA_MODEL || NAST.korektura_model;
/* Měřicí režim „stabilita" (dev-eval.yml) běží hodnocení dvakrát a porovnává
   stavy. Korektura ani zprávy stav neovlivňují, jen by se za ně dvakrát
   platilo — tyhle přepínače je vypnou. V ostrém běhu se NIKDY nenastavují.

   Čte se HODNOTA, ne pouhá přítomnost: `BEZ_KOREKTURY=0` je neprázdný řetězec,
   a tedy v JS pravdivý. Generálka 22. 8. 2026 kvůli tomu proběhla bez korektury,
   přestože ji zapínala — a netestovala právě to, kvůli čemu se pouštěla. */
function zapnuto(jmeno) {
  const v = String(process.env[jmeno] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "ano" || v === "yes";
}

const KOREKTURA_MODELEM = NAST.korektura === 1 && !zapnuto("BEZ_KOREKTURY");
const SE_ZPRAVAMI = !zapnuto("BEZ_ZPRAV");
/* Operational, deliberately NOT in nastaveni.txt: too low silently truncates
   the JSON reply, which looks like a model failure and burns retries.
   Separate budgets because every web_search round is part of the output —
   the headline call does up to vyhledavani_zpravy of them (12) against the
   chapter call's 4, so it needs materially more room before the JSON starts.
   Raising vyhledavani_zpravy without raising this is what broke the
   2026-07-29 run ("no JSON array in response"). */
const MAX_TOKENS = 6000;
/* Nejvíc bodů na jeden dotaz. Odpověď roste s počtem bodů i s délkou
   komentářů a při překročení max_tokens se JSON usekne uprostřed — chyba pak
   vypadá jako „Expected ',' or '}'", ne jako došlé tokeny, a opakování
   nepomůže, protože strop platí pokaždé stejně. Kapitola 2 (15 bodů) takhle
   4× po sobě prošla a 21. 8. 2026 začala padat, jak komentáře narostly.
   Kapitoly s deseti body dosud drží; kdyby začala padat i některá z nich,
   stačí tohle číslo snížit. */
const MAX_BODU_DAVKA = 10;
const MAX_TOKENS_ZPRAVY = 12000;
/* Korektura nevyhledává, ale vrací celý opravený úryvek, ne jen opravené
   slovo. Největší dávka (kapitola 2, 15 bodů, oba jazyky) má ~10 500 znaků;
   přepsaná celá vyjde asi na 4 300 tokenů. 8000 je dvojnásobná rezerva. */
const MAX_TOKENS_KOREKTURA = 8000;

const OUT_EVAL = new URL("../public/evaluations.json", import.meta.url);
const OUT_HIST = new URL("../public/history.json", import.meta.url);
const OUT_NEWS = new URL("../public/news.json", import.meta.url);
// Append-only audit trail: one record per item per run, so any past rating
// stays inspectable (item id + date + status + the text that justified it).
const OUT_AUDIT = new URL("../public/audit.json", import.meta.url);
/* Celé odpovědi, které nešly přečíst (evaluateChapter). Mimo public/ a v
   .gitignore: nejsou to data webu, jen podklad k diagnóze, který deploy.yml
   přiloží k běhu jako artefakt. */
const NECITELNE_DIR = new URL("../necitelne-odpovedi/", import.meta.url);
function ulozNecitelnou(ch, items, faze, zadani, data) {
  try {
    mkdirSync(NECITELNE_DIR, { recursive: true });
    const soubor = new URL(`kapitola-${ch.id}-${faze}.json`, NECITELNE_DIR);
    writeFileSync(soubor, JSON.stringify({
      kapitola: ch.id, body: items.map((it) => it.id), faze,
      model: data.model, stop_reason: data.stop_reason, usage: data.usage,
      zadani, odpoved: data.content,
    }, null, 2));
  } catch (e) {
    // Diagnostika nesmí shodit hodnocení.
    console.log(`  (nečitelnou odpověď se nepodařilo uložit: ${e.message})`);
  }
}
/* STATUSES je kontrakt mezi promptem a parserem — bydlí v lib/prompty.js
   u promptu, který ho vyhlašuje přes {{SEZNAM_STAVU}}. Prozaické definice jsou
   v scripts/nastaveni/prompt-hodnoceni.md; popisky a barvy na webu jsou zvlášť
   v src/App.jsx STATUS (jiná velikost písmen, jiný účel). Stav „fulfilled" je
   schválně těžko dosažitelný: norma musí projít celým legislativním procesem
   a vyjít ve Sbírce zákonů, a model to musí doložit. */
const VALID = new Set(STATUSES);
const HISTORY_WEEKS = NAST.historie_tydnu;
const MAX_SOURCES = NAST.maximalne_zdroju;
// A "fulfilled" claim without a concrete citation gets downgraded, so the
// strongest status can never rest on an unsupported assertion.
const EVIDENCE_MIN = NAST.minimalni_delka_dokladu;
const LATKA_PORUSENO = NAST.latka_poruseno === 1;
const OVEROVAT_PRECHODY = NAST.overovat_prechody === 1;
const OVEROVAT_PROSTREDNI = OVEROVAT_PRECHODY && NAST.overovat_prostredni === 1;
// Delta běh drží přechod opřený o doklad starší než dosavadní stav (lib/prechody.js).
const DRZET_STARY_DOKLAD = NAST.drzet_stary_doklad === 1;
const OVEROVACI_MODEL = process.env.OVEROVACI_MODEL || NAST.overovaci_model;
// Odpověď ověření je jeden malý JSON objekt; víc místa by jen zvalo k eseji.
/* Se zapnutým vyhledáváním musí do stropu vejít i dotazy a čtení výsledků,
   ne jen ta jedna věta odůvodnění — se 400 by běh skončil uprostřed hledání. */
const MAX_TOKENS_OVERENI = 2500;
const VYHLEDAVANI_OVERENI = NAST.vyhledavani_overeni;
/* Rejstřík Sbírky z e-Sbírky (lib/sbirka.js). Načte se jednou na začátku běhu;
   null = vypnutý nebo nedostupný a běh jede jako dřív, bez tabulky i ověření. */
const REJSTRIK_ZAPNUTY = NAST.rejstrik_sbirky === 1;
let REJSTRIK = null;
let TABULKA_SBIRKY = null;
// Znění předpisů pro ověřovatele, kód → výsledek nactiZneni; jednou za běh.
const ZNENI = new Map();

// All real item IDs — guards against the model inventing an ID (e.g. "11.11"),
// which the merge-based storage would otherwise carry forward forever.
const VALID_IDS = new Set(CHAPTERS.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => i.id))));



// NOTE: structured outputs (output_config.format) were tried here and turned
// out to suppress the web_search tool entirely (0 search hits), just like the
// assistant prefill did earlier — JSON must stay prompt-enforced.

if (!KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Set it as an env var / repo secret.");
  process.exit(1);
}

function readJSON(url, fallback) {
  try { return JSON.parse(readFileSync(url, "utf8")); } catch { return fallback; }
}
/* Rozdělí body kapitoly na zhruba stejně velké dávky. Kapitola, která se pod
   strop vejde, zůstává jedním dotazem — nedělí se nic, co fungovat nepřestalo. */
function davky(items) {
  const pocet = Math.ceil(items.length / MAX_BODU_DAVKA);
  if (pocet <= 1) return [items];
  const naDavku = Math.ceil(items.length / pocet);
  return Array.from({ length: pocet }, (_, i) => items.slice(i * naDavku, (i + 1) * naDavku));
}

function normUrl(u) { return (u || "").trim().replace(/\/+$/, "").toLowerCase(); }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, "").replace(/^m\./, ""); } catch { return u; } }


async function evaluateChapter(ch, prevEvals, snapshots, body) {
  const items = body || ch.groups.flatMap((g) => g.items);
  const prompt = promptHodnoceni(ch, prevEvals, snapshots, items, TABULKA_SBIRKY);
  assertFields(prompt, ["comment_cs", "comment_en", "change_cs", "change_en",
    "evidence", "evidence_date", "unverifiable", "sources"], "prompt-hodnoceni.md");

  const dotaz = async (messages) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        /* temperature 0: hodnocení má být reprodukovatelné. S výchozí 1.0 se
           úsudkové rozhodnutí („je 9 % ‚výrazné zvýšení'?") každý týden losovalo
           znovu — bod 14.1 tak změnil stav pětkrát za pět běhů bez jediné
           události. Nula šum nevypne (vyhledávání vrací pokaždé jiné výsledky),
           ale přestane ho přiživovat. */
        temperature: 0,
        messages, // no prefill — lets web_search run
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: NAST.vyhledavani_hodnoceni, allowed_domains: WEBY_HODNOCENI }],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  };

  const messages = [{ role: "user", content: prompt }];
  let data = await dotaz(messages);
  let doptanoJson = false;

  // URLs the web search actually returned (used to validate the model's citations)
  const realMap = {};
  const sebratVysledky = (d) => {
    for (const b of d.content || []) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) {
          if (r && r.type === "web_search_result" && r.url) {
            realMap[normUrl(r.url)] = { url: r.url, title: r.title || r.url };
          }
        }
      }
    }
  };
  const textOdpovedi = (d) => (d.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
  sebratVysledky(data);

  /* Odpověď bez čitelného hodnocení. 16. 10. 2026 vrátila kapitola 1 (jediný
     bod, 1.1) místo JSON rozbor v Markdownu — „Vyhledám… Na základě
     vyhledaných informací nyní mohu posoudit… Analýza: …" — a celá kapitola
     propadla. Opakování to nespraví (temperature 0 vrátí totéž), tolerantní
     čtení taky ne, když JSON v odpovědi vůbec není. Proto JEDNO doptání v téže
     konverzaci: model dostane svou odpověď i výsledky vyhledávání zpět a k nim
     pokyn vrátit už jen JSON. Je to jiný vstup, tedy i jiná odpověď. Při
     stop_reason=pause_turn (server přerušil smyčku vyhledávání) se odpověď jen
     nechá dokončit, bez pokynu navíc — tak to API pro pause_turn předepisuje.
     Celé nečitelné odpovědi se ukládají do NECITELNE_DIR, odkud je deploy.yml
     přiloží k běhu jako artefakt: z prvních 300 znaků v logu se příčina
     poznat nedala. */
  let parsed;
  try {
    parsed = parsujHodnoceni(textOdpovedi(data));
  } catch (e) {
    const prvni = data;
    ulozNecitelnou(ch, items, "1", prompt, prvni);
    const pauza = prvni.stop_reason === "pause_turn";
    const pokracovani = [...messages, { role: "assistant", content: prvni.content || [] }];
    if (!pauza) pokracovani.push({ role: "user", content: promptDoptani(items.map((it) => it.id)) });
    try {
      data = await dotaz(pokracovani);
    } catch (e2) {
      throw new Error(`${e.message} [stop_reason=${prvni.stop_reason}; doptání selhalo: ${e2.message.slice(0, 120)}]`);
    }
    sebratVysledky(data);
    try {
      parsed = parsujHodnoceni(textOdpovedi(data));
    } catch (e2) {
      ulozNecitelnou(ch, items, "2-doptani", pokracovani.at(-1).content, data);
      throw new Error(`${e.message} [stop_reason=${prvni.stop_reason}; ani doptání (stop_reason=${data.stop_reason}) nevrátilo hodnocení]`);
    }
    doptanoJson = true;
  }
  const searchCount = Object.keys(realMap).length;

  const out = {};
  let kept = 0;
  const demoted = { "no-evidence": 0, "no-date": 0, "predates-term": 0, "date-mismatch": 0,
    "not-through-process": 0, "broken-no-evidence": 0, "sbirka-bez-uredniho-zdroje": 0, "neexistujici-predpis": 0 };
  const sbirka = { overeno: 0, neexistujici: [], datum: [], text: [] };
  for (const r of parsed) {
    if (!r || !r.id || !VALID_IDS.has(r.id)) continue;
    const sources = [];
    if (Array.isArray(r.sources)) {
      const seen = new Set();
      for (const u of r.sources) {
        const hit = realMap[normUrl(u)];
        if (hit && !seen.has(hit.url)) { seen.add(hit.url); sources.push(hit); }
        if (sources.length >= MAX_SOURCES) break;
      }
    }
    kept += sources.length;

    /* Enforce the evidence bar: "fulfilled" is only allowed to stand when the
       model actually cited something (Sbírka entry, effective date). Otherwise
       it falls back to "partial" — the claim of progress is kept, the claim of
       completion is not. */
    let status = VALID.has(r.status) ? r.status : "not_started";
    let evidence = typeof r.evidence === "string" ? r.evidence.trim() : "";
    let evDate = /^\d{4}-\d{2}-\d{2}$/.test(r.evidence_date || "") ? r.evidence_date : "";
    /* Citovaná čísla předpisů proti rejstříku Sbírky. U „splněno" s ověřeným
       předpisem se datum dokladu nahradí oficiálním datem vyhlášení (model plete
       den hlasování, podpisu nebo účinnosti s vyhlášením) a mezi zdroje přibude
       odkaz do e-Sbírky. Cituje-li doklad jediný ověřený předpis, srovná se
       s oficiálním datem i den vyhlášení v textu — jinak by web ukázal opravené
       datum vedle neopraveného tvrzení. Neexistující číslo srazí stav níž,
       v duvodDegradace. */
    const predpisy = REJSTRIK ? overZnacky(evidence, REJSTRIK) : null;
    if (predpisy) {
      sbirka.overeno += predpisy.overene.length;
      if (predpisy.neexistujici.length) sbirka.neexistujici.push(`${r.id} (${predpisy.neexistujici.join(", ")})`);
      if (status === "fulfilled" && predpisy.overene.length && !predpisy.neexistujici.length) {
        const hlavni = hlavniPredpis(predpisy.overene);
        if (hlavni.vyhlaseno !== evDate) {
          sbirka.datum.push(`${r.id} (${evDate || "bez data"} → ${hlavni.vyhlaseno})`);
          evDate = hlavni.vyhlaseno;
        }
        if (predpisy.overene.length === 1) {
          const opraveno = opravDatumVyhlaseni(evidence, hlavni.vyhlaseno);
          if (opraveno.zmeneno) { evidence = opraveno.text; sbirka.text.push(r.id); }
        }
        if (!sources.some((x) => x.url === hlavni.url)) {
          sources.unshift({ url: hlavni.url, title: `${hlavni.kod} Sb. — ${hlavni.nazev}`.slice(0, 200) });
          if (sources.length > MAX_SOURCES) sources.length = MAX_SOURCES;
        }
      }
    }
    // Samo pravidlo je v lib/dukaz.js, aby se podle něj dala přepočítat i data,
    // která už jsou venku — dvě kopie by se časem rozešly.
    const downgradeReason = duvodDegradace(status, evidence, evDate,
      { minDelkaDokladu: EVIDENCE_MIN, nastup: DATES.tookOffice, latkaPoruseno: LATKA_PORUSENO,
        zdroje: sources, rejstrik: REJSTRIK });
    if (downgradeReason) { status = CIL_DEGRADACE[downgradeReason]; demoted[downgradeReason]++; }

    out[r.id] = {
      status,
      evidence,
      evidenceDate: evDate || undefined,
      unverifiable: r.unverifiable === true,
      evidenceMissing: downgradeReason || undefined,
      comment: { cs: r.comment_cs || "", en: r.comment_en || "" },
      change: { cs: r.change_cs || "", en: r.change_en || "" },
      sources,
      previousStatus: prevEvals[r.id]?.status || null,
      updatedAt: new Date().toISOString(),
      /* Co o citovaných předpisech říká e-Sbírka — čte to ověřovatel přechodu
         a později to může ukázat web („ověřeno v e-Sbírce"). */
      sbirka: predpisy && (predpisy.overene.length || predpisy.neexistujici.length) ? {
        overene: predpisy.overene.map(({ kod, nazev, vyhlaseno, url }) => ({ kod, nazev, vyhlaseno, url })),
        neexistujici: predpisy.neexistujici,
      } : undefined,
    };
  }
  /* Useknutá odpověď (stop_reason=max_tokens) se přečte jen po poslední úplný
     záznam; volající chybějící body doptá zvlášť. */
  return { evals: out, searchCount, kept, demoted, sbirka, useknuto: data.stop_reason === "max_tokens", doptanoJson };
}

/* Týdenní sken událostí: neptá se na stav, ale na to, co se STALO. Vrací
   mapu id → {udalost, datum, zdroje}. Body bez události se nepřehodnocují —
   drží stav z minula. To je jádro stabilizace: bez události není co losovat. */
async function deltaScan(ch, prevEvals, odData, items) {
  const prompt = promptDeltaScan(ch, prevEvals, odData, items);
  assertFields(prompt, ["udalost", "datum", "zdroje"], "prompt-delta.md");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 3000, temperature: 0,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: NAST.vyhledavani_delta, allowed_domains: WEBY_HODNOCENI }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
  let searchCount = 0;
  for (const blok of data.content || []) {
    if (blok.type === "web_search_tool_result" && Array.isArray(blok.content)) searchCount += blok.content.length;
  }
  /* Nevyhazuje se: nesrozumitelná odpověď kapitolu neshodí, ale ani se nesmí
     tvářit jako klidný týden — volající ji vypíše, spočítá a kapitolu
     přehodnotí celou (lib/delta.js, planKapitoly). */
  const { udalosti, chyba, zahozeno, ukazka } =
    parsujDeltaOdpoved(text, new Set(items.map((i) => i.id)), MAX_SOURCES);
  return { udalosti, searchCount, chyba, zahozeno, ukazka };
}

/* Ověření navrženého přechodu druhým, silnějším modelem. Otázka nezní „jaký
   je stav?", ale „nese TENHLE doklad TENHLE přechod?" — a od 21. 8. 2026 si
   ověřovatel smí citovaný předpis vyhledat (vyhledavani_overeni), protože bez
   vyhledávání kontroloval jen logiku tvrzení, ne jeho pravdivost.
   Výchozí odpověď promptu je NE; selhání volání se řeší konzervativně
   u volajícího (přechod se nepřijme). */
async function overPrechod(bod, minuly, navrh, prostredni = false) {
  /* U přechodu na „splněno" dostane ověřovatel i znění hlavního citovaného
     předpisu. Podle názvu se pozná cizí číslo, ne cizí obsah pod obecným
     názvem: 15. 10. 2026 prošlo „splněno" u bydlení na zákoně 91/2026 Sb.
     „kterým se mění stavební zákon", který jen posouvá lhůtu o rok. */
  let zneni = null;
  if (REJSTRIK && navrh.status === "fulfilled" && navrh.sbirka && navrh.sbirka.overene.length) {
    const hlavni = hlavniPredpis(navrh.sbirka.overene);
    if (!ZNENI.has(hlavni.kod)) ZNENI.set(hlavni.kod, await nactiZneni(hlavni));
    zneni = new Map([[hlavni.kod, ZNENI.get(hlavni.kod)]]);
  }
  const prompt = promptOvereniPrechodu({
    prostredni,
    bod: bod.cs,
    minulyStav: minuly.status,
    minulyOd: (minuly.updatedAt || "").slice(0, 10),
    novyStav: navrh.status,
    doklad: navrh.evidence,
    datumDokladu: navrh.evidenceDate,
    predpisy: popisProOverovatele(navrh.sbirka, Boolean(REJSTRIK), zneni),
    zmena: navrh.change && navrh.change.cs,
    komentar: navrh.comment && navrh.comment.cs,
  });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: OVEROVACI_MODEL, max_tokens: MAX_TOKENS_OVERENI, temperature: 0,
      messages: [{ role: "user", content: prompt }],
      /* Bez vyhledávání ověřovatel kontroluje jen logiku tvrzení, ne jeho
         pravdivost — a vymyšlené číslo zákona je logicky bezvadný doklad. */
      ...(VYHLEDAVANI_OVERENI > 0 ? {
        tools: [{
          type: "web_search_20250305", name: "web_search",
          max_uses: VYHLEDAVANI_OVERENI, allowed_domains: WEBY_HODNOCENI,
        }],
      } : {}),
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  /* Se zapnutým vyhledáváním přijde textových bloků víc a JSON je až v tom
     posledním; hledá se odzadu, aby složená závorka v úvaze o hledání
     nepřebila vlastní odpověď. */
  const bloky = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
  for (let i = bloky.length - 1; i >= 0; i--) {
    /* Spárované závorky, ne „od první { po poslední }": složená závorka
       v úvaze před verdiktem by jinak rozhodila celé čtení. */
    for (const vyrez of vyrezy(bloky[i], "{", "}")) {
      let j;
      try { j = JSON.parse(vyrez); } catch { continue; }
      if (typeof j.potvrzeno !== "boolean") continue;
      return { potvrzeno: j.potvrzeno === true, duvod: String(j.duvod || "").slice(0, 300) };
    }
  }
  throw new Error("ověření přechodu: odpověď bez JSON [opakovat]");
}

/* Headline news for the past week. Source diversity is enforced in code (one
   item per domain) rather than trusted to the prompt, and every URL must have
   come back from the real search — same validation as the ratings. */
async function fetchHeadlines() {
  const prompt = promptZpravy(new Date().toISOString().slice(0, 10));
  assertFields(prompt, ["title_cs", "title_en", "summary_cs", "summary_en", "url", "date"], "prompt-zpravy.md");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS_ZPRAVY,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: NAST.vyhledavani_zpravy, allowed_domains: WEBY_ZPRAVY }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const realMap = {};
  for (const b of data.content || []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) {
        if (r && r.type === "web_search_result" && r.url) realMap[normUrl(r.url)] = r.url;
      }
    }
  }
  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  /* Spárované závorky jako u hodnocení a delta skenu: model v úvodní větě
     odkazuje na zdroje zápisem [1] a „od první [ po poslední ]" by začalo
     uprostřed věty. Bere se první neprázdné pole objektů; prázdné pole jen
     tehdy, když jiné není (to pak řeší opakování níž). */
  let parsed = null;
  for (const vyrez of vyrezy(clean, "[", "]")) {
    let v;
    try { v = JSON.parse(vyrez); } catch { continue; }
    if (!Array.isArray(v)) continue;
    if (!v.length) { if (!parsed) parsed = v; continue; }
    if (v.some((x) => x && typeof x === "object" && !Array.isArray(x))) { parsed = v; break; }
  }
  if (!parsed) {
    /* Say WHY, or the next person guesses. stop_reason "max_tokens" means the
       reply was cut off — every web_search round is itself part of the output,
       so raising the search count eats the budget the JSON needs. "end_turn"
       with few tokens means the opposite: the model finished, in prose, and
       declined. 600 znaků, ne 120 — po běhu 3. 8. 2026 zbyla jen věta
       "Bohužel nemůžu poskytnout požadovan…" a důvod byl uříznutý. */
    const searches = (data.content || []).filter((x) => x.type === "server_tool_use").length;
    throw new Error(`no JSON array in response (stop_reason=${data.stop_reason}, `
      + `searches=${searches}, out_tokens=${data.usage?.output_tokens}, text=${clean.length}b: `
      + `${JSON.stringify(clean.slice(0, 600))})`);
  }
  /* Prázdné pole je platná odpověď, ale skoro nikdy pravdivá — v české
     politice se za týden vždycky něco stane. Tři běhy 30. 7. 2026 to ukázaly
     názorně: dva vrátily 0 návrhů, třetí o šest hodin později 9 návrhů ze
     71 výsledků vyhledávání. Stejný prompt, stejné nastavení, stejný den.
     Je to loterie, ne prázdný týden, a jediná obrana je zkusit to znovu.
     Cena: nejvýš 3 volání jednou týdně. Bez toho zůstane panel prázdný
     celý týden kvůli jednomu nepovedenému losu. */
  if (parsed.length === 0) {
    /* Vypsat, co model měl k dispozici. Bez toho se nedá odlišit „vyhledávání
       nic nenašlo" od „našlo, ale model to zahodil" — a to je přesně rozdíl
       mezi chybou v seznamu webů a chybou v promptu. */
    const url = Object.values(realMap).slice(0, 5);
    if (url.length) console.log(`  z čeho model vybíral: ${url.map((u) => hostOf(u)).join(", ")}…`);
    throw new Error(`${RETRY_MARK} model nenavrhl žádnou zprávu `
      + `(${Object.keys(realMap).length} výsledků vyhledávání)`);
  }

  const items = [];
  const seenHosts = new Set();
  const drop = { invented: 0, dupHost: 0, notArticle: 0, tooOld: 0 };
  // "This week's headlines" must actually be from this week — the model
  // otherwise slips in months-old stories. 10 days allows for a late-running
  // Friday job without letting stale news through.
  const oldest = Date.now() - (NAST.zpravy_pocet_dni + NAST.zpravy_tolerance_dni) * 86400000;
  for (const r of parsed) {
    if (!r || !r.url || !r.title_cs) continue;
    const when = /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? Date.parse(r.date) : NaN;
    if (!Number.isNaN(when) && when < oldest) { drop.tooOld++; continue; }
    const realUrl = realMap[normUrl(r.url)];
    if (!realUrl) { drop.invented++; continue; }
    // Reject section fronts / index pages — a headline must point at a story.
    const path = (() => { try { return new URL(realUrl).pathname; } catch { return "/"; } })();
    if (path.length < 12 || /^\/(index|scripts)\b/.test(path)) { drop.notArticle++; continue; }
    const host = hostOf(realUrl);
    if (seenHosts.has(host)) { drop.dupHost++; continue; } // one item per outlet
    seenHosts.add(host);
    items.push({
      title: { cs: r.title_cs, en: r.title_en || r.title_cs },
      summary: { cs: r.summary_cs || "", en: r.summary_en || r.summary_cs || "" },
      url: realUrl,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : null,
    });
    if (items.length >= NAST.pocet_zprav) break;
  }
  return { items, searchCount: Object.keys(realMap).length, proposed: parsed.length, drop };
}

/* Retry wrapper shared by chapter evaluation and headline fetching — both hit
   the same two flaky failure modes: rate limits / overloaded API, and Haiku
   occasionally emitting unparseable JSON.
   RETRY_MARK is the third: a call that succeeded but came back useless. */
const RETRY_MARK = "[opakovat]";
async function withBackoff(fn, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      // 429 = rate limit, 5xx/529 = server-side (overloaded) — both worth waiting out
      const retryable = /API (429|5\d\d)/.test(e.message) || /JSON/.test(e.message)
        || e.message.includes(RETRY_MARK);
      if (!retryable || i === tries - 1) throw e;
      const wait = /API (429|5\d\d)/.test(e.message) ? 30000 * (i + 1) : 3000;
      console.log(`  retry — waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/* Renders both prompts once, before any API call, so a bad edit in
   scripts/nastaveni/ stops the run immediately. Without this the per-chapter
   try/catch would swallow the same error 18 times and the run would finish
   "successfully" having evaluated nothing — the worst possible outcome,
   because it looks like a normal run in the log. */
function preflight() {
  try {
    const p = promptHodnoceniKontrola();
    assertFields(p, ["comment_cs", "comment_en", "change_cs", "change_en",
      "evidence", "evidence_date", "unverifiable", "sources"], "prompt-hodnoceni.md");

    const n = promptZpravy("2026-01-01");
    assertFields(n, ["title_cs", "title_en", "summary_cs", "summary_en", "url", "date"], "prompt-zpravy.md");

    promptDoptani(["0.0"]);

    const k = render("prompt-korektura.md", {
      SEZNAM_STAVU_CS: "- kontrola",
      SEZNAM_TEXTU: "[0.0|comment_cs] kontrola",
    });
    // Korektura nevrací JSON, ale řádky „[id] text" — kontroluje se tvar
    // odpovědi. Táž funkce, jakou používá opravDavku(), aby se nemohly rozejít.
    zkontrolujPrompt(k);

    const o = promptOvereniPrechodu({
      bod: "kontrola", minulyStav: "fulfilled", minulyOd: "2026-01-01",
      novyStav: "broken", doklad: "kontrola", datumDokladu: "2026-01-01",
      zmena: "kontrola", komentar: "kontrola",
    });
    assertFields(o, ["potvrzeno", "duvod"], "prompt-overeni-prechodu.md");
  } catch (e) {
    console.error(`\nCHYBA V NASTAVENÍ — běh se nespustil, na webu zůstávají data z minulého týdne.\n\n  ${e.message}\n`);
    process.exit(1);
  }
}

async function main() {
  preflight();
  const drivejsi = readJSON(OUT_EVAL, { evals: {} });
  const prevEvals = drivejsi.evals || {};

  /* Režim běhu. „delta" přehodnocuje jen body, u kterých týdenní sken najde
     datovanou událost — ostatní drží stav z minula. Jednou za plny_audit_dni
     se jede „plny": všech 143 bodů, aby zmeškaná událost nezůstala zmeškaná
     navždy. Env REZIM_BEHU vyhrává, kvůli ručním dispatchům a měření. */
  const posledniPlny = drivejsi.posledniPlnyAudit || null;
  const stariAudituDni = posledniPlny ? (Date.now() - Date.parse(posledniPlny)) / 86400000 : Infinity;
  const REZIM_BEHU = ["plny", "delta"].includes(process.env.REZIM_BEHU)
    ? process.env.REZIM_BEHU
    : (stariAudituDni >= NAST.plny_audit_dni ? "plny" : "delta");
  /* Okno delta skenu. Běžně od posledního běhu; env OD_DATA ho posune ručně.
     Bez toho nejde delta měřit: po opravném běhu je lastUpdated dnešek, sken
     by hledal události „od dneška do dneška", nenašel nic a pár dvou takových
     běhů by vyšel na 100 % shody, aniž by cokoli přehodnotil. */
  const OD_DATA = /^\d{4}-\d{2}-\d{2}$/.test(process.env.OD_DATA || "")
    ? process.env.OD_DATA
    : String(drivejsi.lastUpdated || DATES.tookOffice).slice(0, 10);
  console.log(`Režim běhu: ${REZIM_BEHU}`
    + (REZIM_BEHU === "delta"
      ? ` — události od ${OD_DATA}; poslední plný audit ${posledniPlny ? posledniPlny.slice(0, 10) : "nikdy"}`
      : ""));
  if (REJSTRIK_ZAPNUTY) {
    const roky = [];
    for (let rok = Number(String(DATES.tookOffice).slice(0, 4)); rok <= new Date().getUTCFullYear(); rok++) roky.push(rok);
    const nacteno = await nactiRejstrik({ roky });
    if (nacteno.predpisy) {
      REJSTRIK = nacteno.predpisy;
      TABULKA_SBIRKY = tabulkaRejstriku(REJSTRIK, DATES.tookOffice);
      console.log(`Rejstřík Sbírky: ${REJSTRIK.size} předpisů z let ${roky.join("–")}, `
        + `${TABULKA_SBIRKY.split("\n").length} od nástupu vlády v tabulce pro model`);
    } else {
      console.log(`POZOR: rejstřík Sbírky se nepodařilo načíst (${nacteno.chyba}) — model dostane prompt `
        + "bez tabulky a čísla předpisů se tentokrát neověří.");
    }
  } else {
    console.log("Rejstřík Sbírky: vypnutý (rejstrik_sbirky = 0)");
  }
  const snapshots = readJSON(OUT_HIST, { snapshots: [] }).snapshots || [];

  // Carry forward only real items — drops any stray invented IDs already in the file
  const newEvals = {};
  for (const id in prevEvals) if (VALID_IDS.has(id)) newEvals[id] = prevEvals[id];
  let failedChapters = 0;
  /* Brána přechodů (lib/prechody.js): stav se smí pohnout jen s důvodem,
     který jde ukázat. Čítače se vypisují na konci běhu — kolik přechodů
     brána podržela a kolik jich ověřovatel zamítl, je hlavní provozní
     ukazatel stability. */
  const brana = { prijato: 0, prechodu: 0, drzeno: [], potvrzeno: [], zamitnuto: [], chybaOvereni: [], kontrola: [] };
  const sbirkaCelkem = { overeno: 0, neexistujici: [], datum: [], text: [] };
  /* Kolik událostí delta sken celkem našel. Nula napříč všemi kapitolami je
     podezřelá: buď byl opravdu mrtvý týden, nebo se sken rozbil a mlčí — a to
     druhé vypadá v měření stability jako dokonalá stabilita, protože se pak
     nepřehodnocuje vůbec nic. Musí to být vidět v logu. */
  let udalostiCelkem = 0;
  let skenovanychKapitol = 0;
  const skenBezOdpovedi = [];
  const BODY_DLE_ID = Object.fromEntries(
    CHAPTERS.flatMap((c) => c.groups.flatMap((g) => g.items)).map((i) => [i.id, i]));
  for (const ch of CHAPTERS.slice(0, CHAPTER_LIMIT)) {
    const vsechnyBody = ch.groups.flatMap((g) => g.items);
    /* Co se v kapitole přehodnotí (lib/delta.js). Plný audit bere všechno;
       delta jen body s událostí — a když sken nejde přečíst, zase všechno.
       V deltě se plán zná až po skenu; když sken spadne, kapitola propadne. */
    let plan = REZIM_BEHU === "delta" ? null : planKapitoly({ rezim: REZIM_BEHU, sken: null, vsechnyBody, prevEvals });
    let chyba = null;
    /* Kapitola se do newEvals promítá AŽ PO úspěchu celé — sken i všechny
       dávky. Jinak by byla část bodů čerstvá a část stará, aniž by to bylo
       z čeho poznat. */
    const pridat = {};
    const ted = new Date().toISOString();

    if (REZIM_BEHU === "delta") {
      process.stdout.write(`Scanning ${ch.id} ${ch.title.cs}… `);
      try {
        const sken = await withBackoff(() => deltaScan(ch, prevEvals, OD_DATA, vsechnyBody));
        plan = planKapitoly({ rezim: REZIM_BEHU, sken, vsechnyBody, prevEvals });
        udalostiCelkem += Object.keys(sken.udalosti).length;
        skenovanychKapitol++;
        if (sken.chyba) skenBezOdpovedi.push(`${ch.id}:${sken.chyba}`);
        const z = sken.zahozeno || {};
        console.log(`${plan.bodyKHodnoceni.length} k přehodnocení `
          + `(${Object.keys(sken.udalosti).length} událostí, ${sken.searchCount} search hits`
          + (sken.chyba ? `, ODPOVĚĎ NEPŘEČTENA: ${sken.chyba} → přehodnocuji celou kapitolu` : "")
          + (z.ciziId ? `, ${z.ciziId} cizích id` : "")
          + (z.bezData ? `, ${z.bezData} bez data` : "") + ")");
        if (sken.chyba) console.log(`  začátek odpovědi skenu: ${sken.ukazka}`);
      } catch (e) { chyba = e; }
      if (!chyba) await new Promise((r) => setTimeout(r, 5000));
    }

    /* Velká kapitola jde na několik dotazů. Selhání KTERÉKOLI dávky znamená
       selhanou kapitolu — část bodů by jinak byla čerstvá a část týden stará,
       aniž by to bylo z čeho poznat. */
    const skupiny = plan && plan.bodyKHodnoceni.length ? davky(plan.bodyKHodnoceni) : [];
    if (!chyba && skupiny.length) {
      const znacka = skupiny.length > 1 ? ` (${skupiny.length} dávky)` : "";
      process.stdout.write(`Evaluating ${ch.id} ${ch.title.cs}${znacka}… `);
    }
    let hotovo = 0, hledani = 0, zdroju = 0, useknuto = 0, doptanoJson = 0;
    const snizeno = {};
    /* Fronta místo pevného seznamu dávek: body, které odpověď nenesla, se do
       ní jednou vrátí jako samostatná menší dávka (viz níž). */
    const fronta = [...skupiny];
    const doptano = [];
    const selhaloDoptani = [];
    for (let i = 0; i < fronta.length; i++) {
      const skupina = fronta[i];
      if (chyba) break;
      if (i) await new Promise((r) => setTimeout(r, 20000));
      try {
        const r = await withBackoff(() => evaluateChapter(ch, prevEvals, snapshots, skupina));
        for (const [id, navrh] of Object.entries(r.evals)) {
          const minuly = prevEvals[id];
          const verdikt = posudPrechod({
            minuly, navrh,
            udalost: plan.udalosti ? plan.udalosti[id] || null : null,
            plnyAudit: plan.plnyAudit,
            overovatProstredni: OVEROVAT_PROSTREDNI,
            // Den vstupu do dosavadního stavu — ze snímků PŘED tímto během.
            stavOd: minuly ? spocitejStavOd(id, minuly.status, snapshots) : null,
            drzetStaryDoklad: DRZET_STARY_DOKLAD,
          });
          if (verdikt.akce === "drzet") {
            // Minulý záznam se drží CELÝ — nový komentář by argumentoval
            // pro stav, který neprošel. Razítko „prověřeno" ale dostane:
            // běh se na bod díval, jen nepřijal jeho přechod.
            brana.drzeno.push(`${id} (${STATUS_CS[minuly.status]}→${STATUS_CS[navrh.status]}: ${verdikt.duvod}`
              + `${verdikt.detail ? `; ${verdikt.detail}` : ""})`);
            pridat[id] = { ...minuly, overeno: ted };
            continue;
          }
          if (verdikt.akce === "overit" && OVEROVAT_PRECHODY) {
            // Prostřední přechod má vlastní, mírnější laťku než západka.
            const prostredni = verdikt.duvod === "prostredni-prechod";
            try {
              const v = await withBackoff(() => overPrechod(BODY_DLE_ID[id], minuly, navrh, prostredni), 2);
              if (!v.potvrzeno) {
                // I s dokladem: bez něj se při kontrole běhu nedá poznat, jestli
                // ověřovatel zamítl špatný doklad, nebo dobrý doklad špatně.
                brana.zamitnuto.push(`${id} (${STATUS_CS[minuly.status]}→${STATUS_CS[navrh.status]}: ${v.duvod}`
                  + `; doklad: ${String(navrh.evidence || "").slice(0, 200)})`);
                pridat[id] = { ...minuly, overeno: ted };
                continue;
              }
              brana.potvrzeno.push(`${id} (${STATUS_CS[minuly.status]}→${STATUS_CS[navrh.status]})`);
            } catch (e) {
              /* Konzervativně: nejde-li přechod ověřit, nepřijme se. Bod
                 podrží minulý stav a příští běh to zkusí znovu. */
              brana.chybaOvereni.push(`${id}: ${e.message}`.slice(0, 160));
              pridat[id] = { ...minuly, overeno: ted };
              continue;
            }
          }
          if (minuly && minuly.status !== navrh.status) brana.prechodu++; else brana.prijato++;
          /* Přijatý přechod opřený o starší doklad (plný audit, kde se nedrží).
             Může to být zmeškaná událost, kterou audit právě zachytil, i nový
             úsudek o známých faktech — rozhodne ruční kontrola, ne kód. */
          if (verdikt.varovani) {
            brana.kontrola.push(`${id} (${STATUS_CS[minuly.status]}→${STATUS_CS[navrh.status]}: ${verdikt.detail})`);
          }
          pridat[id] = { ...navrh, overeno: ted };
        }
        hotovo += Object.keys(r.evals).length;
        hledani += r.searchCount;
        zdroju += r.kept;
        for (const [k, v] of Object.entries(r.demoted)) if (v) snizeno[k] = (snizeno[k] || 0) + v;
        sbirkaCelkem.overeno += r.sbirka.overeno;
        sbirkaCelkem.neexistujici.push(...r.sbirka.neexistujici);
        sbirkaCelkem.datum.push(...r.sbirka.datum);
        sbirkaCelkem.text.push(...r.sbirka.text);
        if (r.useknuto) useknuto++;
        if (r.doptanoJson) doptanoJson++;
        /* Body, které odpověď nenesla. V kapitole 6 dev běhu 11. 9. 2026 se ze
           šesti vrátil jediný: useknutá odpověď se přečte jen po poslední úplný
           záznam. Menší dotaz se do stropu vejde a dostane jinou odpověď, takže
           se chybějící body JEDNOU doptají samostatně; co chybí i potom, zůstane,
           jak bylo, a log to pojmenuje (lib/delta.js, prenesNeprehodnocene). */
        const chybi = skupina.filter((b) => !r.evals[b.id] && !doptano.includes(b.id));
        if (chybi.length) {
          doptano.push(...chybi.map((b) => b.id));
          fronta.push(chybi);
        }
      } catch (e) {
        /* Doptání chybějících bodů je jen pokus navíc. Když selže, body zůstanou,
           jak byly, a log je pojmenuje — ale kapitola kvůli němu nepropadne,
           jinak by se zahodilo i to, co první dávka přehodnotila v pořádku. */
        if (i >= skupiny.length) {
          selhaloDoptani.push(`${skupina.map((b) => b.id).join(", ")}: ${e.message}`.slice(0, 120));
          continue;
        }
        chyba = e;
        break;   // zbylé dávky nemá smysl platit, kapitola stejně propadne
      }
    }
    if (chyba) {
      failedChapters++;
      console.log(`failed: ${chyba.message}`);
    } else {
      /* Body, které se nepřehodnotily. Razítko „prověřeno beze změny" dostanou
         jen ty, na které se díval PŘEČTENÝ sken; bod, který model v odpovědi
         vynechal, zůstane přesně jak byl (lib/delta.js, prenesNeprehodnocene).
         Až teď, po úspěchu celé kapitoly, se staging promítne do výsledku. */
      const { doplnit, vynechane } = prenesNeprehodnocene({ vsechnyBody, pridat, dosavadni: newEvals, plan, ted });
      Object.assign(pridat, doplnit);
      Object.assign(newEvals, pridat);
      const dm = Object.entries(snizeno).map(([k, v]) => `${v} ${k}`).join(", ");
      if (skupiny.length) {
        console.log(`ok (${hotovo}) — ${hledani} search hits, ${zdroju} sources kept`
          + (dm ? `, downgraded: ${dm}` : "")
          + (useknuto ? `, useknuto ${useknuto}× (max_tokens)` : "")
          + (doptanoJson ? `, odpověď bez hodnocení ${doptanoJson}× — doptáno v téže konverzaci` : "")
          + (doptano.length ? `, doptáno zvlášť: ${doptano.join(", ")}` : "")
          + (selhaloDoptani.length ? `, doptání selhalo (${selhaloDoptani.join("; ")})` : "")
          + (vynechane.length ? `, model vynechal: ${vynechane.join(", ")}` : ""));
      }
    }
    await new Promise((r) => setTimeout(r, 20000));
  }

  if (skenBezOdpovedi.length) {
    console.log(`\nPOZOR: sken ${skenBezOdpovedi.length}× nevrátil čitelný seznam `
      + `(${skenBezOdpovedi.join(", ")}). Tyhle kapitoly se proto přehodnotily celé;`
      + " ukázka odpovědi je u každé v logu výš.");
  }
  /* Jen PŘEČTENÉ skeny: kapitola s nečitelným skenem se přehodnotila celá,
     takže u ní „nepřehodnotilo se nic" neplatí. */
  const prectenychSkenu = skenovanychKapitol - skenBezOdpovedi.length;
  if (REZIM_BEHU === "delta" && prectenychSkenu && !udalostiCelkem) {
    console.log(`
POZOR: sken neohlásil ANI JEDNU událost ve ${prectenychSkenu} přečtených kapitolách.`
      + " Buď byl mrtvý týden, nebo se sken rozbil — v tom druhém případě se"
      + " nepřehodnotilo nic a data jsou beze změny jen zdánlivě.");
  }
  console.log(`
Brána přechodů: ${brana.prijato} beze změny stavu, ${brana.prechodu} přechodů přijato`
    + ` (${brana.potvrzeno.length} ověřeno), ${brana.drzeno.length} drženo, ${brana.zamitnuto.length} zamítnuto`
    + `${brana.chybaOvereni.length ? `, ${brana.chybaOvereni.length} chyb ověření` : ""}`
    + `${brana.kontrola.length ? `, ${brana.kontrola.length} ke kontrole` : ""}`);
  for (const z of brana.drzeno) console.log(`  drženo:    ${z}`);
  for (const z of brana.zamitnuto) console.log(`  zamítnuto: ${z}`);
  for (const z of brana.chybaOvereni) console.log(`  chyba:     ${z}`);
  for (const z of brana.kontrola) console.log(`  ke kontrole (přijato se starším dokladem): ${z}`);
  if (REJSTRIK) {
    console.log(`Rejstřík Sbírky: ${sbirkaCelkem.overeno} citací předpisů ověřeno, `
      + `${sbirkaCelkem.neexistujici.length} s neexistujícím číslem, u ${sbirkaCelkem.datum.length} „splněno“ opraveno datum vyhlášení`);
    for (const z of sbirkaCelkem.neexistujici) console.log(`  neexistující předpis: ${z}`);
    for (const z of sbirkaCelkem.datum) console.log(`  datum vyhlášení podle e-Sbírky: ${z}`);
    if (sbirkaCelkem.text.length) console.log(`  den vyhlášení opraven i v textu dokladu: ${sbirkaCelkem.text.join(", ")}`);
    if (ZNENI.size) {
      const podle = (stav) => [...ZNENI].filter(([, z]) => z.stav === stav).map(([kod]) => kod);
      console.log(`  znění pro ověřovatele: načteno ${podle("ok").join(", ") || "—"}`
        + `; zatím nezpracované ${podle("nezpracovano").join(", ") || "—"}`
        + `; chyba ${podle("chyba").join(", ") || "—"}`);
    }
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  /* Jazyková korektura ---------------------------------------------------
     Běží až po vyhodnocení všech kapitol, těsně před zápisem. Selhání
     kterékoli dávky znamená, že se ta kapitola publikuje neopravená — nikdy
     to nesmí shodit celý běh.

     Mechanická očista (<cite>, syrové klíče stavu) se dělá VŽDY, i při
     korektura = 0: nic nestojí a je to jediná záruka, že se značka na web
     nedostane. Modelem se opravuje jen jazyk.

     Filtr updatedAt: newEvals je předvyplněné minulým týdnem, takže bez něj
     by se každý týden znovu platila korektura už publikovaných textů. */
  const puvodni = {}; // id -> { pole: text před jakoukoli korekturou }
  const kor = { zmeneno: 0, odmitnuto: 0, davek: 0, selhalo: 0, ocisteno: 0 };

  /* Mechanická očista projíždí VŠECHNY body, ne jen ty dnes přehodnocené —
     je zdarma, a <cite> značka nebo syrový klíč stavu v textu z minulého
     týdne je na webu vidět stejně jako v dnešním. Bez toho by vada v bodě,
     který se zrovna nehodnotil, přežila do dalšího plného běhu. */
  for (const id in newEvals) {
    const e = newEvals[id];
    for (const pole of POLE_KOREKTURY) {
      const syrovy = ctiPole(e, pole);
      if (!syrovy) continue;
      const cisty = ocisti(syrovy, jazykPole(pole));
      if (cisty === syrovy) continue;
      (puvodni[id] = puvodni[id] || {})[pole] = syrovy;
      zapisPole(e, pole, cisty);
      kor.ocisteno++;
    }
  }

  for (const ch of CHAPTERS.slice(0, CHAPTER_LIMIT)) {
    const davka = [];
    for (const it of ch.groups.flatMap((g) => g.items)) {
      const e = newEvals[it.id];
      if (!e || !e.updatedAt || e.updatedAt.slice(0, 10) !== today) continue; // not touched this run
      for (const pole of POLE_KOREKTURY) {
        const syrovy = ctiPole(e, pole);
        if (!syrovy) continue;
        const cisty = ocisti(syrovy, jazykPole(pole));
        if (cisty !== syrovy) {
          (puvodni[it.id] = puvodni[it.id] || {})[pole] = syrovy;
          zapisPole(e, pole, cisty);
          kor.zmeneno++;
        }
        davka.push({ klic: `${it.id}|${pole}`, id: it.id, pole, text: cisty });
      }
    }
    if (!KOREKTURA_MODELEM || davka.length === 0) continue;
    kor.davek++;
    try {
      const r = await withBackoff(() => opravDavku(davka, {
        model: KOR_MODEL, key: KEY, maxTokens: MAX_TOKENS_KOREKTURA,
        stropProcent: NAST.korektura_nejvic_zmen_procent, minDelkaDokladu: EVIDENCE_MIN,
      }), 3);
      for (const o of r.opravy) {
        const e = newEvals[o.id];
        puvodni[o.id] = puvodni[o.id] || {};
        // Když už tu pole je, drží v sobě text před mechanickou očistou —
        // to je ten skutečně původní a ten patří do auditu.
        if (!(o.pole in puvodni[o.id])) puvodni[o.id][o.pole] = ctiPole(e, o.pole);
        zapisPole(e, o.pole, o.text);
      }
      kor.zmeneno += r.zmeneno;
      kor.odmitnuto += r.odmitnuto;
      if (r.duvody.length) console.log(`  korektura ${ch.id} odmítla: ${r.duvody.join("; ")}`);
    } catch (e) {
      kor.selhalo++;
      console.log(`  korektura ${ch.id} selhala: ${e.message} — kapitola zůstává bez korektury`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`Korektura: ${kor.ocisteno} úryvků mechanicky očištěno, ${kor.zmeneno} opraveno modelem, `
    + `${kor.odmitnuto} oprav odmítnuto, ${kor.davek} dávek${kor.selhalo ? `, ${kor.selhalo} selhalo` : ""}`
    + (KOREKTURA_MODELEM ? ` (${KOR_MODEL})` : " — model vypnutý, jen mechanická očista"));

  /* Plný audit se počítá jen úplný: všech 18 kapitol prošlo a nic nespadlo.
     Neúplný plný běh datum neposune, takže se plný audit brzy zopakuje. */
  const plnyDokoncen = REZIM_BEHU === "plny" && !failedChapters && CHAPTER_LIMIT >= CHAPTERS.length;
  writeFileSync(OUT_EVAL, JSON.stringify({
    evals: newEvals,
    lastUpdated: now,
    posledniPlnyAudit: plnyDokoncen ? now : (drivejsi.posledniPlnyAudit || null),
  }, null, 2));

  /* Týdenní snímek pro graf — jen když běh opravdu projel všechny kapitoly.
     Chyba kapitoly se výše polyká, aby jedna nedostupná kapitola neshodila
     celý běh; snímek se ale počítá jako podíl z ohodnocených bodů, takže
     z běhu, kde polovina kapitol spadla na limity API, vyjde číslo o
     dostupnosti API, ne o plnění programu. 31. 7. 2026 takový snímek vznikl
     (60 ze 143 bodů) a v grafu by seděl jako plnohodnotný týden.
     evaluations.json a audit.json se zapisují vždy — hodnocení, která
     proběhla, jsou platná a patří ven i do auditní stopy. */
  let capped = snapshots.slice(-HISTORY_WEEKS);
  if (failedChapters) {
    console.log(`Snímek do historie se nezapisuje: ${failedChapters} kapitol selhalo, `
      + `graf by ukázal neúplný týden`);
  } else {
    const statuses = {};
    for (const id in newEvals) statuses[id] = newEvals[id].status;
    const kept = snapshots.filter((s) => s.date !== today);
    kept.push({ date: today, statuses });
    capped = kept.slice(-HISTORY_WEEKS);
    writeFileSync(OUT_HIST, JSON.stringify({ snapshots: capped }, null, 2));
  }

  /* Audit trail — full record of every rating this run produced. Append-only
     and never rewritten, so a published rating can always be traced back to
     the date, status and reasoning it was based on. Only items actually
     re-evaluated this run are recorded (carried-forward values already have
     their own earlier entry). */
  const audit = readJSON(OUT_AUDIT, { entries: [] });
  /* Odstraňují se jen dnešní řádky z běhu (opakovaný běh téhož dne je zapíše
     znovu). Dnešní ruční oprava (pole „oprava“) zůstává — běh ji nenapsal,
     takže ji nesmí ani smazat. */
  const entries = (audit.entries || []).filter((e) => e.date !== today || e.oprava);
  const dnesni = [];
  let recorded = 0;
  for (const id in newEvals) {
    const e = newEvals[id];
    /* Zapisuje se, co se tímhle během opravdu změnilo: přehodnocené body
       (dnešní updatedAt) a body, kterým mechanická očista sáhla na text.
       To druhé je kvůli delta běhům — přenesený bod si updatedAt nemění, ale
       když se změní pravidla očisty, jeho text se na webu změní. Bez tohohle
       by taková změna proběhla bez auditní stopy, což je přesně to, co audit
       slibuje, že se stát nemůže. */
    const prehodnocen = e.updatedAt && e.updatedAt.slice(0, 10) === today;
    if (!prehodnocen && !puvodni[id]) continue;
    dnesni.push({
      id,
      date: today,
      status: e.status,
      evidence: e.evidence || "",
      evidence_date: e.evidenceDate || "",
      unverifiable: e.unverifiable === true,
      comment_cs: e.comment?.cs || "",
      comment_en: e.comment?.en || "",
      change_cs: e.change?.cs || "",
      // change_en tu dosud chyběl. S korekturou by bylo absurdní zapisovat
      // původní znění pole, jehož výsledek audit vůbec neuvádí.
      change_en: e.change?.en || "",
      sources: (e.sources || []).map((s) => s.url),
      model: MODEL,
      /* Původní znění se ukládá JEN u polí, která se opravdu změnila —
         u čistého textu se klíč "original" vůbec nevytvoří. */
      ...(puvodni[id] ? { original: puvodni[id], proofread_model: KOR_MODEL } : {}),
    });
    recorded++;
  }
  /* Třídí se jen dnešní řádky a připojují se na konec. Starší řádky zůstávají
     přesně v pořadí, v jakém byly zveřejněny: ruční opravy se připojují na
     konec nesetříděné (prepocet-degradaci.js, oprav-popis-zmeny.js) a přetřídit
     celý soubor by je přesunulo — 16. 10. 2026 tak běh „přepsal“ opravy
     10.4, 2.3 a 2.8 ze 14. 10. a test-konzistence [G] ho správně zastavil. */
  dnesni.sort((a, b) => a.id.localeCompare(b.id, "cs", { numeric: true }));
  entries.push(...dnesni);
  writeFileSync(OUT_AUDIT, JSON.stringify({ entries }, null, 2));

  console.log(`\nWrote ${Object.keys(newEvals).length} evaluations, ${capped.length} history snapshots, ${recorded} audit records`);

  // Headline news last — a failure here must not lose the evaluation results.
  if (!SE_ZPRAVAMI) { console.log("Zprávy přeskočeny (BEZ_ZPRAV) — news.json zůstává."); return; }
  try {
    process.stdout.write("Fetching headlines… ");
    const n = await withBackoff(fetchHeadlines, 3);
    const why = `proposed ${n.proposed}, dropped ${n.drop.invented} invented / ${n.drop.notArticle} non-article / ${n.drop.tooOld} stale / ${n.drop.dupHost} same-outlet`;
    if (n.items.length > 0) {
      /* Zprávy se opravují zvlášť: načítají se schválně až nakonec, aby
         jejich selhání nemohlo zahodit hodnocení, takže v době korektury
         hodnocení ještě neexistují. Auditní soubor zprávy nesleduje, proto
         se u nich původní znění nikam neukládá. */
      const davkaZ = [];
      n.items.forEach((it, i) => {
        for (const skupina of ["title", "summary"]) {
          for (const jaz of ["cs", "en"]) {
            if (!it[skupina] || !it[skupina][jaz]) continue;
            it[skupina][jaz] = ocisti(it[skupina][jaz], jaz);
            davkaZ.push({ klic: `${i}|${skupina}_${jaz}`, id: String(i), pole: `${skupina}_${jaz}`, text: it[skupina][jaz] });
          }
        }
      });
      if (KOREKTURA_MODELEM && davkaZ.length) {
        try {
          const rk = await withBackoff(() => opravDavku(davkaZ, {
            model: KOR_MODEL, key: KEY, maxTokens: MAX_TOKENS_KOREKTURA,
            stropProcent: NAST.korektura_nejvic_zmen_procent,
          }), 3);
          for (const o of rk.opravy) {
            const [skupina, jaz] = o.pole.split("_");
            n.items[Number(o.id)][skupina][jaz] = o.text;
          }
          console.log(`  korektura zpráv: ${rk.zmeneno} opraveno, ${rk.odmitnuto} odmítnuto`);
        } catch (e) {
          console.log(`  korektura zpráv selhala: ${e.message} — zprávy jdou ven bez korektury`);
        }
      }
      writeFileSync(OUT_NEWS, JSON.stringify({ generatedAt: now, items: n.items }, null, 2));
      console.log(`ok (${n.items.length} items) — ${n.searchCount} search hits, ${why}`);
    } else {
      console.log(`no usable items — ${n.searchCount} search hits, ${why} — keeping previous news.json`);
    }
  } catch (e) {
    console.log(`failed: ${e.message} — keeping previous news.json`);
  }
}

main();
