/* scripts/dev/parita/syntetika.js — deterministický simulátor odpovědí modelu.
 *
 * Parita má projít CELOU pipeline, ne jen šablony. Prázdné „[]“ (dump-prompts)
 * nevyvolá přechod, zábranu, ověřovatele ani korekturu, takže rozdíl
 * v kterémkoli pravidle by parita neviděla. Simulátor proto odpovídá záznamy
 * postavenými ze skutečných publikovaných dat a podle hashe id do nich
 * vkládá „poruchy“ tak, aby se během jednoho plného a jednoho delta běhu
 * prošly všechny cesty programu (spec 001, FR-008):
 *
 *   přijatý / podržený / ověřený (ANO i NE) přechod, „splněno“ s neexistujícím
 *   předpisem (zábrana ho srazí), „splněno“ se skutečným předpisem z fixtury
 *   (oprava data podle e-Sbírky + znění pro ověřovatele), <cite> v komentáři
 *   (mechanická očista), opravitelná pomlčka (korektura), jednobodová odpověď
 *   jako holý objekt, próza s [2.3] před JSON, useknutá odpověď (doptání
 *   chybějících bodů), odpověď bez JSON (doptání v téže konverzaci),
 *   nečitelný sken (přehodnocení celé kapitoly) a zprávy.
 *
 * Nic tu není náhodné: stejné tělo požadavku = stejná odpověď. Proto dva
 * běhy kontroly dají bajtově stejný výsledek (SC-004).
 *
 * Simulátor sdílejí obě strany. Kdyby ho DEV2 změnil, změní se odpovědi pro
 * obě strany stejně — parita měří kód pipeline, ne simulátor.
 */
import { createHash } from "node:crypto";

