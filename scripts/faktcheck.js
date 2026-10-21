/* scripts/faktcheck.js — kontrola faktů zveřejňovaných dat (spec 004).
 *
 *     node scripts/faktcheck.js                 # vrstva D: pravidla + e-Sbírka + odkazy (zdarma)
 *     node scripts/faktcheck.js --bez-site      # jen pravidla bez sítě (bez rejstříku a odkazů)
 *     node scripts/faktcheck.js --model         # + vrstva M: nezávislý model (STOJÍ PENÍZE)
 *     node scripts/faktcheck.js --model --body 2.3,12.2 --bez-davky
 *     node scripts/faktcheck.js --model --bez-kola2   # jen kolo 1 (měření; ostrý běh vždy obě kola)
 *     node scripts/faktcheck.js --model --zapsat-naklady  # měsíční běh: pojistka na celý běh, cena do public/naklady.json
 *     node scripts/faktcheck.js --model --body … --vyzvednout msgbatch_…  # výsledky už zaplacené dávky (z davky.json nebo logu)
 *     node scripts/faktcheck.js --vystup adresar
 *
 * Vrstva D (deterministická, zdarma) kontroluje to, co program ví přesně:
 *   D1 data dokladů, D2 předpisy proti e-Sbírce (tytéž funkce jako evaluate.js),
 *   D3 shoda české a anglické verze, D4 živost a obsah zdrojových odkazů,
 *   D6–D9 komentář proti stavu, nestabilní čísla předpisů, rozhodnutí vlastníka,
 *   a k tomu výsledek scripts/dev/test-konzistence.js.
 *
 * Vrstva M (--model) dá každý vybraný bod nezávislému modelu (faktcheck_model,
 * silnější a jiný než hodnotitel) s texty zdrojů, které stáhla vrstva D,
 * a s pravidly vlastníka (scripts/nastaveni/metodika.md). Kolo 1 jde přes
 * Batch API (−50 %) bez vyhledávání; kolo 2 s vyhledáváním dostanou jen body,
 * kde tvrzení nesoucí stav zůstalo neověřené. Každou citaci program dohledá
 * ve staženém textu zdroje (lib/faktcheck/modelova.js, overCitace).
 *
 * Výstup: <vystup>/deterministicky.json, <vystup>/modelova.json a souhrn na
 * stdout. Exit 0 vždy (kromě pojistky ceny) — o zveřejnění rozhoduje vrstva R.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATES, CHAPTERS } from "../src/data.js";
import { readList, readSettings } from "./lib/nastaveni.js";
import { nactiRejstrik } from "./lib/sbirka.js";
import { kontrolaBodu, citovaneRoky, citovanePredpisy } from "./lib/faktcheck/deterministicky.js";
import { stahniVse, stahniZdroj } from "./lib/faktcheck/zdroje.js";
import { promptKontroly, nactiMetodiku, parsujKontrolu, overCitace, shrnutiBodu, klicUrl } from "./lib/faktcheck/modelova.js";
import {
  teloPozadavku, zavolejApi, overModely, nastavPojistku, pojistkaZasahla, souhrnNakladu,
  odesliDavku, cekejNaDavku, vysledkyDavky,
} from "./lib/modely.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (j, v) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : v; };
const BEZ_SITE = process.argv.includes("--bez-site");
const S_MODELEM = process.argv.includes("--model");
const BEZ_DAVKY = process.argv.includes("--bez-davky");
const BEZ_KOLA2 = process.argv.includes("--bez-kola2");
const VYZVEDNOUT = (arg("vyzvednout", "") || "").split(",").map((x) => x.trim()).filter(Boolean);
const VYSTUP = resolve(KOREN, arg("vystup", "faktcheck-vystup"));

const data = JSON.parse(readFileSync(join(KOREN, "public", "evaluations.json"), "utf8"));
const evals = data.evals || {};
const dnes = String(data.lastUpdated || new Date().toISOString()).slice(0, 10);
const nastup = String(DATES.tookOffice).slice(0, 10);
mkdirSync(join(VYSTUP, "zdroje"), { recursive: true });
if (S_MODELEM && BEZ_SITE) { console.error("--model potřebuje síť (zdroje, e-Sbírka, API) — nejde s --bez-site"); process.exit(1); }

/* --- rejstřík Sbírky ------------------------------------------------------ */
let rejstrik = null;
const infoRejstriku = { roky: [], predpisu: 0, chyba: BEZ_SITE ? "vypnuto (--bez-site)" : null };
if (!BEZ_SITE) {
  const roky = new Set(citovaneRoky(evals));
  for (let r = Number(nastup.slice(0, 4)); r <= Number(dnes.slice(0, 4)); r++) roky.add(r);
  infoRejstriku.roky = [...roky].sort();
  const n = await nactiRejstrik({ roky: infoRejstriku.roky });
  if (n.predpisy) { rejstrik = n.predpisy; infoRejstriku.predpisu = n.predpisy.size; }
  else infoRejstriku.chyba = n.chyba;
}

