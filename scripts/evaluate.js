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
import { writeFileSync, readFileSync } from "node:fs";
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
} from "./lib/prompty.js";

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
const TERM_START = new Date(DATES.tookOffice).getTime();

const CHAPTER_LIMIT = process.env.CHAPTER_LIMIT ? Number(process.env.CHAPTER_LIMIT) : CHAPTERS.length;

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || NAST.model; // env still wins, for one-off experiments
const KOR_MODEL = process.env.KOREKTURA_MODEL || NAST.korektura_model;
/* Operational, deliberately NOT in nastaveni.txt: too low silently truncates
   the JSON reply, which looks like a model failure and burns retries.
   Separate budgets because every web_search round is part of the output —
   the headline call does up to vyhledavani_zpravy of them (12) against the
   chapter call's 4, so it needs materially more room before the JSON starts.
   Raising vyhledavani_zpravy without raising this is what broke the
   2026-07-29 run ("no JSON array in response"). */
const MAX_TOKENS = 6000;
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
function normUrl(u) { return (u || "").trim().replace(/\/+$/, "").toLowerCase(); }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, "").replace(/^m\./, ""); } catch { return u; } }

/* A "č. NNN/YYYY Sb." marker states the year the norm was PUBLISHED. If that
   year doesn't match the date the model gave, the date is something else —
   typically a later effective-from date, which is how the term-start check got
   bypassed ("č. 270/2025 Sb., účinný od 1. ledna 2026" dated 2026-01-01).
   Amending laws legitimately cite older acts, so only the newest year in the
   string is judged: that is the norm being claimed as the achievement. */
function evidenceYearMismatch(evidence, evDate) {
  const years = [...String(evidence).matchAll(/\b\d{1,4}\s*\/\s*(\d{4})\s*Sb\b/gi)]
    .map((m) => Number(m[1]));
  if (years.length === 0) return false; // non-legislative step — date check applies alone
  return Math.max(...years) !== Number(evDate.slice(0, 4));
}

async function evaluateChapter(ch, prevEvals, snapshots) {
  const items = ch.groups.flatMap((g) => g.items);
  const prompt = promptHodnoceni(ch, prevEvals, snapshots);
  assertFields(prompt, ["comment_cs", "comment_en", "change_cs", "change_en",
    "evidence", "evidence_date", "unverifiable", "sources"], "prompt-hodnoceni.md");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }], // no prefill — lets web_search run
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: NAST.vyhledavani_hodnoceni, allowed_domains: WEBY_HODNOCENI }],
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  // URLs the web search actually returned (used to validate the model's citations)
  const realMap = {};
  for (const b of data.content || []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) {
        if (r && r.type === "web_search_result" && r.url) {
          realMap[normUrl(r.url)] = { url: r.url, title: r.title || r.url };
        }
      }
    }
  }
  const searchCount = Object.keys(realMap).length;

  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  // With structured output the whole text is valid JSON ({items: [...]}).
  // Bracket extraction stays as a fallback in case the response is somehow prose-wrapped.
  let parsed;
  try {
    const root = JSON.parse(clean);
    parsed = Array.isArray(root) ? root : root.items;
  } catch {
    const a = clean.indexOf("["), b = clean.lastIndexOf("]");
    if (a === -1 || b === -1) throw new Error("no JSON array in response");
    parsed = JSON.parse(clean.slice(a, b + 1));
  }
  if (!Array.isArray(parsed)) throw new Error("no JSON array in response");

  const out = {};
  let kept = 0;
  const demoted = { "no-evidence": 0, "no-date": 0, "predates-term": 0, "date-mismatch": 0 };
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
    const evidence = typeof r.evidence === "string" ? r.evidence.trim() : "";
    const evDate = /^\d{4}-\d{2}-\d{2}$/.test(r.evidence_date || "") ? r.evidence_date : "";
    let downgradeReason = null;
    if (status === "fulfilled") {
      if (evidence.length < EVIDENCE_MIN) downgradeReason = "no-evidence";
      else if (!evDate) downgradeReason = "no-date";
      // Credit for work finished before this cabinet took office belongs to
      // the previous one, however well the topic matches the promise.
      else if (Date.parse(evDate) < TERM_START) downgradeReason = "predates-term";
      else if (evidenceYearMismatch(evidence, evDate)) downgradeReason = "date-mismatch";
    }
    if (downgradeReason) { status = "partial"; demoted[downgradeReason]++; }

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
    };
  }
  return { evals: out, searchCount, kept, demoted };
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
  const a = clean.indexOf("["), b = clean.lastIndexOf("]");
  if (a === -1 || b === -1) {
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
  const parsed = JSON.parse(clean.slice(a, b + 1));
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

    const k = render("prompt-korektura.md", {
      SEZNAM_STAVU_CS: "- kontrola",
      SEZNAM_TEXTU: "[0.0|comment_cs] kontrola",
    });
    // Korektura nevrací JSON, ale řádky „[id] text" — kontroluje se tvar
    // odpovědi. Táž funkce, jakou používá opravDavku(), aby se nemohly rozejít.
    zkontrolujPrompt(k);
  } catch (e) {
    console.error(`\nCHYBA V NASTAVENÍ — běh se nespustil, na webu zůstávají data z minulého týdne.\n\n  ${e.message}\n`);
    process.exit(1);
  }
}

async function main() {
  preflight();
  const prevEvals = readJSON(OUT_EVAL, { evals: {} }).evals || {};
  const snapshots = readJSON(OUT_HIST, { snapshots: [] }).snapshots || [];

  // Carry forward only real items — drops any stray invented IDs already in the file
  const newEvals = {};
  for (const id in prevEvals) if (VALID_IDS.has(id)) newEvals[id] = prevEvals[id];
  let failedChapters = 0;
  for (const ch of CHAPTERS.slice(0, CHAPTER_LIMIT)) {
    try {
      process.stdout.write(`Evaluating ${ch.id} ${ch.title.cs}… `);
      const r = await withBackoff(() => evaluateChapter(ch, prevEvals, snapshots));
      Object.assign(newEvals, r.evals);
      const dm = Object.entries(r.demoted).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(", ");
      console.log(`ok (${Object.keys(r.evals).length}) — ${r.searchCount} search hits, ${r.kept} sources kept`
        + (dm ? `, downgraded: ${dm}` : ""));
    } catch (e) {
      failedChapters++;
      console.log(`failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 20000));
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
    if (NAST.korektura !== 1 || davka.length === 0) continue;
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
    + (NAST.korektura === 1 ? ` (${KOR_MODEL})` : " — model vypnutý, jen mechanická očista"));

  writeFileSync(OUT_EVAL, JSON.stringify({ evals: newEvals, lastUpdated: now }, null, 2));

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
  const entries = (audit.entries || []).filter((e) => e.date !== today);
  let recorded = 0;
  for (const id in newEvals) {
    const e = newEvals[id];
    if (!e.updatedAt || e.updatedAt.slice(0, 10) !== today) continue; // not touched this run
    entries.push({
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
  entries.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id, "cs", { numeric: true }) : a.date < b.date ? -1 : 1));
  writeFileSync(OUT_AUDIT, JSON.stringify({ entries }, null, 2));

  console.log(`\nWrote ${Object.keys(newEvals).length} evaluations, ${capped.length} history snapshots, ${recorded} audit records`);

  // Headline news last — a failure here must not lose the evaluation results.
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
      if (NAST.korektura === 1 && davkaZ.length) {
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