const DEN = 86400000;
const h = (s) => parseInt(createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Jaký prompt to je. Podle značek v textu, které jsou v šablonách napevno. */
export function druhPozadavku(telo) {
  const zpravy = telo.messages || [];
  if (zpravy.length > 1) return "doptani";
  const t = typeof zpravy[0]?.content === "string" ? zpravy[0].content : JSON.stringify(zpravy[0]?.content || "");
  if (t.includes("Hledáš jen UDÁLOSTI")) return "sken";
  if (t.includes('"potvrzeno"')) return "overeni";
  if (t.includes("[1.1|comment_cs]") && t.includes("[nic]")) return "korektura";
  if (t.includes('"title_cs"')) return "zpravy";
  if (t.includes("Body (vrať hodnocení pro každé ID)")) return "hodnoceni";
  return "neznamy";
}

/** id bodů ze seznamu „- [2.3] …“ v sekci za nadpisem. */
function idZeSeznamu(text, nadpis) {
  const i = text.indexOf(nadpis);
  const cast = i >= 0 ? text.slice(i) : text;
  return [...cast.matchAll(/^- \[(\d{1,2}\.\d{1,2})\]/gm)].map((m) => m[1]);
}

const NAHORU = { not_started: "declared", declared: "in_progress", in_progress: "partial", partial: "fulfilled", broken: "in_progress", fulfilled: "fulfilled" };
const umelaUrl = (id, co) => `https://www.vlada.gov.cz/cz/media-centrum/aktualne/parita-${co}-${id.replace(".", "-")}/`;

/** Jeden záznam hodnocení z publikovaných dat + deterministická porucha. */
function zaznam(id, ctx) {
  const p = ctx.evals[id] || {};
  const zdroje = (p.sources || []).map((s) => s.url);
  const r = {
    id,
    status: p.status || "not_started",
    evidence: p.evidence || "",
    evidence_date: p.evidenceDate || "",
    unverifiable: p.unverifiable === true,
    comment_cs: (p.comment && p.comment.cs) || "Bod zatím nemá doložený krok.",
    comment_en: (p.comment && p.comment.en) || "No documented step yet.",
    change_cs: "beze změny",
    change_en: "no change",
    sources: zdroje,
  };
  const pred = ctx.predpisy2026;
  switch (h(`porucha:${id}`) % 23) {
    case 0: { // čerstvá událost → přechod o stupeň výš (brána ho pošle ověřovateli)
      r.status = NAHORU[r.status];
      r.evidence_date = iso(ctx.dnes - 9 * DEN);
      r.evidence = `Vláda dne ${r.evidence_date} schválila návrh nařízení k bodu ${id} a předložila ho Sněmovně.`;
      r.change_cs = "Vláda schválila návrh nařízení a předložila ho Sněmovně.";
      r.change_en = "The government approved the draft regulation and sent it to the Chamber.";
      r.sources = [umelaUrl(id, "udalost"), ...zdroje];
      break;
    }
    case 1: { // přechod opřený o starý doklad (delta: drží; plný audit: ke kontrole)
      r.status = NAHORU[r.status];
      r.evidence_date = "2026-01-20";
      r.evidence = "Usnesení vlády ze dne 20. 1. 2026 o přípravě věcného záměru.";
      r.change_cs = "Vláda přijala usnesení o přípravě věcného záměru.";
      r.change_en = "The government adopted a resolution on preparing a policy outline.";
      break;
    }
    case 2: { // „splněno“ s předpisem, který ve Sbírce není → zábrana neexistujici-predpis
      r.status = "fulfilled";
      r.evidence_date = "2026-10-02";
      r.evidence = "Zákon č. 999/2026 Sb., vyhlášen 2. 10. 2026, s účinností od 1. 1. 2027.";
      r.change_cs = "Zákon vyšel ve Sbírce zákonů.";
      r.change_en = "The act was published in the Collection of Laws.";
      break;
    }
    case 3: { // „splněno“ se skutečným předpisem z fixtury → datum podle e-Sbírky, znění pro ověřovatele
      const kod = pred.length ? pred[h(`predpis:${id}`) % pred.length] : "152/2026";
      r.status = "fulfilled";
      r.evidence_date = "2026-10-01";
      r.evidence = `Zákon č. ${kod} Sb., vyhlášen 1. 10. 2026 s účinností od 1. 1. 2027.`;
      r.change_cs = "Zákon vyšel ve Sbírce zákonů.";
      r.change_en = "The act was published in the Collection of Laws.";
      r.sources = [umelaUrl(id, "sbirka"), ...zdroje];
      break;
    }
    case 4: // <cite> v komentáři → mechanická očista
      r.comment_cs = `${r.comment_cs} <cite index="1-2">podle zdroje</cite>`;
      break;
    case 5: { // porušení s dokladem
      r.status = "broken";
      r.evidence_date = iso(ctx.dnes - 10 * DEN);
      r.evidence = `Ministr dne ${r.evidence_date} oznámil, že opatření k bodu ${id} nebude součástí reformy.`;
      r.change_cs = "Ministr oznámil, že opatření nebude součástí reformy.";
      r.change_en = "The minister announced the measure would not be part of the reform.";
      r.sources = [umelaUrl(id, "poruseni"), ...zdroje];
      break;
    }
    case 6: // opravitelná pomlčka → korektura s přijatou opravou
      r.change_cs = "Vláda - podle ministerstva - termín ponechala.";
      break;
    default:
      break;
  }
  return r;
}

/* Bloky výsledků vyhledávání: evaluate.js přijme jen URL, které se ve
   vyhledávání objevily (realMap), takže je simulátor musí „najít“. */
function vyhledavani(urls, dotaz) {
  const jedinecne = [...new Set(urls.filter(Boolean))];
  if (!jedinecne.length) return [];
  const id = `srvtoolu_${h(dotaz + jedinecne.join()).toString(16)}`;
  return [
    { type: "server_tool_use", id, name: "web_search", input: { query: dotaz } },
    { type: "web_search_tool_result", tool_use_id: id,
      content: jedinecne.map((url) => ({ type: "web_search_result", url, title: `Zdroj ${url.slice(8, 60)}`, encrypted_content: "", page_age: null })) },
  ];
}

const zprava = (telo, content, stop_reason = "end_turn") => {
  const delka = content.filter((b) => b.type === "text").reduce((n, b) => n + b.text.length, 0);
  /* Model s přemýšlením vrací nejdřív blok přemýšlení s podpisem. Doptání
     ho musí vrátit beze změny (preserved thinking) — simulace to prověří. */
  if (telo.thinking) {
    content = [{ type: "thinking", thinking: "", signature: `parita-podpis-${h(JSON.stringify(telo.messages)).toString(16)}` }, ...content];
  }
  return {
    id: `msg_parita_${h(JSON.stringify(telo.messages)).toString(16)}`,
    type: "message", role: "assistant", model: telo.model, stop_reason,
    content,
    usage: { input_tokens: Math.ceil(JSON.stringify(telo).length / 4), output_tokens: Math.ceil(delka / 4) },
  };
};

function hodnoceni(telo, ids, ctx, doptani = false) {
  const zaznamy = ids.map((id) => zaznam(id, ctx));
  const urls = zaznamy.flatMap((z) => z.sources);
  const hledani = doptani ? [] : vyhledavani(urls, `hodnocení ${ids.join(" ")}`);
  const klic = ids.join(",");
  let text, stop = "end_turn";
  if (!doptani && telo.thinking && ids.length >= 2 && h(`nastroj:${klic}`) % 7 === 0) {
    // 20. 10. 2026 (Sonnet 5.5): volání neexistujícího nástroje „code_execost“
    // místo odpovědi. Jen u modelů s přemýšlením — parita s main se nemění.
    return zprava(telo, [...hledani, { type: "tool_use", id: `toolu_parita_${h(klic).toString(16)}`, name: "code_execost", input: {} }], "tool_use");
  }
  if (!doptani && ids.length >= 2 && h(`bezjson:${klic}`) % 9 === 0) {
    // 16. 10. 2026: rozbor v Markdownu místo JSON → doptání v téže konverzaci
    text = `Vyhledám informace k bodům ${ids.join(", ")}.\n\nNa základě vyhledaných informací nyní mohu posoudit stav.\n\n## Analýza\n- Vláda pokračuje v přípravě.`;
  } else if (!doptani && ids.length >= 4 && h(`useknuto:${klic}`) % 6 === 0) {
    // useknutí uprostřed posledního záznamu → doptání chybějících bodů
    const cele = JSON.stringify(zaznamy);
    text = cele.slice(0, cele.length - Math.floor(JSON.stringify(zaznamy.at(-1)).length / 2));
    stop = "max_tokens";
  } else if (ids.length === 1) {
    text = JSON.stringify(zaznamy[0]); // jednobodová kapitola: holý objekt
  } else if (h(`proza:${klic}`) % 4 === 0) {
    text = `Shrnutí: u bodu [${ids[0]}] proběhl další krok, u ostatních beze změny.\n\n${JSON.stringify(zaznamy)}`;
  } else {
    text = JSON.stringify(zaznamy);
  }
  return zprava(telo, [...hledani, { type: "text", text }], stop);
}

function sken(telo, ctx) {
  const t = telo.messages[0].content;
  const ids = idZeSeznamu(t, "Body (id, znění, dosavadní stav)");
  const oblast = (t.match(/Oblast: „([^“]+)“/) || [])[1] || ids.join();
  if (h(`skenchyba:${oblast}`) % 8 === 0) {
    // nečitelný sken → kapitola se přehodnotí celá, nesmí se tvářit jako klid
    return zprava(telo, [{ type: "text", text: "V tomto období jsem nenašel žádné nové kroky vlády." }]);
  }
  const udalosti = ids
    .filter((id) => h(`sken:${id}`) % 4 === 0 || h(`porucha:${id}`) % 23 <= 1)
    .map((id) => ({ id, udalost: `Vláda projednala materiál k bodu ${id}.`, datum: iso(ctx.dnes - 6 * DEN), zdroje: [umelaUrl(id, "sken")] }));
  const urls = udalosti.flatMap((u) => u.zdroje);
  const text = udalosti.length === 1 ? JSON.stringify(udalosti[0]) : JSON.stringify(udalosti);
  return zprava(telo, [...vyhledavani(urls, `události ${oblast}`), { type: "text", text }]);
}

function overeni(telo) {
  const t = telo.messages[0].content;
  const potvrzeno = h(`overeni:${t}`) % 3 !== 0;
  const text = `Ověřuji doklad podle zadání {stručně}.\n\n${JSON.stringify({ potvrzeno, duvod: potvrzeno ? "Doklad přechod nese." : "Doklad přechod nenese." })}`;
  return zprava(telo, [{ type: "text", text }]);
}

function korektura(telo) {
  const t = telo.messages[0].content;
  const od = t.indexOf("ÚRYVKY K OPRAVĚ");
  const po = t.indexOf("\nODPOVĚĎ", od);
  const seznam = t.slice(od, po > od ? po : undefined);
  const opravy = [];
  for (const m of seznam.matchAll(/^\[([^\]|]+\|[^\]]+)\] (.*)$/gm)) {
    if (m[2].includes(" - ")) opravy.push(`[${m[1]}] ${m[2].split(" - ").join(" – ")}`);
  }
  return zprava(telo, [{ type: "text", text: opravy.length ? opravy.join("\n") : "[nic]" }]);
}

