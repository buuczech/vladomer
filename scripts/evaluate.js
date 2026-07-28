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
import { CHAPTERS } from "../src/data.js";

const CHAPTER_LIMIT = process.env.CHAPTER_LIMIT ? Number(process.env.CHAPTER_LIMIT) : CHAPTERS.length;

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || "claude-haiku-4-5-20251001";
const OUT_EVAL = new URL("../public/evaluations.json", import.meta.url);
const OUT_HIST = new URL("../public/history.json", import.meta.url);
const OUT_NEWS = new URL("../public/news.json", import.meta.url);
// Append-only audit trail: one record per item per run, so any past rating
// stays inspectable (item id + date + status + the text that justified it).
const OUT_AUDIT = new URL("../public/audit.json", import.meta.url);
const VALID = new Set(["fulfilled", "in_progress", "not_started", "stalled"]);
const HISTORY_WEEKS = 52;
const MAX_SOURCES = 3;

const STATUS_CS = { fulfilled: "splněno", in_progress: "probíhá", not_started: "nezahájeno", stalled: "uvázlo" };

// All real item IDs — guards against the model inventing an ID (e.g. "11.11"),
// which the merge-based storage would otherwise carry forward forever.
const VALID_IDS = new Set(CHAPTERS.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => i.id))));

// Source whitelist, enforced at the API level via web_search allowed_domains —
// search physically can't return results outside this list. Official sources +
// NFNŽ MediaRating categories A / A- / B+. Mirrored in the App.jsx methodology.
const ALLOWED_DOMAINS = [
  // Official (gov.cz covers all government subdomains — vlada, ministries,
  // NSA, DIA, …) / fact-checking
  "gov.cz", "demagog.cz",
  // NFNŽ MediaRating — A
  "aktualne.cz", "ceskenoviny.cz", "ct24.ceskatelevize.cz", "denik.cz",
  "denikalarm.cz", "denikn.cz", "denikreferendum.cz", "e15.cz", "echo24.cz",
  "euro.cz", "forum24.cz", "hn.cz", "irozhlas.cz", "refresher.cz",
  "respekt.cz", "seznamzpravy.cz", "voxpot.cz", "zivotvcesku.cz",
  // NFNŽ MediaRating — A-  (idnes.cz and lidovky.cz omitted: they block
  // Anthropic's crawler, and one inaccessible domain 400s the whole request)
  "hlidacipes.org", "novinky.cz",
  // NFNŽ MediaRating — B+
  "blesk.cz", "cnn.iprima.cz", "newstream.cz", "reflex.cz", "tn.nova.cz",
];

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
function truncate(s, n) { s = s || ""; return s.length > n ? s.slice(0, n) + "…" : s; }
function normUrl(u) { return (u || "").trim().replace(/\/+$/, "").toLowerCase(); }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, "").replace(/^m\./, ""); } catch { return u; } }

function historyFor(id, snapshots) {
  return snapshots
    .map((s) => (s.statuses && s.statuses[id] ? `${s.date} ${STATUS_CS[s.statuses[id]] || s.statuses[id]}` : null))
    .filter(Boolean)
    .slice(-6)
    .join(", ");
}

