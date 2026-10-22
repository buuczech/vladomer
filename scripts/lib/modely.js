/* scripts/lib/modely.js — jediné místo, které ví, jak se volá který model.
 *
 * Do 10/2026 si každé volání API (4× evaluate.js, 1× korektura.js) skládalo
 * tělo samo, s `temperature: 0` napevno. To umí jen dnešní modely (Haiku 4.5,
 * Sonnet a Opus 4.6). Řada 5.x a Opus 4.7+ teplotu odmítají chybou 400,
 * přemýšlejí, a přemýšlení se počítá do stejného limitu odpovědi — dnešních
 * 6000 tokenů by odpověď usekla. Dlouhé přemýšlení se čtyřmi vyhledáváními
 * navíc přesáhne pětiminutový timeout fetch (undici headersTimeout), takže
 * tyhle modely se volají se streamem.
 *
 * Proto je tu:
 *   profilModelu(model)   „klasicky“ / „premysleni“ — nebo chyba u neznámého
 *   teloPozadavku(...)    tělo požadavku podle profilu; u klasických modelů
 *                         přesně to, co se posílalo dosud (dokazuje parita)
 *   zavolejApi(telo, …)   odeslání, složení streamu, zápis ceny, pojistka,
 *                         rozpoznání odmítnutí
 *   overModely(...)       existují nastavené modely? Ještě než se platí.
 *   souhrnNakladu()       cena běhu po rolích
 *
 * Chybové hlášky jsou nosné: withBackoff v evaluate.js opakuje podle textu
 * („API 429/5xx“, „JSON“, „[opakovat]“). Odmítnutí modelu a pojistka schválně
 * nic z toho neobsahují — stejný vstup by dopadl stejně a pojistka se nemá
 * obcházet opakováním.
 */

const API = "https://api.anthropic.com/v1/messages";
const API_MODELY = "https://api.anthropic.com/v1/models";

/* --- ceny ---------------------------------------------------------------- */
/* USD za milion tokenů [vstup, výstup] podle dokumentace Anthropic ke dni
   2026-10-06. Pořadí řádků rozhoduje (první shoda), proto „opus-5-5“ před
   „opus-5“. Zápis do cache stojí 1,25× vstup, čtení 0,1× vstup. */
const CENY = [
  [/^claude-haiku-4-5/, 1, 5],
  [/^claude-sonnet-4-[56]/, 3, 15],
  [/^claude-opus-4-[5-8]/, 5, 25],
  [/^claude-opus-5-5/, 4, 20],
  [/^claude-opus-5/, 5, 25],
  [/^claude-sonnet-5/, 2, 10],
  [/^claude-haiku-5-5/, 0.1, 0.5],
  [/^claude-(fable|mythos)-5/, 10, 50],
];
/* Neznámý model se počítá konzervativně jako nejdražší řada — pojistka tak
   zasáhne spíš dřív než později. */
const CENA_NEZNAMA = [10, 50];
const CENA_HLEDANI = 0.01; // 10 $ za 1000 vyhledávání

export function cenaZaMilion(model) {
  const r = CENY.find(([re]) => re.test(model));
  return r ? { vstup: r[1], vystup: r[2], znama: true } : { vstup: CENA_NEZNAMA[0], vystup: CENA_NEZNAMA[1], znama: false };
}

export function cenaVolani(model, usage = {}) {
  let { vstup, vystup } = cenaZaMilion(model);
  const vstupTok = usage.input_tokens || 0;
  const zapis = usage.cache_creation_input_tokens || 0;
  const cteni = usage.cache_read_input_tokens || 0;
  // Haiku 5.5 má nad 100 tisíc tokenů vstupu vyšší sazbu.
  if (/^claude-haiku-5-5/.test(model) && vstupTok + zapis + cteni > 100000) { vstup = 0.5; vystup = 2.5; }
  const hledani = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  return (vstupTok * vstup + zapis * vstup * 1.25 + cteni * vstup * 0.1 + (usage.output_tokens || 0) * vystup) / 1e6
    + hledani * CENA_HLEDANI;
}