/* --- D1–D3, D6–D9 --------------------------------------------------------- */
const audit = existsSync(join(KOREN, "public", "audit.json")) ? JSON.parse(readFileSync(join(KOREN, "public", "audit.json"), "utf8")).entries || [] : [];
const auditPodleBodu = {};
for (const r of audit) (auditPodleBodu[r.id] = auditPodleBodu[r.id] || []).push(r);
const nemeritelne = new Set(readList("nemeritelne.txt").map((r) => r.split(/\s+/)[0]));
const nalezy = [];
const predpisyBodu = {};
for (const [id, e] of Object.entries(evals)) {
  nalezy.push(...kontrolaBodu(id, e, { dnes, nastup, rejstrik, auditBodu: auditPodleBodu[id] || [], nemeritelne }));
  const c = citovanePredpisy(e, rejstrik);
  if (c.length) predpisyBodu[id] = c;
}

/* --- D4 zdroje ------------------------------------------------------------ */
const WHITELIST = readList("weby-hodnoceni.txt").map((d) => d.replace(/^www\./, ""));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").replace(/^m\./, ""); } catch { return ""; } };
const naWhitelistu = (u) => WHITELIST.some((d) => hostOf(u) === d || hostOf(u).endsWith(`.${d}`));
const zdrojeBodu = new Map(); // url → [id]
for (const [id, e] of Object.entries(evals)) {
  for (const s of e.sources || []) {
    if (!zdrojeBodu.has(s.url)) zdrojeBodu.set(s.url, []);
    zdrojeBodu.get(s.url).push(id);
  }
}
const stavZdroju = {};
const textyZdroju = new Map(); // klicUrl → text (pro vrstvu M)
const ulozText = (z) => {
  if (!z.text || z.text.length <= 200) return;
  textyZdroju.set(klicUrl(z.url), z.text);
  if (z.cil) textyZdroju.set(klicUrl(z.cil), z.text);
  writeFileSync(join(VYSTUP, "zdroje", `${createHash("sha1").update(z.url).digest("hex")}.txt`), `${z.url}\n\n${z.text}`);
};
if (!BEZ_SITE) {
  for (const [url, z] of await stahniVse([...zdrojeBodu.keys()])) {
    ulozText(z);
    stavZdroju[url] = { url, status: z.status, cil: z.cil, titulka: z.titulka, znaku: z.text ? z.text.length : 0, typ: z.typ, chyba: z.chyba };
  }
  for (const [url, z] of Object.entries(stavZdroju)) {
    for (const id of zdrojeBodu.get(url)) {
      if (!naWhitelistu(url)) nalezy.push({ bod: id, pravidlo: "zdroj-mimo-whitelist", zavaznost: "CHYBA", nesestav: false, text: `zdroj ${url} není na weby-hodnoceni.txt` });
      if (z.status === 404 || z.status === 410) nalezy.push({ bod: id, pravidlo: "mrtvy-odkaz", zavaznost: "VAROVANI", nesestav: false, text: `zdroj vrací ${z.status}: ${url}` });
      else if (z.titulka) nalezy.push({ bod: id, pravidlo: "odkaz-na-titulku", zavaznost: "VAROVANI", nesestav: false, text: `zdroj přesměrovává na titulní stránku: ${url} → ${z.cil}` });
    }
  }
  // Bod se „splněno“/„porušeno“, u kterého ani jeden zdroj nejde přečíst: model ho nemá z čeho ověřit.
  for (const [id, e] of Object.entries(evals)) {
    if (!["fulfilled", "broken"].includes(e.status) || !(e.sources || []).length) continue;
    const citelne = e.sources.filter((s) => stavZdroju[s.url] && stavZdroju[s.url].znaku > 200);
    if (!citelne.length) nalezy.push({ bod: id, pravidlo: "zadny-citelny-zdroj", zavaznost: "VAROVANI", nesestav: true, text: `žádný ze zdrojů „${e.status}“ nejde přečíst — ověření půjde přes vyhledávání` });
  }
}

