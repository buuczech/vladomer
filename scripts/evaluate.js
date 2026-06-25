/* scripts/evaluate.js
 * Weekly server-side evaluation.
 *  - Grades each commitment from MULTIPLE angles ("yes, but…" / "no, but…").
 *  - Feeds last week's status + comment + status history into the prompt so the
 *    model can say what changed and place it in a broader trajectory.
 *  - Captures the source URLs the web search actually returned and attaches the
 *    ones the model cited per item (invented URLs are filtered out).
 *  - Writes public/evaluations.json AND appends a weekly snapshot to history.json.
 *
 * Run:  ANTHROPIC_API_KEY=sk-ant-... npm run evaluate
 */
import { writeFileSync, readFileSync } from "node:fs";
import { CHAPTERS } from "../src/data.js";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || "claude-haiku-4-5-20251001";
const OUT_EVAL = new URL("../public/evaluations.json", import.meta.url);
const OUT_HIST = new URL("../public/history.json", import.meta.url);
const VALID = new Set(["fulfilled", "in_progress", "not_started", "stalled"]);
const HISTORY_WEEKS = 52;
const MAX_SOURCES = 3;

const STATUS_CS = { fulfilled: "splněno", in_progress: "probíhá", not_started: "nezahájeno", stalled: "uvázlo" };

if (!KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Set it as an env var / repo secret.");
  process.exit(1);
}

function readJSON(url, fallback) {
  try { return JSON.parse(readFileSync(url, "utf8")); } catch { return fallback; }
}
function truncate(s, n) { s = s || ""; return s.length > n ? s.slice(0, n) + "…" : s; }
function normUrl(u) { return (u || "").trim().replace(/\/+$/, "").toLowerCase(); }

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

  const prompt = `Jsi nestranný, kritický analytik plnění vládního programu. Hodnoť na základě ověřitelných, aktuálních faktů (k dnešnímu dni). Vláda Andreje Babiše (ANO, SPD, Motoristé) nastoupila 15. 12. 2025.

Oblast: „${ch.title.cs}".

U KAŽDÉHO bodu zvaž důkazy z VÍCE úhlů, ne jen jeden závěr:
- „ano, ale…" — co svědčí pro splnění a jaké jsou výhrady (pouze ohlášeno vs. reálně zavedeno, jen částečně, jen formálně, bez dopadu).
- „ne, ale…" — co svědčí proti splnění a jaké jsou náznaky pokroku či dílčích kroků.
- Zohledni kritiku opozice i odborníků a rozdíl mezi sliby/návrhy a skutečným dopadem.

Na základě této vyvážené úvahy urči stav (konzervativně; bez důkazu = not_started):
fulfilled = prokazatelně splněno; in_progress = aktivně se pracuje (návrh, projednávání); not_started = žádný doložitelný krok; stalled = uvázlo/opuštěno.

Je-li uveden předchozí stav, do pole "change" napiš, CO SE ZMĚNILO oproti minulému týdnu, a zasaď to do širšího vývoje (trajektorie). Pokud předchozí hodnocení chybí, do "change" napiš „první hodnocení".

Do pole "sources" uveď 1–3 PŘESNÉ URL z výsledků vyhledávání, které tvé hodnocení nejvíce podporují. Používej jen URL, která se skutečně objevila ve vyhledávání – NEVYMÝŠLEJ je.

Body:
${lines}

Vrať POUZE platné JSON pole, žádný jiný text ani markdown:
[{"id":"...","status":"fulfilled|in_progress|not_started|stalled","comment_cs":"2–4 věty, vyvážené ano-ale/ne-ale","comment_en":"2–4 sentences","change_cs":"1–2 věty","change_en":"1–2 sentences","sources":["https://...","https://..."]}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3500,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: "[" },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  // Collect the URLs the web search actually returned (to validate citations)
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

  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
  const clean = ("[" + text).replace(/```json|```/g, "").trim();
  const a = clean.indexOf("["), b = clean.lastIndexOf("]");
  if (a === -1 || b === -1) throw new Error("no JSON array in response");
  const parsed = JSON.parse(clean.slice(a, b + 1));

  const out = {};
  for (const r of parsed) {
    if (!r || !r.id) continue;
    const sources = [];
    if (Array.isArray(r.sources)) {
      const seen = new Set();
      for (const u of r.sources) {
        const hit = realMap[normUrl(u)];           // keep only real, searched URLs
        if (hit && !seen.has(hit.url)) { seen.add(hit.url); sources.push(hit); }
        if (sources.length >= MAX_SOURCES) break;
      }
    }
    out[r.id] = {
      status: VALID.has(r.status) ? r.status : "not_started",
      comment: { cs: r.comment_cs || "", en: r.comment_en || "" },
      change: { cs: r.change_cs || "", en: r.change_en || "" },
      sources,
      previousStatus: prevEvals[r.id]?.status || null,
      updatedAt: new Date().toISOString(),
    };
  }
  return out;
}

async function callWithBackoff(ch, prevEvals, snapshots, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await evaluateChapter(ch, prevEvals, snapshots); }
    catch (e) {
      const retryable = /API 429/.test(e.message) || /JSON/.test(e.message);
      if (!retryable || i === tries - 1) throw e;
      const wait = /API 429/.test(e.message) ? 30000 * (i + 1) : 3000;
      console.log(`  retry — waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const prevEvals = readJSON(OUT_EVAL, { evals: {} }).evals || {};
  const snapshots = readJSON(OUT_HIST, { snapshots: [] }).snapshots || [];

  const newEvals = { ...prevEvals };
  for (const ch of CHAPTERS) {
    try {
      process.stdout.write(`Evaluating ${ch.id} ${ch.title.cs}… `);
      const r = await callWithBackoff(ch, prevEvals, snapshots);
      Object.assign(newEvals, r);
      console.log(`ok (${Object.keys(r).length})`);
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

  console.log(`\nWrote ${Object.keys(newEvals).length} evaluations and ${capped.length} history snapshots`);
}

main();