/* --- profily ------------------------------------------------------------- */
const KLASICKE = /^claude-(haiku-4-5|sonnet-4-[056]|opus-4-[0156])/;
const PREMYSLENI = /^claude-(opus-4-[78]|opus-5|sonnet-5|haiku-5|fable|mythos)/;
/* Vyhledávání má pro všechny modely tutéž, základní verzi. Novější
   web_search_20260209 („dynamické filtrování“: model si hledání řídí vlastním
   kódem) se při prvním placeném měření 20. 10. 2026 (Sonnet 5.5, zlatá sada)
   neosvědčilo: model rozeslal dotazy z kódu, vyčerpal max_uses 4 na kapitolu,
   usoudil, že „vyhledávání selhalo“, a necitoval žádný zdroj (0 sources kept
   v 8 kapitolách z 9); v kapitole 2 navíc zavolal neexistující nástroj
   „code_execost“. Prompty i limity vyhledávání jsou psané pro základní verzi. */
const WEB_SEARCH = "web_search_20250305";

/* Serverový záložní model při odmítnutí („fallbacks: default“) nabízí API jen
   u těchto modelů. */
const SE_ZALOHOU = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/;

/* Neznámý model dostane dnešní (klasický) tvar volání — tak se program
   choval vždycky a tak s ním počítají testy (model „x“). Odmítne ho až
   overModely() na začátku běhu, kde je chyba srozumitelná a ještě nic
   nestálo. */
export function profilModelu(model) {
  if (KLASICKE.test(model)) {
    return { druh: "klasicky", znamy: true, hledani: WEB_SEARCH, teplota: true, stream: false, zaloha: false };
  }
  if (PREMYSLENI.test(model)) {
    return {
      druh: "premysleni",
      znamy: true,
      hledani: WEB_SEARCH,
      teplota: false,
      stream: true,
      zaloha: SE_ZALOHOU.test(model),
    };
  }
  return { druh: "klasicky", znamy: false, hledani: WEB_SEARCH, teplota: true, stream: false, zaloha: false };
}

/* Limit odpovědi pro modely s přemýšlením. Přemýšlení se počítá do téhož
   limitu jako odpověď, takže dnešní limity (2500–12000) by odpověď usekly.
   Strop 64k drží rozumnou mez; skutečnou délku řídí effort, ne limit. */
export function limitPremysleni(maxTokens) {
  return Math.min(64000, Math.max(32000, maxTokens * 4));
}

/**
 * Tělo požadavku podle profilu modelu.
 * @param model      ID modelu
 * @param maxTokens  limit odpovědi, jak ho volající používal dosud
 * @param teplota0   klasický model dostane temperature: 0 (jako dosud)
 * @param hledani    { maxUses, domeny } nebo null (bez vyhledávání)
 * @param effort     hloubka přemýšlení (jen modely s přemýšlením)
 * @param messages   konverzace
 */
export function teloPozadavku({ model, maxTokens, teplota0 = false, hledani = null, effort = "high", messages, bezStreamu = false }) {
  const p = profilModelu(model);
  const tools = hledani
    ? { tools: [{ type: p.hledani, name: "web_search", max_uses: hledani.maxUses, allowed_domains: hledani.domeny }] }
    : {};
  if (p.druh === "klasicky") {
    // Přesně tvar, který se posílal do 10/2026 — parita s main to hlídá.
    return { model, max_tokens: maxTokens, ...(teplota0 ? { temperature: 0 } : {}), messages, ...tools };
  }
  return {
    model,
    max_tokens: limitPremysleni(maxTokens),
    thinking: { type: "adaptive" },
    output_config: { effort },
    messages,
    ...tools,
    // V dávce (Batch API) se nestreamuje — odpověď se vyzvedne hotová.
    ...(bezStreamu ? {} : { stream: true }),
    ...(p.zaloha && !bezStreamu ? { fallbacks: "default" } : {}),
  };
}