function zpravy(telo, ctx) {
  const polozky = ctx.news.slice(0, 4).map((n, i) => ({
    title_cs: n.title?.cs || `Zpráva ${i + 1}`, title_en: n.title?.en || `News ${i + 1}`,
    summary_cs: n.summary?.cs || "", summary_en: n.summary?.en || "",
    url: n.url, date: iso(ctx.dnes - (2 + i) * DEN),
  }));
  // jedna vymyšlená URL, kterou vyhledávání nevrátilo → musí vypadnout
  polozky.push({ title_cs: "Vymyšlená zpráva", title_en: "Invented", summary_cs: "x", summary_en: "x",
    url: "https://www.irozhlas.cz/zpravy-domov/parita-vymyslena-zprava", date: iso(ctx.dnes - DEN) });
  const urls = polozky.slice(0, -1).map((p) => p.url);
  return zprava(telo, [...vyhledavani(urls, "zprávy týdne"), { type: "text", text: JSON.stringify(polozky) }]);
}

/** Odpověď na jedno tělo požadavku. */
export function odpovez(telo, ctx) {
  const druh = druhPozadavku(telo);
  const prvni = typeof telo.messages[0]?.content === "string" ? telo.messages[0].content : "";
  switch (druh) {
    case "hodnoceni": return hodnoceni(telo, idZeSeznamu(prvni, "Body (vrať hodnocení pro každé ID)"), ctx);
    case "doptani": return hodnoceni(telo, idZeSeznamu(prvni, "Body (vrať hodnocení pro každé ID)"), ctx, true);
    case "sken": return sken(telo, ctx);
    case "overeni": return overeni(telo);
    case "korektura": return korektura(telo);
    case "zpravy": return zpravy(telo, ctx);
    default:
      throw new Error(`[parita] simulátor nezná tento druh požadavku — přidej ho do syntetika.js (začátek: ${prvni.slice(0, 120)})`);
  }
}
