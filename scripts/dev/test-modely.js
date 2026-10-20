/* scripts/dev/test-modely.js — vrstva volání modelů (lib/modely.js), offline a zdarma.
 *
 *     node scripts/dev/test-modely.js
 *
 * Hlídá čtyři věci, na kterých stojí měsíční běh se silnějšími modely:
 *   1. dnešní modely dostanou PŘESNĚ to tělo požadavku, které se posílalo do
 *      10/2026 (doslovné kopie z evaluate.js a korektura.js před změnou),
 *   2. modely s přemýšlením dostanou tělo bez temperature (400) a se vším, co
 *      potřebují (přemýšlení, effort, limit, stream, vyhledávání, záloha),
 *   3. stream se složí do tvaru odpovědi bez streamu, včetně podpisu
 *      přemýšlení — doptání v téže konverzaci ho musí vrátit beze změny,
 *   4. cena, pojistka a odmítnutí — a jejich chybové hlášky NEJSOU ve tvaru,
 *      který by withBackoff v evaluate.js opakoval.
 */
import { readFileSync } from "node:fs";
import {
  profilModelu, teloPozadavku, slozStream, cenaVolani, zavolejApi, nastavPojistku, pojistkaZasahla,
  souhrnNakladu, overModely, limitPremysleni,
} from "../lib/modely.js";

let chyb = 0;
const over = (podminka, popis, detail) => {
  if (podminka) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* Stejně jako withBackoff v evaluate.js — kdyby se tam pravidlo změnilo,
   musí se změnit i tady. */
const opakovalBy = (zprava) => /API (429|5\d\d)/.test(zprava) || /JSON/.test(zprava) || zprava.includes("[opakovat]");

const W = ["vlada.gov.cz", "psp.cz"];
const M = [{ role: "user", content: "prompt" }];

console.log("1) Dnešní modely: tělo beze změny");
// Doslovné tvary z evaluate.js / korektura.js před 10/2026.
over(stejne(
  teloPozadavku({ model: "claude-haiku-4-5-20251001", maxTokens: 6000, teplota0: true, hledani: { maxUses: 4, domeny: W }, messages: M }),
  { model: "claude-haiku-4-5-20251001", max_tokens: 6000, temperature: 0, messages: M, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4, allowed_domains: W }] },
), "hodnocení (Haiku 4.5)");
over(stejne(
  teloPozadavku({ model: "claude-haiku-4-5-20251001", maxTokens: 3000, teplota0: true, hledani: { maxUses: 8, domeny: W }, messages: M }),
  { model: "claude-haiku-4-5-20251001", max_tokens: 3000, temperature: 0, messages: M, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8, allowed_domains: W }] },
), "sken (Haiku 4.5)");
over(stejne(
  teloPozadavku({ model: "claude-sonnet-4-6", maxTokens: 2500, teplota0: true, hledani: { maxUses: 3, domeny: W }, messages: M }),
  { model: "claude-sonnet-4-6", max_tokens: 2500, temperature: 0, messages: M, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, allowed_domains: W }] },
), "ověření (Sonnet 4.6)");
over(stejne(
  teloPozadavku({ model: "claude-sonnet-4-6", maxTokens: 2500, teplota0: true, hledani: null, messages: M }),
  { model: "claude-sonnet-4-6", max_tokens: 2500, temperature: 0, messages: M },
), "ověření bez vyhledávání");
over(stejne(
  teloPozadavku({ model: "claude-haiku-4-5-20251001", maxTokens: 12000, hledani: { maxUses: 8, domeny: W }, messages: M }),
  { model: "claude-haiku-4-5-20251001", max_tokens: 12000, messages: M, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8, allowed_domains: W }] },
), "zprávy (bez temperature, jako dosud)");
over(stejne(
  teloPozadavku({ model: "claude-sonnet-4-6", maxTokens: 8000, teplota0: true, effort: "high", messages: M }),
  { model: "claude-sonnet-4-6", max_tokens: 8000, temperature: 0, messages: M },
), "korektura (Sonnet 4.6) — effort se u dnešních modelů nepoužije");
over(stejne(teloPozadavku({ model: "x", maxTokens: 100, teplota0: true, messages: M }), { model: "x", max_tokens: 100, temperature: 0, messages: M }),
  "neznámý model („x“ z testů) dostane dnešní tvar");