/* --- účet běhu a pojistka -------------------------------------------------- */
const ucet = { polozky: [], celkem: 0, pojistka: Infinity, zasahla: false, zastaveno: null };

export function nastavPojistku(usd) { ucet.pojistka = usd; }
export function pojistkaZasahla() { return ucet.zasahla; }

/* Chyba účtu API — došel kredit, klíč odmítnut — se týká všech dalších
   volání, ne jednoho bodu. Generálka 21. 10. 2026 dostala v kole 2 kontroly
   faktů 95× „credit balance is too low“, spolkla je jako chyby jednotlivých
   bodů a skončila jako úspěšná se 107 body k rozhodnutí. Po takové chybě se
   další volání neposílá a běh končí kódem 3 jako u pojistky: nic se
   nezveřejní a přijde e-mail o selhání. Zpráva schválně neobsahuje „API 4xx“
   ani „JSON“, aby ji withBackoff neopakoval. */
export function zastaveniUctu() { return ucet.zastaveno; }
async function chybaApi(res) {
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || /credit balance is too low/i.test(text)) {
    ucet.zastaveno = res.status === 401 || res.status === 403 ? `klíč API odmítnut (HTTP ${res.status})` : "na účtu API došel kredit";
    return new Error(`ÚČET: ${ucet.zastaveno} — běh se zastavuje, další volání se neposílají`);
  }
  return new Error(`API ${res.status}: ${text}`);
}