/* --- test-konzistence (shoda dat se sebou a s pěti místy metriky) ----------- */
const k = spawnSync(process.execPath, [join("scripts", "dev", "test-konzistence.js")], { cwd: KOREN, encoding: "utf8", maxBuffer: 1 << 26 });
for (const radek of `${k.stdout}`.split(/\r?\n/)) {
  const m = radek.match(/^\s*(CHYBA|VAROVÁNÍ)\s+(.*)$/);
  if (m) nalezy.push({ bod: (m[2].match(/^\[?\w\]?\s*(\d{1,2}\.\d{1,2})\b/) || [])[1] || "web", pravidlo: "konzistence", zavaznost: m[1] === "CHYBA" ? "CHYBA" : "VAROVANI", nesestav: false, text: m[2].trim() });
}

/* --- výstup vrstvy D ------------------------------------------------------ */
const souhrn = { CHYBA: 0, VAROVANI: 0 };
const podlePravidla = {};
for (const n of nalezy) { souhrn[n.zavaznost]++; podlePravidla[n.pravidlo] = (podlePravidla[n.pravidlo] || 0) + 1; }
const zdroje = Object.values(stavZdroju);
const vysledekD = {
  vytvoreno: new Date().toISOString(),
  dnes, nastup,
  rejstrik: infoRejstriku,
  zdroje: BEZ_SITE ? null : {
    celkem: zdroje.length,
    citelne: zdroje.filter((z) => z.znaku > 200).length,
    mrtve: zdroje.filter((z) => z.status === 404 || z.status === 410).length,
    neoveritelne: zdroje.filter((z) => z.chyba || [401, 403, 429].includes(z.status) || z.status >= 500).length,
    seznam: zdroje,
  },
  souhrn, podle_pravidla: podlePravidla,
  citovane_predpisy: predpisyBodu,
  nalezy: nalezy.sort((a, b) => (a.zavaznost === b.zavaznost ? a.bod.localeCompare(b.bod, "cs", { numeric: true }) : a.zavaznost === "CHYBA" ? -1 : 1)),
};
writeFileSync(join(VYSTUP, "deterministicky.json"), JSON.stringify(vysledekD, null, 2));

console.log(`Kontrola faktů — vrstva D (deterministická), data k ${dnes}`);
console.log(`Rejstřík Sbírky: ${rejstrik ? `${infoRejstriku.predpisu} předpisů z let ${infoRejstriku.roky.join(", ")}` : `nenačten (${infoRejstriku.chyba})`}`);
if (vysledekD.zdroje) console.log(`Zdroje: ${vysledekD.zdroje.celkem} odkazů, ${vysledekD.zdroje.citelne} přečteno, ${vysledekD.zdroje.mrtve} mrtvých, ${vysledekD.zdroje.neoveritelne} neověřitelných odtud`);
console.log(`Nálezy: ${souhrn.CHYBA} CHYBA, ${souhrn.VAROVANI} VAROVÁNÍ — ${Object.entries(podlePravidla).map(([p, n]) => `${p} ${n}`).join(", ") || "žádné"}`);
for (const n of vysledekD.nalezy.filter((x) => x.zavaznost === "CHYBA")) console.log(`  CHYBA    ${n.bod.padEnd(5)} ${n.pravidlo}: ${n.text}`);
console.log(`Úplný výpis: ${join(VYSTUP, "deterministicky.json")}`);