over(profilModelu("claude-opus-4-6").druh === "klasicky", "Opus 4.6 je klasický (teplotu přijímá)");

console.log("\n2) Modely s přemýšlením");
for (const model of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-4-8", "claude-haiku-5-5", "claude-fable-5-1"]) {
  const t = teloPozadavku({ model, maxTokens: 6000, teplota0: true, hledani: { maxUses: 4, domeny: W }, effort: "high", messages: M });
  over(!("temperature" in t), `${model}: bez temperature (jinak 400)`);
  over(stejne(t.thinking, { type: "adaptive" }) && stejne(t.output_config, { effort: "high" }), `${model}: adaptivní přemýšlení a effort`);
  over(t.stream === true && t.max_tokens === limitPremysleni(6000), `${model}: stream a limit ${limitPremysleni(6000)}`);
  const ws = /haiku-5/.test(model) ? "web_search_20250305" : "web_search_20260209";
  over(t.tools && t.tools[0].type === ws, `${model}: vyhledávání ${ws}`);
  const zaloha = /^claude-(opus-5-5|sonnet-5-5|fable-5-1)$/.test(model);
  over((t.fallbacks === "default") === zaloha, `${model}: záložní model ${zaloha ? "ano" : "ne"}`);
}
over(limitPremysleni(2500) === 32000 && limitPremysleni(12000) === 48000 && limitPremysleni(20000) === 64000, "limit: min 32k, ×4, strop 64k");

console.log("\n3) Složení streamu");
const sse = readFileSync(new URL("./fixtury/sse-ukazka.txt", import.meta.url), "utf8");
const proud = (text, kusu = 7) => {
  // rozsekat na nepravidelné kusy, ať se ověří i událost rozdělená mezi kusy
  const bajty = new TextEncoder().encode(text);
  const kusy = [];
  for (let i = 0; i < bajty.length; i += Math.ceil(bajty.length / kusu) + 3) kusy.push(bajty.slice(i, i + Math.ceil(bajty.length / kusu) + 3));
  return { body: (async function* () { for (const k of kusy) yield k; })() };
};
const z = await slozStream(proud(sse));
over(z.model === "claude-sonnet-5-5" && z.stop_reason === "end_turn", "model a stop_reason");
over(z.content.map((b) => b.type).join(",") === "thinking,server_tool_use,web_search_tool_result,text", "pořadí bloků");
over(z.content[0].signature === "EqQBCkgIBRABGAIiQJ5xQ2rPzw==" && z.content[0].thinking === "", "podpis přemýšlení složený ze dvou částí, text přemýšlení prázdný (display omitted)");
over(stejne(z.content[1].input, { query: "zákon o evidenci tržeb 2026" }), "vstup nástroje z input_json_delta");
over(z.content[2].content[0].url === "https://e-sbirka.gov.cz/sb/2026/180", "výsledky vyhledávání beze změny");
over(z.content[3].text === '[{"id":"2.3","status":"fulfilled","evidence":"Zákon č. 180/2026 Sb."}]', "text odpovědi");
over(z.usage.input_tokens === 12000 && z.usage.output_tokens === 2400 && z.usage.server_tool_use.web_search_requests === 1, "spotřeba z message_start + message_delta");
const zCrlf = await slozStream(proud(sse.replace(/\n/g, "\r\n"), 3));
over(stejne(zCrlf, z), "stream s CRLF dá totéž");
try {
  await slozStream(proud(sse.slice(0, sse.indexOf("event: message_delta"))));
  over(false, "useknutý stream musí skončit chybou");
} catch (e) { over(opakovalBy(e.message), "useknutý stream → chyba k opakování", e.message); }
try {
  await slozStream(proud('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n'));
  over(false, "chyba ve streamu musí vyhodit výjimku");
} catch (e) { over(/^API 529/.test(e.message) && opakovalBy(e.message), "overloaded ve streamu → API 529 (withBackoff počká)", e.message); }