function zapisSpotrebu(role, pozadovanyModel, data, nasobek = 1) {
  const model = data.model || pozadovanyModel;
  const usage = data.usage || {};
  const usd = cenaVolani(model, usage) * nasobek;
  ucet.celkem += usd;
  ucet.polozky.push({
    role, model, usd,
    vstup: usage.input_tokens || 0,
    vystup: usage.output_tokens || 0,
    cache_zapis: usage.cache_creation_input_tokens || 0,
    cache_cteni: usage.cache_read_input_tokens || 0,
    hledani: (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0,
    znama_cena: cenaZaMilion(model).znama,
  });
}

export function souhrnNakladu() {
  const podleRole = {};
  for (const p of ucet.polozky) {
    const r = (podleRole[p.role] = podleRole[p.role] || { volani: 0, vstup: 0, vystup: 0, cache_zapis: 0, cache_cteni: 0, hledani: 0, usd: 0, modely: [] });
    r.volani++;
    for (const k of ["vstup", "vystup", "cache_zapis", "cache_cteni", "hledani", "usd"]) r[k] += p[k];
    if (!r.modely.includes(p.model)) r.modely.push(p.model);
  }
  for (const r of Object.values(podleRole)) r.usd = Math.round(r.usd * 10000) / 10000;
  return {
    celkem_usd: Math.round(ucet.celkem * 10000) / 10000,
    volani: ucet.polozky.length,
    podle_role: podleRole,
    nezname_ceny: [...new Set(ucet.polozky.filter((p) => !p.znama_cena).map((p) => p.model))],
    pojistka_usd: Number.isFinite(ucet.pojistka) ? ucet.pojistka : null,
    pojistka_zasahla: ucet.zasahla,
    ...(ucet.zastaveno ? { zastaveno: ucet.zastaveno } : {}),
  };
}

/* --- volání ---------------------------------------------------------------- */
export async function zavolejApi(telo, { klic, role }) {
  if (ucet.zastaveno) throw new Error(`ÚČET: ${ucet.zastaveno} — další volání se neposílá`);
  if (ucet.celkem >= ucet.pojistka) {
    ucet.zasahla = true;
    throw new Error(`POJISTKA CENY: běh už stál ${ucet.celkem.toFixed(2)} $ (strop ${ucet.pojistka} $) — další volání se neposílá`);
  }
  const hlavicky = { "content-type": "application/json", "x-api-key": klic, "anthropic-version": "2023-06-01" };
  if (telo.fallbacks) hlavicky["anthropic-beta"] = "server-side-fallback-2026-07-01";
  const res = await fetch(API, { method: "POST", headers: hlavicky, body: JSON.stringify(telo) });
  if (!res.ok) throw await chybaApi(res);
  const data = telo.stream ? await slozStream(res) : await res.json();
  zapisSpotrebu(role, telo.model, data);
  if (data.stop_reason === "refusal") {
    const d = data.stop_details || {};
    throw new Error(`model odmítl odpovědět (refusal${d.category ? `, ${d.category}` : ""}) — stejný vstup by dopadl stejně, neopakuje se`);
  }
  return data;
}

/* Složí odpověď ze SSE streamu do téhož tvaru, jaký vrací volání bez streamu.
   Bloky se skládají obecně podle indexu — text, přemýšlení s podpisem,
   server_tool_use, výsledky vyhledávání i neznámé typy projdou beze změny,
   aby šly vrátit do doptání v téže konverzaci (preserved thinking vyžaduje
   bloky přemýšlení přesně tak, jak přišly). */
export async function slozStream(res) {
  const dekoder = new TextDecoder();
  let buf = "";
  let zprava = null;
  let konec = false;
  const bloky = [];
  const castecnyJson = {};

  const zpracuj = (zaznam) => {
    let udalost = "";
    const data = [];
    for (const radek of zaznam.split("\n")) {
      if (radek.startsWith("event:")) udalost = radek.slice(6).trim();
      else if (radek.startsWith("data:")) data.push(radek.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let d;
    try { d = JSON.parse(data.join("\n")); } catch { throw new Error(`stream: nečitelná událost ${udalost} (JSON) [opakovat]`); }
    const typ = d.type || udalost;
    if (typ === "message_start") {
      zprava = { ...d.message, content: [] };
    } else if (typ === "content_block_start") {
      bloky[d.index] = JSON.parse(JSON.stringify(d.content_block));
    } else if (typ === "content_block_delta") {
      const b = bloky[d.index];
      const x = d.delta || {};
      if (!b) return;
      if (x.type === "text_delta") b.text = (b.text || "") + x.text;
      else if (x.type === "input_json_delta") castecnyJson[d.index] = (castecnyJson[d.index] || "") + x.partial_json;
      else if (x.type === "thinking_delta") b.thinking = (b.thinking || "") + x.thinking;
      else if (x.type === "signature_delta") b.signature = (b.signature || "") + x.signature;
      else if (x.type === "citations_delta") (b.citations = b.citations || []).push(x.citation);
    } else if (typ === "content_block_stop") {
      if (d.index in castecnyJson) {
        const s = castecnyJson[d.index];
        try { bloky[d.index].input = s ? JSON.parse(s) : {}; } catch { throw new Error("stream: nečitelný vstup nástroje (JSON) [opakovat]"); }
      }
    } else if (typ === "message_delta") {
      if (!zprava) return;
      Object.assign(zprava, d.delta || {});
      zprava.usage = { ...(zprava.usage || {}), ...(d.usage || {}) };
    } else if (typ === "message_stop") {
      konec = true;
    } else if (typ === "error") {
      // overloaded_error se chová jako 529 — withBackoff ho počká a zopakuje
      const kod = d.error && d.error.type === "overloaded_error" ? 529 : 500;
      throw new Error(`API ${kod}: chyba ve streamu ${JSON.stringify(d.error || d).slice(0, 200)}`);
    }
  };

  for await (const kus of res.body) {
    buf += dekoder.decode(kus, { stream: true }).replace(/\r\n/g, "\n");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const zaznam = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (zaznam.trim()) zpracuj(zaznam);
    }
  }
  buf += dekoder.decode();
  if (buf.trim()) zpracuj(buf.replace(/\r\n/g, "\n"));
  if (!zprava || !konec) throw new Error("stream skončil před message_stop — odpověď neúplná [opakovat]");
  zprava.content = bloky.filter(Boolean);
  return zprava;
}

/* --- Batch API (dávky, −50 % ceny) ----------------------------------------
   Pro práci, která nespěchá: kontrola faktů 143 bodů. Dávka se odešle, program
   čeká, až doběhne (obvykle do hodiny, nejvýš 24 h), a výsledky páruje podle
   custom_id, nikdy podle pořadí. Spotřeba se zapisuje s polovičním násobkem. */
const API_DAVKY = "https://api.anthropic.com/v1/messages/batches";

export async function odesliDavku(pozadavky, { klic, role }) {
  if (ucet.celkem >= ucet.pojistka) {
    ucet.zasahla = true;
    throw new Error(`POJISTKA CENY: běh už stál ${ucet.celkem.toFixed(2)} $ (strop ${ucet.pojistka} $) — dávka se neposílá`);
  }
  const res = await fetch(API_DAVKY, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": klic, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ requests: pozadavky.map((p) => ({ custom_id: p.custom_id, params: p.params })) }),
  });
  if (!res.ok) throw await chybaApi(res);
  const d = await res.json();
  return { id: d.id, role };
}

export async function cekejNaDavku(id, { klic, intervalMs = 30000, maxMs = 24 * 3600 * 1000, hlas = null } = {}) {
  const zacatek = Date.now();
  for (;;) {
    const res = await fetch(`${API_DAVKY}/${id}`, { headers: { "x-api-key": klic, "anthropic-version": "2023-06-01" } });
    if (!res.ok) throw await chybaApi(res);
    const d = await res.json();
    if (d.processing_status === "ended") return d;
    if (hlas) hlas(d.request_counts);
    if (Date.now() - zacatek > maxMs) throw new Error(`dávka ${id} nedoběhla za ${Math.round(maxMs / 60000)} min`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Výsledky dávky jako Map(custom_id → { ok, zprava | chyba }); spotřeba se připíše s −50 %. */
export async function vysledkyDavky(davka, { klic, role }) {
  const res = await fetch(davka.results_url, { headers: { "x-api-key": klic, "anthropic-version": "2023-06-01" } });
  if (!res.ok) throw await chybaApi(res);
  const out = new Map();
  for (const radek of (await res.text()).split("\n")) {
    if (!radek.trim()) continue;
    const r = JSON.parse(radek);
    if (r.result && r.result.type === "succeeded") {
      zapisSpotrebu(role, r.result.message.model, r.result.message, 0.5);
      out.set(r.custom_id, { ok: true, zprava: r.result.message });
    } else {
      out.set(r.custom_id, { ok: false, chyba: (r.result && r.result.type) || "neznámá" });
    }
  }
  return out;
}

/* Existují nastavené modely? Překlep v nastaveni.txt by jinak vyšel najevo až
   chybou 404 u první kapitoly — a s ní by propadly všechny. */
export async function overModely(modely, klic) {
  for (const model of [...new Set(modely.filter(Boolean))]) {
    if (!profilModelu(model).znamy) {
      throw new Error(`model „${model}“ program nezná — doplň jeho profil a cenu do scripts/lib/modely.js`);
    }
    const res = await fetch(`${API_MODELY}/${encodeURIComponent(model)}`, {
      headers: { "x-api-key": klic, "anthropic-version": "2023-06-01" },
    });
    if (res.status === 404) throw new Error(`model „${model}“ v API neexistuje — zkontroluj název v scripts/nastaveni/nastaveni.txt`);
    if (!res.ok) throw new Error(`ověření modelu „${model}“: API ${res.status}`);
  }
}
