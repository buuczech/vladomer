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

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { POLE_KOREKTURY, ctiPole, promptKorektury } from "../lib/korektura.js";

/* Ochrana ostrých dat: evaluate.js na konci zapisuje public/*.json, a protože
   podstrčený fetch níže vrací prázdné pole, uložil by 0 hodnocení a přepsal
   tím týdenní práci. Přepsat writeFileSync nejde — evaluate.js si ho importuje
   jmenovitě, takže má vlastní vazbu. Proto se soubory přečtou předem a při
   ukončení procesu (i po chybě) vrátí zpět. */
const CHRANENE = ["evaluations.json", "history.json", "news.json", "audit.json", "naklady.json"]
  .map((n) => new URL(`../../public/${n}`, import.meta.url))
  .map((u) => [u, existsSync(u) ? readFileSync(u) : null]);

process.on("exit", () => {
  // Soubor, který před během neexistoval (naklady.json), se zase smaže.
  for (const [url, obsah] of CHRANENE) obsah ? writeFileSync(url, obsah) : rmSync(url, { force: true });
  console.error(`[dump] obnoveno ${CHRANENE.length} datových souborů — nic se nepřepsalo`);
});

/* Prompt korektury se v tomhle režimu sám od sebe NIKDY neodešle: podstrčený
   fetch níž vrací "[]", takže žádná kapitola nevrátí hodnocení, žádný bod
   nedostane dnešní updatedAt a dávka korektury zůstane prázdná. Diff přes
   dump-prompts by u prompt-korektura.md vycházel prázdný, ať se v něm změní
   cokoliv — a prázdný diff se tady čte jako důkaz, že se nic nezměnilo.
   Vykresluje se proto zvlášť, z ostrých dat, ještě než evaluate.js začne. */
{
  const evalUrl = new URL("../../public/evaluations.json", import.meta.url);
  const evals = existsSync(evalUrl) ? JSON.parse(readFileSync(evalUrl, "utf8")).evals || {} : {};
  /* Pevná dávka nezávislá na běhu: první dva body podle id a všechna jejich
     neprázdná pole. Ostrý text, ne ukázka — právě o uvozovky a čísla v něm
     se rozklad odpovědi láme, takže má být v dumpu vidět. */
  const davka = [];
  for (const id of Object.keys(evals).sort((a, b) => a.localeCompare(b, "cs", { numeric: true })).slice(0, 2)) {
    for (const pole of POLE_KOREKTURY) {
      const text = ctiPole(evals[id], pole);
      if (text) davka.push({ klic: `${id}|${pole}`, id, pole, text });
    }
  }
  if (davka.length) {
    console.log("=".repeat(72));
    console.log(`RENDER prompt-korektura.md  úryvků=${davka.length}`);
    console.log("(nejde o odchycený POST — v tomhle režimu je dávka korektury prázdná)");
    console.log("-".repeat(72));
    console.log(promptKorektury(davka));
  } else {
    console.log("[dump] public/evaluations.json je prázdný — prompt korektury se nevykreslil");
  }
}

// Přeskočí 20s pauzy mezi kapitolami — bez sítě nemají smysl.
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 50 ? 0 : ms, ...a);

/* Rejstřík Sbírky (lib/sbirka.js) se čte doopravdy: e-Sbírka je veřejná,
   zdarma a nic se tím neodesílá — a jen tak výpis ukáže přesně tu tabulku,
   kterou model dostane. Bez sítě běh spadne na text pro nedostupný rejstřík. */
/* Totéž otevřená data Sněmovny (lib/psp.js): seznam tisků v promptu hodnocení. */
const skutecnyFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (String(url).startsWith("https://e-sbirka.gov.cz/")) return skutecnyFetch(url, opt);
  if (String(url).startsWith("https://www.psp.cz/eknih/cdrom/opendata/")) return skutecnyFetch(url, opt);
  // Ověření názvů modelů (lib/modely.js, overModely) — tady vždy „existuje“.
  if (String(url).startsWith("https://api.anthropic.com/v1/models/")) return new Response("{}", { status: 200 });
  const body = JSON.parse(opt.body);
  console.log("=".repeat(72));
  console.log(`POST ${url}  model=${body.model}  max_tokens=${body.max_tokens}`);
  console.log(`tools=${JSON.stringify(body.tools)}`);
  console.log("-".repeat(72));
  console.log(body.messages[0].content);
  /* Doptání (evaluateChapter, když odpověď nejde přečíst) posílá celou
     konverzaci: první zadání se opakuje beze změny, nové je jen poslední
     sdělení. Vypíše se to, aby se změna doptání v diffu ukázala. */
  if (body.messages.length > 1) {
    const posledni = body.messages[body.messages.length - 1];
    console.log("-".repeat(72));
    console.log(`(pokračování konverzace, zpráv=${body.messages.length}, poslední ${posledni.role}:)`);
    console.log(typeof posledni.content === "string" ? posledni.content : JSON.stringify(posledni.content));
  }
  // Prázdné pole = žádná hodnocení; skript to zvládne a pokračuje dál.
  const zprava = { id: "msg_dump", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "[]" }],
    stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } };
  /* Modely s přemýšlením se volají se streamem (lib/modely.js): odpověď
     musí přijít jako SSE, jinak ji skládání streamu nepřečte. */
  if (body.stream) {
    const u = (typ, data) => `event: ${typ}\ndata: ${JSON.stringify({ type: typ, ...data })}\n\n`;
    return new Response(
      u("message_start", { message: { ...zprava, content: [], stop_reason: null } })
      + u("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
      + u("content_block_delta", { index: 0, delta: { type: "text_delta", text: "[]" } })
      + u("content_block_stop", { index: 0 })
      + u("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } })
      + u("message_stop", {}),
      { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  return { ok: true, status: 200, json: async () => zprava };
};
