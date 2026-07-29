/* scripts/dev/dump-prompts.js — vývojový nástroj, v CI se nikdy nespouští.
 *
 * Vypíše přesně to, co by evaluate.js poslal do API, ale nic neodešle a nic
 * nestojí. Slouží k důkazu, že přesun promptů do samostatných souborů
 * nezměnil ani bajt odesílaného textu:
 *
 *   ANTHROPIC_API_KEY=x CHAPTER_LIMIT=18 \
 *     node --import ./scripts/dev/dump-prompts.js scripts/evaluate.js > pred.txt
 *
 * (dump se udělá před změnou i po ní a porovná se diffem)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

/* Ochrana ostrých dat: evaluate.js na konci zapisuje public/*.json, a protože
   podstrčený fetch níže vrací prázdné pole, uložil by 0 hodnocení a přepsal
   tím týdenní práci. Přepsat writeFileSync nejde — evaluate.js si ho importuje
   jmenovitě, takže má vlastní vazbu. Proto se soubory přečtou předem a při
   ukončení procesu (i po chybě) vrátí zpět. */
const CHRANENE = ["evaluations.json", "history.json", "news.json", "audit.json"]
  .map((n) => new URL(`../../public/${n}`, import.meta.url))
  .filter((u) => existsSync(u))
  .map((u) => [u, readFileSync(u)]);

process.on("exit", () => {
  for (const [url, obsah] of CHRANENE) writeFileSync(url, obsah);
  console.error(`[dump] obnoveno ${CHRANENE.length} datových souborů — nic se nepřepsalo`);
});

// Přeskočí 20s pauzy mezi kapitolami — bez sítě nemají smysl.
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 50 ? 0 : ms, ...a);

globalThis.fetch = async (url, opt) => {
  const body = JSON.parse(opt.body);
  console.log("=".repeat(72));
  console.log(`POST ${url}  model=${body.model}  max_tokens=${body.max_tokens}`);
  console.log(`tools=${JSON.stringify(body.tools)}`);
  console.log("-".repeat(72));
  console.log(body.messages[0].content);
  // Prázdné pole = žádná hodnocení; skript to zvládne a pokračuje dál.
  return { ok: true, json: async () => ({ content: [{ type: "text", text: "[]" }] }) };
};