async function evaluateChapter(ch, prevEvals, snapshots) {
  const items = ch.groups.flatMap((g) => g.items);
  const lines = items
    .map((it) => {
      const p = prevEvals[it.id];
      const prev = p
        ? `předchozí stav: ${STATUS_CS[p.status] || p.status}; předchozí komentář: "${truncate((p.comment && p.comment.cs) || "", 180)}"`
        : "bez předchozího hodnocení";
      const hist = historyFor(it.id, snapshots);
      return `- [${it.id}] ${it.cs}\n   ${prev}${hist ? `; historie stavu: ${hist}` : ""}`;
    })
    .join("\n");

  const prompt = `Jsi nestranný, kritický analytik plnění programu vlády Andreje Babiše (ANO, SPD, Motoristé; ve funkci od 15. 12. 2025). NEJPRVE vyhledej aktuální zprávy (web search) a hodnoť výhradně podle ověřitelných, aktuálních faktů.

Oblast: „${ch.title.cs}"

U KAŽDÉHO bodu zvaž důkazy z více úhlů, ne jen jeden závěr:
- „ano, ale…" — co svědčí pro splnění a s jakými výhradami (jen ohlášeno vs. reálně zavedeno, částečně, formálně, bez dopadu).
- „ne, ale…" — co svědčí proti splnění a jaké jsou dílčí kroky či náznaky pokroku.
- Zohledni kritiku opozice i odborníků; rozlišuj sliby/návrhy od skutečného dopadu.

Stav urči konzervativně (bez důkazu = not_started): fulfilled = prokazatelně splněno; in_progress = aktivně se pracuje (návrh, projednávání); not_started = žádný doložitelný krok; stalled = uvázlo/opuštěno.

Měny: v českých textech piš „Kč", v anglických „CZK". Je-li částka ve zdroji důvěryhodně uvedena v eurech, ponech EUR v obou jazycích — nepřepočítávej.

Do "sources" uveď 1–3 PŘESNÉ URL z výsledků vyhledávání, které hodnocení nejvíce podporují. Jen URL, která se ve vyhledávání skutečně objevila – NEVYMÝŠLEJ je.

Body (vrať hodnocení pro každé ID):
${lines}

Odpověz POUZE platným JSON polem, začni znakem [ a skonči znakem ]. Žádný úvodní text, žádné markdown bloky:
[{"id":"...","status":"fulfilled|in_progress|not_started|stalled","comment_cs":"2–3 věty, vyvážené ano-ale/ne-ale","comment_en":"anglický překlad comment_cs","change_cs":"1 věta: co se změnilo; bez předchozího hodnocení přesně „první hodnocení“","change_en":"anglický překlad change_cs","sources":["https://..."]}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }], // no prefill — lets web_search run
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4, allowed_domains: ALLOWED_DOMAINS }],
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
    out[r.id] = {
      status: VALID.has(r.status) ? r.status : "not_started",
      comment: { cs: r.comment_cs || "", en: r.comment_en || "" },
      change: { cs: r.change_cs || "", en: r.change_en || "" },
      sources,
      previousStatus: prevEvals[r.id]?.status || null,
      updatedAt: new Date().toISOString(),
    };
  }
  return { evals: out, searchCount, kept };
}

/* Headline news for the past week. Source diversity is enforced in code (one
   item per domain) rather than trusted to the prompt, and every URL must have
   come back from the real search — same validation as the ratings. */
async function fetchHeadlines() {
  const prompt = `Vyhledej nejdůležitější zprávy z české domácí politiky za posledních 7 dní.

Vyber 5 zpráv s největším významem pro vládní agendu (legislativa, rozhodnutí vlády, personální změny, klíčové politické spory). Každou zprávu vezmi z JINÉHO zpravodajského webu — nikdy dvě zprávy ze stejné domény.

Používej jen URL, která se skutečně objevila ve výsledcích vyhledávání – NEVYMÝŠLEJ je. Nadpis napiš vlastními slovy (nekopíruj titulek).

Odpověz POUZE platným JSON polem, začni [ a skonči ]. Žádný úvodní text, žádné markdown bloky:
[{"title_cs":"krátký nadpis","title_en":"short headline in English","summary_cs":"1 věta o čem to je","summary_en":"1 sentence in English","url":"https://...","date":"YYYY-MM-DD"}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5, allowed_domains: ALLOWED_DOMAINS }],
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
  if (a === -1 || b === -1) throw new Error("no JSON array in response");
  const parsed = JSON.parse(clean.slice(a, b + 1));

  const items = [];
  const seenHosts = new Set();
  for (const r of parsed) {
    if (!r || !r.url || !r.title_cs) continue;
    const realUrl = realMap[normUrl(r.url)];
    if (!realUrl) continue; // invented link — drop
    const host = hostOf(realUrl);
    if (seenHosts.has(host)) continue; // enforce one item per outlet
    seenHosts.add(host);
    items.push({
      title: { cs: r.title_cs, en: r.title_en || r.title_cs },
      summary: { cs: r.summary_cs || "", en: r.summary_en || r.summary_cs || "" },
      url: realUrl,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : null,
    });
    if (items.length >= 5) break;
  }
  return { items, searchCount: Object.keys(realMap).length };
}

async function callWithBackoff(ch, prevEvals, snapshots, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await evaluateChapter(ch, prevEvals, snapshots); }
    catch (e) {
      // 429 = rate limit, 5xx/529 = server-side (overloaded) — both worth waiting out
      const retryable = /API (429|5\d\d)/.test(e.message) || /JSON/.test(e.message);
      if (!retryable || i === tries - 1) throw e;
      const wait = /API (429|5\d\d)/.test(e.message) ? 30000 * (i + 1) : 3000;
      console.log(`  retry — waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const prevEvals = readJSON(OUT_EVAL, { evals: {} }).evals || {};
  const snapshots = readJSON(OUT_HIST, { snapshots: [] }).snapshots || [];

  // Carry forward only real items — drops any stray invented IDs already in the file
  const newEvals = {};
  for (const id in prevEvals) if (VALID_IDS.has(id)) newEvals[id] = prevEvals[id];
  for (const ch of CHAPTERS.slice(0, CHAPTER_LIMIT)) {
    try {
      process.stdout.write(`Evaluating ${ch.id} ${ch.title.cs}… `);
      const r = await callWithBackoff(ch, prevEvals, snapshots);
      Object.assign(newEvals, r.evals);
      console.log(`ok (${Object.keys(r.evals).length}) — ${r.searchCount} search hits, ${r.kept} sources kept`);
    } catch (e) {
      console.log(`failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 20000));
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  writeFileSync(OUT_EVAL, JSON.stringify({ evals: newEvals, lastUpdated: now }, null, 2));

  const statuses = {};
  for (const id in newEvals) statuses[id] = newEvals[id].status;
  const kept = snapshots.filter((s) => s.date !== today);
  kept.push({ date: today, statuses });
  const capped = kept.slice(-HISTORY_WEEKS);
  writeFileSync(OUT_HIST, JSON.stringify({ snapshots: capped }, null, 2));

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
      comment_cs: e.comment?.cs || "",
      comment_en: e.comment?.en || "",
      change_cs: e.change?.cs || "",
      sources: (e.sources || []).map((s) => s.url),
      model: MODEL,
    });
    recorded++;
  }
  entries.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id, "cs", { numeric: true }) : a.date < b.date ? -1 : 1));
  writeFileSync(OUT_AUDIT, JSON.stringify({ entries }, null, 2));

  console.log(`\nWrote ${Object.keys(newEvals).length} evaluations, ${capped.length} history snapshots, ${recorded} audit records`);

  // Headline news last — a failure here must not lose the evaluation results.
  try {
    process.stdout.write("Fetching headlines… ");
    const n = await fetchHeadlines();
    if (n.items.length > 0) {
      writeFileSync(OUT_NEWS, JSON.stringify({ generatedAt: now, items: n.items }, null, 2));
      console.log(`ok (${n.items.length} from ${n.items.length} outlets) — ${n.searchCount} search hits`);
    } else {
      console.log("no usable items — keeping previous news.json");
    }
  } catch (e) {
    console.log(`failed: ${e.message} — keeping previous news.json`);
  }
}

main();