console.log("\n4) Cena, pojistka, odmítnutí");
const blizko = (a, b) => Math.abs(a - b) < 1e-9;
over(blizko(cenaVolani("claude-haiku-4-5-20251001", { input_tokens: 1e6, output_tokens: 1e6 }), 6), "Haiku 4.5: 1M vstup + 1M výstup = 6 $");
over(blizko(cenaVolani("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }), 4 + 0.4 + 5), "Opus 5.5: vstup + čtení cache (0,1×) + zápis (1,25×)");
over(blizko(cenaVolani("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 7 } }), 0.07), "vyhledávání 10 $ / 1000");
over(blizko(cenaVolani("claude-haiku-5-5", { input_tokens: 200000, output_tokens: 0 }), 0.1), "Haiku 5.5 nad 100k vstupu vyšší sazba");
over(blizko(cenaVolani("claude-neznamy-9", { input_tokens: 1e6, output_tokens: 0 }), 10), "neznámý model počítán jako nejdražší řada");

const puvodniFetch = globalThis.fetch;
let odpovedi = [];
globalThis.fetch = async (url) => {
  if (String(url).includes("/v1/models/")) return { ok: !String(url).includes("neexistuje"), status: String(url).includes("neexistuje") ? 404 : 200 };
  const o = odpovedi.shift();
  return { ok: o.status ? o.status < 300 : true, status: o.status || 200, json: async () => o.data, text: async () => JSON.stringify(o.data) };
};
try {
  odpovedi = [{ status: 529, data: { error: { type: "overloaded_error" } } }];
  await zavolejApi({ model: "claude-sonnet-4-6", max_tokens: 10, messages: M }, { klic: "k", role: "test" });
  over(false, "chyba API musí vyhodit výjimku");
} catch (e) { over(/^API 529: /.test(e.message), "chyba API ve tvaru „API 529: …“ (nosné pro withBackoff)", e.message); }
try {
  odpovedi = [{ data: { model: "claude-opus-5-5", stop_reason: "refusal", stop_details: { category: "cyber" }, content: [], usage: { input_tokens: 10, output_tokens: 0 } } }];
  await zavolejApi({ model: "claude-opus-5-5", max_tokens: 10, messages: M }, { klic: "k", role: "test" });
  over(false, "odmítnutí musí vyhodit výjimku");
} catch (e) { over(/odmítl/.test(e.message) && !opakovalBy(e.message), "odmítnutí → chyba, kterou withBackoff NEopakuje", e.message); }
odpovedi = [{ data: { model: "claude-opus-4-8", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1000, output_tokens: 100 } } }];
const r = await zavolejApi({ model: "claude-opus-5-5", max_tokens: 10, messages: M }, { klic: "k", role: "zaloha" });
const s1 = souhrnNakladu();
over(r.content[0].text === "ok" && s1.podle_role.zaloha.modely[0] === "claude-opus-4-8", "spotřeba se připíše modelu, který skutečně odpověděl (záloha)");
nastavPojistku(s1.celkem_usd); // už dosaženo
try {
  await zavolejApi({ model: "claude-sonnet-4-6", max_tokens: 10, messages: M }, { klic: "k", role: "test" });
  over(false, "po dosažení pojistky se nesmí nic odeslat");
} catch (e) { over(/POJISTKA CENY/.test(e.message) && !opakovalBy(e.message) && pojistkaZasahla(), "pojistka zastaví další volání a nejde obejít opakováním", e.message); }
try { await overModely(["claude-sonnet-5-5", "claude-neexistuje-5"], "k"); over(false, "neznámý model musí neprojít"); }
catch (e) { over(/neexistuje|nezná/.test(e.message), "overModely: model, který program nezná nebo API nemá → chyba před placením", e.message); }
try { await overModely(["claude-sonnet-5-5", "claude-opus-5-5"], "k"); over(true, "overModely: známé modely projdou"); }
catch (e) { over(false, "overModely: známé modely projdou", e.message); }
globalThis.fetch = puvodniFetch;

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