/* --- vrstva M (model) ------------------------------------------------------ */
if (S_MODELEM) {
  const NAST = readSettings();
  const KLIC = process.env.ANTHROPIC_API_KEY;
  if (!KLIC) { console.error("--model potřebuje ANTHROPIC_API_KEY"); process.exit(1); }
  const MODEL = process.env.FAKTCHECK_MODEL || NAST.faktcheck_model;
  const EFFORT = process.env.EFFORT_KONTROLY || NAST.effort_kontroly;
  /* Pojistka platí na celý běh, ne na proces: s --zapsat-naklady (měsíční
     běh) už hodnocení část utratilo a zapsalo ji do public/naklady.json.
     Bez toho by hodnocení i kontrola smělo každé utratit celý strop. */
  const ZAPSAT_NAKLADY = process.argv.includes("--zapsat-naklady");
  const CESTA_NAKLADU = join(KOREN, "public", "naklady.json");
  const naklady = ZAPSAT_NAKLADY && existsSync(CESTA_NAKLADU) ? JSON.parse(readFileSync(CESTA_NAKLADU, "utf8")) : null;
  const behNakladu = naklady && (naklady.behy || []).at(-1);
  const dnesniBeh = behNakladu && String(behNakladu.datum).slice(0, 10) === new Date().toISOString().slice(0, 10) ? behNakladu : null;
  const uzUtraceno = dnesniBeh ? dnesniBeh.celkem_usd : 0;
  const POJISTKA = (Number(process.env.POJISTKA_CENY_USD) || NAST.pojistka_ceny_usd) - uzUtraceno;
  if (uzUtraceno) console.log(`Hodnocení už stálo ${uzUtraceno.toFixed(2)} $ — kontrole faktů zbývá do stropu ${POJISTKA.toFixed(2)} $`);
  nastavPojistku(Math.max(0.01, POJISTKA));
  let zastavenoPredem = false; // pojistka zastavila další část dávky podle odhadu
  await overModely([MODEL], KLIC);
  const WEBY = readList("weby-hodnoceni.txt");
  const SLIBY = Object.fromEntries(CHAPTERS.flatMap((c) => c.groups.flatMap((g) => g.items)).map((i) => [i.id, i.cs]));
  const vyber = arg("body", null) ? arg("body").split(",").map((x) => x.trim()).filter(Boolean) : Object.keys(evals);
  const nezname = vyber.filter((id) => !evals[id]);
  if (nezname.length) { console.error(`--body: neznámá id ${nezname.join(", ")}`); process.exit(1); }
  const metodika = nactiMetodiku();
  const zdrojeProBod = (id) => (evals[id].sources || []).map((s) => ({ url: s.url, text: textyZdroju.get(klicUrl(s.url)) })).filter((z) => z.text);
  const prompt = (id, kolo) => promptKontroly({ id, slib: SLIBY[id], e: evals[id], predpisy: predpisyBodu[id] || [], zdroje: zdrojeProBod(id), metodika, dnes, nastup, kolo });
  const textOdpovedi = (m) => (m.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const vysledky = {};
  console.log(`\nKontrola faktů — vrstva M: ${vyber.length} bodů, model ${MODEL} (effort ${EFFORT}), kolo 1 ${BEZ_DAVKY ? "přímo" : "přes Batch API"}`);

  // Kolo 1 — jen texty zdrojů, bez vyhledávání
  const parametry1 = (id) => teloPozadavku({ model: MODEL, maxTokens: 4000, effort: EFFORT, bezStreamu: !BEZ_DAVKY, messages: [{ role: "user", content: prompt(id, 1) }] });
  const zpracuj = (id, kolo, zprava, chyba) => {
    if (chyba) { vysledky[id] = { ...(vysledky[id] || {}), [`kolo${kolo}`]: { chyba } }; return; }
    try {
      const v = overCitace(parsujKontrolu(textOdpovedi(zprava)), textyZdroju);
      vysledky[id] = { ...(vysledky[id] || {}), [`kolo${kolo}`]: v, finalni: v };
    } catch (e) { vysledky[id] = { ...(vysledky[id] || {}), [`kolo${kolo}`]: { chyba: e.message.slice(0, 200) } }; }
  };
  if (BEZ_DAVKY) {
    for (const id of vyber) {
      try { zpracuj(id, 1, await zavolejApi(parametry1(id), { klic: KLIC, role: "faktcheck-1" })); }
      catch (e) { zpracuj(id, 1, null, e.message.slice(0, 200)); if (pojistkaZasahla()) break; }
    }
  } else {
    /* Kolo 1 přes Batch API ve dvou krocích. Pojistka ceny odeslanou dávku
       nezastaví a její cenu zná až po doběhnutí. Proto napřed malá zkušební
       dávka (DAVKA_PRVNI, výchozí 12 bodů) — z ní je skutečná cena za bod —
       a zbytek jednou dávkou, pokud se i s rezervou 1,5× vejde pod strop;
       jinak jen tolik bodů, kolik se vejde, a ostatní zůstanou nezkontrolované
       (vrstva R je podrží, nikdy je nepustí jako ověřené). Dvě čekání, ne
       jedno za každou část: v měření 20. 10. 2026 se čtyři dávky po sobě
       sčítaly na hodiny.
       Čísla odeslaných dávek se hned zapisují do <vystup>/davky.json. Kdyby
       běh skončil dřív, než dávka doběhne, výsledky jdou vyzvednout
       (--vyzvednout id,id) a nic se neplatí dvakrát — API je drží 29 dní. */
    const davky = [];
    const prevezmi = (vys, body) => {
      for (const id of body) {
        const r = vys.get(id.replace(".", "_"));
        if (!r) zpracuj(id, 1, null, "výsledek chybí");
        else if (!r.ok) zpracuj(id, 1, null, r.chyba);
        else zpracuj(id, 1, r.zprava);
      }
    };
    const pockej = async (id) => {
      let posledni = "";
      // Dávka obvykle doběhne do hodiny. Strop je pod limitem jobu, aby běh
      // skončil chybou s číslem dávky, ne zabitím.
      const hotova = await cekejNaDavku(id, {
        klic: KLIC, maxMs: Number(process.env.DAVKA_MAX_MIN || 180) * 60000,
        hlas: (c) => { const t = JSON.stringify(c); if (t !== posledni) { posledni = t; console.log(`  … ${t}`); } },
      });
      return vysledkyDavky(hotova, { klic: KLIC, role: "faktcheck-1" });
    };
    const posli = async (body, popis) => {
      const d = await odesliDavku(body.map((id) => ({ custom_id: id.replace(".", "_"), params: parametry1(id) })), { klic: KLIC, role: "faktcheck-1" });
      davky.push({ id: d.id, odeslano: new Date().toISOString(), body });
      writeFileSync(join(VYSTUP, "davky.json"), JSON.stringify(davky, null, 2));
      console.log(`  dávka ${popis} (${body.length} bodů) ${d.id} odeslána, čekám…`);
      prevezmi(await pockej(d.id), body);
      console.log(`  … hotovo, kontrola zatím stála ${souhrnNakladu().celkem_usd.toFixed(2)} $`);
    };
    if (VYZVEDNOUT.length) {
      // Z každé dávky jen její body; bod, který nebyl v žádné, je „výsledek chybí“.
      for (const id of VYZVEDNOUT) {
        console.log(`  vyzvedávám dávku ${id}`);
        const vys = await pockej(id);
        prevezmi(vys, vyber.filter((b) => vys.has(b.replace(".", "_"))));
      }
      // Body, které v žádné vyzvednuté dávce nebyly (běh skončil dřív, než je
      // odeslal), se pošlou novou dávkou — pod stejnou pojistkou, do které se
      // už započítala cena vyzvednutých dávek.
      const chybi = vyber.filter((id) => !vysledky[id]);
      if (chybi.length) {
        const utraceno = souhrnNakladu().celkem_usd;
        const hotovo = vyber.length - chybi.length;
        const naBod = hotovo && utraceno ? (utraceno / hotovo) * 1.5 : 0;
        const vejde = naBod > 0 ? Math.max(0, Math.floor((POJISTKA - utraceno) / naBod)) : chybi.length;
        const cast = chybi.slice(0, vejde);
        if (cast.length < chybi.length) {
          console.error(`POJISTKA CENY: do stropu ${POJISTKA} $ se vejde ${cast.length} z ${chybi.length} chybějících bodů — ostatní zůstávají nezkontrolované`);
          zastavenoPredem = true;
        }
        if (cast.length) await posli(cast, "doplnění");
        for (const id of chybi.slice(cast.length)) zpracuj(id, 1, null, "výsledek chybí");
      }
    } else {
      const prvni = Math.min(vyber.length, Math.max(1, Number(process.env.DAVKA_PRVNI) || 12));
      await posli(vyber.slice(0, prvni), vyber.length > prvni ? "1/2 (zkušební)" : "1/1");
      const zbytek = vyber.slice(prvni);
      if (zbytek.length) {
        const utraceno = souhrnNakladu().celkem_usd;
        const naBod = (utraceno / prvni) * 1.5;
        const vejde = naBod > 0 ? Math.max(0, Math.floor((POJISTKA - utraceno) / naBod)) : zbytek.length;
        const cast = zbytek.slice(0, vejde);
        if (cast.length < zbytek.length) {
          console.error(`POJISTKA CENY: zkušební dávka stála ${(utraceno / prvni).toFixed(3)} $ za bod; do stropu ${POJISTKA} $ se s rezervou vejde ${cast.length} z ${zbytek.length} zbylých bodů — ostatní zůstávají nezkontrolované`);
          zastavenoPredem = true;
        }
        if (cast.length) await posli(cast, "2/2");
      }
    }
  }

  // Kolo 2 — s vyhledáváním, jen kde tvrzení nesoucí stav zůstalo neověřené (nebo kolo 1 selhalo)
  const doKola2 = vyber.filter((id) => {
    const v = vysledky[id] && vysledky[id].kolo1;
    return !v || v.chyba || shrnutiBodu(id, evals[id], v).neovereno > 0 || !v.stav_podle_pravidel;
  });
  console.log(`  kolo 2 (s vyhledáváním): ${doKola2.length} bodů${BEZ_KOLA2 ? " — VYNECHÁNO (--bez-kola2)" : ""}`);
  /* Odpověď s vyhledáváním se nemusí vrátit hotová: pause_turn (server
     přerušil smyčku vyhledávání) se jen nechá dokončit, a na volání
     nástroje, který neexistuje (stalo se v hodnocení 20. 10. 2026), se
     odpoví chybou — jinak API pokračování odmítne. Obsah odpovědi zůstává
     beze změny (append-only kvůli bloků přemýšlení). */
  const kolo2 = async (id) => {
    const hledani = { maxUses: NAST.vyhledavani_overeni, domeny: WEBY };
    const messages = [{ role: "user", content: prompt(id, 2) }];
    let zprava;
    for (let pokus = 0; pokus < 3; pokus++) {
      zprava = await zavolejApi(teloPozadavku({ model: MODEL, maxTokens: 4000, effort: EFFORT, hledani, messages }), { klic: KLIC, role: "faktcheck-2" });
      const volani = (zprava.content || []).filter((b) => b.type === "tool_use");
      if (zprava.stop_reason !== "pause_turn" && !volani.length) break;
      messages.push({ role: "assistant", content: zprava.content || [] });
      if (volani.length) {
        messages.push({ role: "user", content: [
          ...volani.map((b) => ({ type: "tool_result", tool_use_id: b.id, is_error: true, content: "Tento nástroj není k dispozici." })),
          { type: "text", text: "Odpověz teď POUZE jedním JSON objektem podle zadání." },
        ] });
      }
    }
    return zprava;
  };
  for (const id of BEZ_KOLA2 || zastavenoPredem ? [] : doKola2) {
    if (pojistkaZasahla()) break;
    try {
      const zprava = await kolo2(id);
      // Citované stránky, které program ještě nemá, si stáhne (jen z povolených webů).
      let v = parsujKontrolu(textOdpovedi(zprava));
      for (const t of v.tvrzeni) {
        if (t.url && naWhitelistu(t.url) && !textyZdroju.has(klicUrl(t.url))) ulozText(await stahniZdroj(t.url));
      }
      v = overCitace(v, textyZdroju);
      vysledky[id] = { ...(vysledky[id] || {}), kolo2: v, finalni: v };
    } catch (e) {
      vysledky[id] = { ...(vysledky[id] || {}), kolo2: { chyba: e.message.slice(0, 200) } };
    }
  }

  // Souhrn: co je čisté, co vyvrácené, co neověřené, kde pravidla dávají jiný stav
  const body = {};
  for (const id of vyber) {
    const f = vysledky[id] && vysledky[id].finalni;
    body[id] = { ...vysledky[id], shrnuti: f ? shrnutiBodu(id, evals[id], f) : { bod: id, nezkontrolovano: true, cisty: false } };
  }
  const shrnuti = Object.values(body).map((b) => b.shrnuti);
  const cena = souhrnNakladu();
  const vysledekM = {
    vytvoreno: new Date().toISOString(), dnes, model: MODEL, effort: EFFORT, davka: !BEZ_DAVKY,
    kolo2: { bodu: doKola2.length, vynechano: BEZ_KOLA2, seznam: doKola2 },
    souhrn: {
      bodu: vyber.length,
      ciste: shrnuti.filter((s) => s.cisty).length,
      vyvraceno: shrnuti.filter((s) => s.vyvraceno > 0).map((s) => s.bod),
      spor_o_stav: shrnuti.filter((s) => s.spor_o_stav).map((s) => `${s.bod}: web ${s.stav_webu} → pravidla ${s.stav_podle_pravidel} (${s.pravidlo || "?"})`),
      neovereno: shrnuti.filter((s) => s.neovereno > 0).map((s) => s.bod),
      nezkontrolovano: shrnuti.filter((s) => s.nezkontrolovano).map((s) => s.bod),
      citaci_zahozeno: Object.values(body).reduce((n, b) => n + ((b.finalni && b.finalni.zahozeno) || 0), 0),
    },
    cena,
    body,
  };
  writeFileSync(join(VYSTUP, "modelova.json"), JSON.stringify(vysledekM, null, 2));
  // Cena kontroly k ceně běhu (veřejné, jako cena hodnocení).
  if (ZAPSAT_NAKLADY) {
    const zaznam = naklady || { behy: [] };
    const kontrola = { celkem_usd: cena.celkem_usd, podle_role: cena.podle_role, model: MODEL };
    if (dnesniBeh) { dnesniBeh.faktcheck = kontrola; dnesniBeh.celkem_s_kontrolou_usd = Math.round((dnesniBeh.celkem_usd + cena.celkem_usd) * 10000) / 10000; }
    else (zaznam.behy = zaznam.behy || []).push({ datum: new Date().toISOString(), rezim: "faktcheck", celkem_usd: 0, faktcheck: kontrola, celkem_s_kontrolou_usd: cena.celkem_usd });
    writeFileSync(CESTA_NAKLADU, JSON.stringify(zaznam, null, 2));
  }
  const s = vysledekM.souhrn;
  console.log(`Vrstva M: ${s.ciste}/${s.bodu} čistých; vyvráceno ${s.vyvraceno.length}, spor o stav ${s.spor_o_stav.length}, neověřeno ${s.neovereno.length}, nezkontrolováno ${s.nezkontrolovano.length}; zahozených citací ${s.citaci_zahozeno}`);
  for (const x of s.spor_o_stav) console.log(`  spor     ${x}`);
  if (s.vyvraceno.length) console.log(`  vyvráceno: ${s.vyvraceno.join(", ")}`);
  console.log(`Cena vrstvy M: ${cena.celkem_usd.toFixed(2)} $ (${Object.entries(cena.podle_role).map(([r, x]) => `${r} ${x.usd.toFixed(2)} $`).join(", ")})`);
  console.log(`Úplný výpis: ${join(VYSTUP, "modelova.json")}`);
  if (pojistkaZasahla() || zastavenoPredem) { console.error("POJISTKA CENY ZASÁHLA — kontrola nedoběhla"); process.exitCode = 3; }
}
