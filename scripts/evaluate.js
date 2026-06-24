/* scripts/evaluate.js
 * Runs server-side (locally or in GitHub Actions). Calls the Anthropic API
 * with your secret key (never exposed to browsers), grades every commitment
 * against current news via the web_search tool, and writes the result to
 * public/evaluations.json — the file the website reads.
 *
 * Run:   ANTHROPIC_API_KEY=sk-ant-... npm run evaluate
 */
import { writeFileSync, readFileSync } from "node:fs";
import { CHAPTERS } from "../src/data.js";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || "claude-haiku-4-5-20251001"; // token-efficient
const OUT = new URL("../public/evaluations.json", import.meta.url);
const VALID = new Set(["fulfilled", "in_progress", "not_started", "stalled"]);

if (!KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Set it as an env var / repo secret.");
  process.exit(1);
}

async function evaluateChapter(ch) {
  const itemList = ch.groups
    .flatMap((g) => g.items)
    .map((it) => `- [${it.id}] ${it.cs}`)
    .join("\n");

  const prompt = `Jsi nestranný analytik plnění vládního programu. Hodnoť POUZE na základě ověřitelných, aktuálních faktů (k dnešnímu dni). Vláda Andreje Babiše (ANO, SPD, Motoristé) nastoupila 15. 12. 2025.

Pro každý bod programového prohlášení z oblasti „${ch.title.cs}" urči stav:
- "fulfilled" = prokazatelně splněno (zákon přijat, opatření zavedeno)
- "in_progress" = aktivně se na tom pracuje (návrh, projednávání)
- "not_started" = zatím žádný doložitelný krok
- "stalled" = uvázlo nebo bylo opuštěno

Body:
${itemList}

Vrať POUZE platný JSON (žádný jiný text, žádné markdown bloky):
[{"id":"...","status":"fulfilled|in_progress|not_started|stalled","comment_cs":"1–3 věty proč","comment_en":"1–3 sentences why"}]
Buď konzervativní: bez důkazu volíš "not_started".`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const a = clean.indexOf("["), b = clean.lastIndexOf("]");
  if (a === -1 || b === -1) throw new Error("no JSON array in response");
  const parsed = JSON.parse(clean.slice(a, b + 1));

  const out = {};
  for (const r of parsed) {
    if (!r || !r.id) continue;
    out[r.id] = {
      status: VALID.has(r.status) ? r.status : "not_started",
      comment: { cs: r.comment_cs || "", en: r.comment_en || "" },
      updatedAt: new Date().toISOString(),
    };
  }
  return out;
}

async function main() {
  // start from whatever exists, so a failed chapter keeps last week's value
  let evals = {};
  try { evals = JSON.parse(readFileSync(OUT, "utf8")).evals || {}; } catch {}

  for (const ch of CHAPTERS) {
    try {
      process.stdout.write(`Evaluating ${ch.id} ${ch.title.cs}… `);
      const r = await evaluateChapter(ch);
      Object.assign(evals, r);
      console.log(`ok (${Object.keys(r).length})`);
    } catch (e) {
      console.log(`failed: ${e.message}`);
    }
  }

  const payload = { evals, lastUpdated: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${Object.keys(evals).length} evaluations to public/evaluations.json`);
}

main();
