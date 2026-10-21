/* scripts/lib/report.js — report běhu pro vlastníka (spec 005).
 *
 * Z výstupů běhu (rozhodnutí vrstvy R, nálezy vrstev D a M, data před a po,
 * cena) složí podklady a z nich tři podoby: HTML oddíly pro PDF (šablona
 * scripts/nastaveni/report-behu.html), pro-AI.md (k nahrání do aplikace
 * Claude) a popis PR. Nic se tu znovu nepočítá ani neplatí, jen čte.
 *
 * Vlastník z reportu rozhoduje na telefonu, proto: verdikt nahoře, u každého
 * bodu k rozhodnutí dosavadní a navržený záznam vedle sebe, důvod, citace
 * ze zdroje a hotový příkaz k opsání. Žádné JSON, žádné kódy bez vysvětlení.
 *
 * Soukromí: report nikdy nečte adresu příjemce (REPORT_EMAIL_TO); ta jde
 * jen do lib/email.js při odeslání.
 */

import { odkazRozhodnuti } from "./navrhy.js";

/* Barvy legendy webu, světlý motiv (src/App.jsx, :root). Report se tiskne
   na bílý papír, tmavý motiv by v PDF působil jako jiný web. */
export const BARVY = { fulfilled: "#047857", partial: "#4D7C0F", in_progress: "#B45309", declared: "#64748B", not_started: "#5B6577", broken: "#DC2626", unverifiable: "#94A0B2" };
export const NAZVY = { fulfilled: "splněno", partial: "částečně splněno", in_progress: "probíhá", declared: "jen deklarováno", not_started: "nezahájeno", broken: "porušeno", unverifiable: "neměřitelné" };
const PORADI = ["fulfilled", "partial", "in_progress", "declared", "not_started", "broken", "unverifiable"];

/* Hlavní metrika: totéž pravidlo jako pět míst v CLAUDE.md (fulfilled / rated,
   neměřitelné mimo jmenovatel). Report není veřejný, ale musí ukázat totéž
   číslo jako web, jinak by vlastník schvaloval něco jiného, než vidí. */
const HODNOCENE = new Set(["fulfilled", "partial", "in_progress", "declared", "not_started", "broken", "stalled"]);
export function metrika(evals, polozky) {
  let splneno = 0, hodnoceno = 0;
  const stavy = Object.fromEntries(PORADI.map((s) => [s, 0]));
  for (const it of polozky) {
    const e = evals[it.id];
    if (!e) continue;
    stavy[e.unverifiable ? "unverifiable" : e.status === "stalled" ? "broken" : e.status] += 1;
    if (!HODNOCENE.has(e.status) || e.unverifiable) continue;
    hodnoceno++;
    if (e.status === "fulfilled") splneno++;
  }
  return { splneno, hodnoceno, procent: hodnoceno ? (splneno / hodnoceno) * 100 : 0, stavy };
}

const stav = (e) => (e ? (e.unverifiable ? "unverifiable" : e.status) : null);
/** Co znamenají kódy problémů z vrstvy R — česky, pro člověka. */
export const PROBLEMY = {
  "m-nezkontrolovano": "kontrola faktů bod nezkontrolovala (technická chyba nebo pojistka ceny)",
  "m-vyvraceno": "zdroj tvrzení, na kterém stojí stav, vyvrací",
  "m-neovereno": "tvrzení, na kterém stojí stav, nejde ze zdrojů ověřit",
  "m-spor": "podle tvých pravidel (metodika.md) fakta zakládají jiný stav",
  "m-kolo2-strop": "dohledání vyhledáváním (kolo 2) se nevešlo do měsíčního stropu",
  "m-neovereno-absence": "změna stavu stojí na tvrzení, že něco nenastalo, a to citací doložit nejde",
  "prechod-bez-noveho-dokladu": "změna stavu na tomtéž dokladu — není to nová událost, ale oprava",
  "prechod-bez-potvrzene-udalosti": "změna stavu, jejíž událost kontrola faktů nepotvrdila",
  kalibrace: "kalibrace: každou změnu stavu schvaluješ ty",
};
export const popisProblemu = (p) => (p.startsWith("d:") ? `program našel chybu proti primárnímu záznamu (${p.slice(2)})` : PROBLEMY[p] || p);
const TYPY = {
  podrzeno: "Podrženo — na webu zůstal minulý záznam",
  kalibrace: "Kalibrace — změna čeká na tvoje schválení",
  "oprava-bez-udalosti": "Oprava bez události — rozhodni, jestli platí",
  spor: "Spor o stav — kontrola navrhuje jiný stav",
  "uz-zverejneno": "Chyba už na webu — podržení nepomůže",
  nezkontrolovano: "Nezkontrolováno",
  "novy-bod-s-nalezem": "Nový bod s nálezem",
};
/** Musí vlastník k přijetí uvést důvod? Ano, když je tvrzení vyvrácené nebo proti primárnímu záznamu. */
const chceDuvod = (problemy) => problemy.some((p) => p === "m-vyvraceno" || p.startsWith("d:"));

/**
 * Podklady reportu.
 * @param pred, po      evaluations.json (celé objekty) před během a po rozhodnutí vrstvy R
 * @param rozhodnuti    faktcheck-vystup/rozhodnuti.json
 * @param D, M          deterministicky.json, modelova.json (M smí chybět)
 * @param naklady       public/naklady.json (smí chybět)
 * @param polozky       ALL_ITEMS ze src/data.js
 * @param modely        { hodnoceni, overeni, korektura, kontrola }
 */
export function podkladyReportu({ pred, po, rozhodnuti, D = null, M = null, naklady = null, polozky, modely = {} }) {
  const slib = Object.fromEntries(polozky.map((i) => [i.id, i.cs]));
  const nalezyBodu = {};
  for (const n of (D && D.nalezy) || []) (nalezyBodu[n.bod] = nalezyBodu[n.bod] || []).push(n);
  const tvrzeniBodu = (id) => (M && M.body && M.body[id] && M.body[id].finalni && M.body[id].finalni.tvrzeni) || [];
  const body = rozhodnuti.body || {};
  const beh = rozhodnuti.beh;

  const kRozhodnuti = Object.values(body).filter((b) => b.vlastnik).map((b) => {
    const navrh = b.vlastnik.navrh && b.vlastnik.navrh.zdroj === "hodnotitel" ? b.vlastnik.navrh.zaznam : null;
    const kontrola = b.vlastnik.kontrola || (b.vlastnik.navrh && b.vlastnik.navrh.zdroj === "kontrola" ? b.vlastnik.navrh : null);
    const sporna = tvrzeniBodu(b.bod).filter((t) => t.nese_stav && t.verdikt !== "POTVRZENO");
    return {
      bod: b.bod, slib: slib[b.bod] || "", typ: b.vlastnik.typ, popisTypu: TYPY[b.vlastnik.typ] || b.vlastnik.typ,
      akce: b.akce, problemy: b.problemy.map(popisProblemu), prechod: b.prechod,
      dosavadni: (pred.evals || {})[b.bod] || null, navrh, kontrola,
      brana: b.vlastnik.navrh && b.vlastnik.navrh.brana ? b.vlastnik.navrh.brana : null,
      tvrzeni: sporna, nalezyD: (nalezyBodu[b.bod] || []).filter((n) => n.zavaznost === "CHYBA" || n.nesestav),
      prikaz: navrh ? `/prijmout ${b.bod}${chceDuvod(b.problemy) ? " duvod: …" : ""}` : null,
    };
  });
  // Nezkontrolované body bez jiného nálezu se v reportu shrnou jedním řádkem.
  const jenNezkontrolovane = kRozhodnuti.filter((k) => k.typ === "nezkontrolovano");
  const kRozhodnutiVypis = kRozhodnuti.filter((k) => k.typ !== "nezkontrolovano");

  const zmeny = Object.values(body).filter((b) => b.akce === "zverejnit" && b.prechod).map((b) => {
    const e = po.evals[b.bod];
    return {
      bod: b.bod, slib: slib[b.bod] || "", z: b.prechod.z, na: b.prechod.na,
      doklad: e.evidence || "", datum: e.evidenceDate || "",
      predpisy: (e.sbirka && e.sbirka.overene) || [],
      citace: tvrzeniBodu(b.bod).filter((t) => t.nese_stav && t.verdikt === "POTVRZENO" && t.overeno),
    };
  });

  // Ostatní nálezy: varování u bodů, které nejsou k rozhodnutí (tam už jsou), a nálezy webu jako celku.
  const webNalezy = ((D && D.nalezy) || []).filter((n) => n.bod === "web" || (n.zavaznost === "VAROVANI" && !(body[n.bod] && body[n.bod].vlastnik)));
  // public/naklady.json: poslední záznam je tento běh (zapsal ho evaluate.js).
  const behNakladu = naklady && (naklady.behy || []).at(-1);
  const cenaHodnoceni = behNakladu && typeof behNakladu.celkem_usd === "number" ? behNakladu.celkem_usd : null;
  const cenaKontroly = M && M.cena ? M.cena.celkem_usd : null;
  const k = kRozhodnutiVypis.length;
  return {
    beh, mesic: beh ? `${Number(beh.slice(5, 7))}/${beh.slice(0, 4)}` : "",
    kalibrace: Boolean(rozhodnuti.kalibrace), vrstvaM: Boolean(M),
    verdikt: k ? `zveřejněno, ${k} ${k === 1 ? "bod" : k < 5 ? "body" : "bodů"} k rozhodnutí` : "zveřejněno, nic k rozhodnutí",
    souhrn: rozhodnuti.souhrn,
    metrikaPred: metrika(pred.evals || {}, polozky), metrikaPo: metrika(po.evals || {}, polozky),
    cena: { hodnoceni: cenaHodnoceni, kontrola: cenaKontroly, celkem: (cenaHodnoceni || 0) + (cenaKontroly || 0) },
    modely,
    kRozhodnuti: kRozhodnutiVypis, nezkontrolovane: jenNezkontrolovane.map((x) => x.bod),
    zmeny,
    ostatni: webNalezy.map((n) => ({ bod: n.bod, pravidlo: n.pravidlo, text: n.text })),
    zdroje: D && D.zdroje ? { celkem: D.zdroje.celkem, citelne: D.zdroje.citelne, mrtve: D.zdroje.mrtve } : null,
    rejstrik: D && D.rejstrik ? (D.rejstrik.chyba ? `nenačten (${D.rejstrik.chyba})` : `${D.rejstrik.predpisu} předpisů`) : null,
  };
}

/* --- HTML ------------------------------------------------------------------ */
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stitek = (s) => `<span class="stav" style="background:${BARVY[s] || "#64748B"}">${esc(NAZVY[s] || s)}</span>`;
const zkrat = (s, n) => (String(s || "").length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ""));
const pct = (x) => `${x.toFixed(1).replace(".", ",")} %`;
const usd = (x) => (x === null || x === undefined ? "—" : `${x.toFixed(2).replace(".", ",")} $`);

/** Rozdíl po slovech (LCS) — co v návrhu přibylo a co zmizelo. Texty jsou krátké (komentář, doklad). */
export function rozdilSlov(a, b) {
  const x = String(a || "").split(/(\s+)/), y = String(b || "").split(/(\s+)/);
  if (x.length * y.length > 400000) return { a: esc(a), b: esc(b) }; // pojistka pro dlouhé texty
  const L = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, oa = "", ob = "";
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { oa += esc(x[i]); ob += esc(y[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { oa += /\S/.test(x[i]) ? `<del>${esc(x[i])}</del>` : esc(x[i]); i++; }
    else { ob += /\S/.test(y[j]) ? `<ins>${esc(y[j])}</ins>` : esc(y[j]); j++; }
  }
  for (; i < x.length; i++) oa += /\S/.test(x[i]) ? `<del>${esc(x[i])}</del>` : esc(x[i]);
  for (; j < y.length; j++) ob += /\S/.test(y[j]) ? `<ins>${esc(y[j])}</ins>` : esc(y[j]);
  return { a: oa, b: ob };
}

const zaznamHtml = (e, rozdil) => !e ? "<p class=\"slabe\">—</p>" : `
  <p>${stitek(stav(e))}${e.evidenceDate ? ` <span class="slabe">doklad z ${esc(e.evidenceDate)}</span>` : ""}</p>
  ${e.evidence ? `<p class="doklad"><b>Doklad:</b> ${rozdil ? rozdil.doklad : esc(e.evidence)}</p>` : ""}
  <p>${rozdil ? rozdil.komentar : esc(e.comment && e.comment.cs)}</p>`;

const tvrzeniHtml = (t) => `<li><b>${esc(t.verdikt)}</b> ${esc(t.text)}${t.citace ? `<blockquote>„${esc(zkrat(t.citace, 400))}“${t.url ? ` <a href="${esc(t.url)}">zdroj</a>` : ""}</blockquote>` : ""}${t.duvod_zahozeni ? ` <span class="slabe">(model tvrdil ${esc(t.puvodni_verdikt)}, ale citaci program ve zdroji nenašel)</span>` : ""}</li>`;

/** Odkazy na rozhodnutí jedním klepnutím (lib/navrhy.js). Bez větve PR žádné. */
export function odkazyBodu(k, { repo, vetev }) {
  if (!repo || !vetev || !k.prikaz) return null;
  return {
    prijmout: odkazRozhodnuti(repo, vetev, k.prikaz.replace(" duvod: …", " duvod: ")),
    podrzet: odkazRozhodnuti(repo, vetev, `/podrzet ${k.bod}`),
    sDuvodem: k.prikaz.includes("duvod:"),
  };
}

/** HTML oddíly pro šablonu report-behu.html. */
export function htmlOddily(p, { odkazPR = null, odkazWeb = "https://vladomer.cz", repo = null, vetev = null } = {}) {
  const mp = p.metrikaPred, mn = p.metrikaPo;
  const pruh = (m) => `<div class="pruh">${PORADI.filter((s) => m.stavy[s]).map((s) => `<span style="flex:${m.stavy[s]};background:${BARVY[s]}" title="${esc(NAZVY[s])}: ${m.stavy[s]}"></span>`).join("")}</div>`;
  const legenda = PORADI.filter((s) => mn.stavy[s] || mp.stavy[s]).map((s) => `<span><i style="background:${BARVY[s]}"></i>${esc(NAZVY[s])} ${mp.stavy[s]} → ${mn.stavy[s]}</span>`).join("");

  const SOUHRN = `
  <section class="karta">
    <div class="cisla">
      <div><b>${pct(mp.procent)} → ${pct(mn.procent)}</b><span>splněno (${mp.splneno}/${mp.hodnoceno} → ${mn.splneno}/${mn.hodnoceno})</span></div>
      <div><b>${p.souhrn.zverejneno}/${p.souhrn.bodu}</b><span>bodů zveřejněno ověřených</span></div>
      <div><b>${usd(p.cena.celkem)}</b><span>cena běhu (hodnocení ${usd(p.cena.hodnoceni)}, kontrola ${usd(p.cena.kontrola)})</span></div>
    </div>
    <p class="slabe">před během</p>${pruh(mp)}<p class="slabe">po běhu</p>${pruh(mn)}
    <p class="legenda">${legenda}</p>
    <p class="slabe">Modely: hodnocení ${esc(p.modely.hodnoceni || "—")}, ověření ${esc(p.modely.overeni || "—")}, korektura ${esc(p.modely.korektura || "—")}, kontrola faktů ${esc(p.modely.kontrola || "—")}.
    ${p.rejstrik ? `Rejstřík Sbírky: ${esc(p.rejstrik)}.` : ""} ${p.zdroje ? `Zdroje: ${p.zdroje.citelne}/${p.zdroje.celkem} přečteno, ${p.zdroje.mrtve} mrtvých.` : ""}</p>
    ${!p.vrstvaM ? "<p class=\"pozor\">Kontrola faktů modelem neběžela — nic se nepustilo jako ověřené.</p>" : ""}
    ${p.kalibrace ? "<p class=\"pozor\">Kalibrace: každá změna stavu čeká na tvoje schválení, i když ji kontrola potvrdila.</p>" : ""}
  </section>`;

  const K_ROZHODNUTI = !p.kRozhodnuti.length ? "<p>Nic. Všechno, co běh napsal, kontrola faktů potvrdila.</p>" : p.kRozhodnuti.map((k) => {
    const rozdil = k.navrh && k.dosavadni ? (() => {
      const d = rozdilSlov(k.dosavadni.evidence, k.navrh.evidence), c = rozdilSlov(k.dosavadni.comment && k.dosavadni.comment.cs, k.navrh.comment && k.navrh.comment.cs);
      return { pred: { doklad: d.a, komentar: c.a }, po: { doklad: d.b, komentar: c.b } };
    })() : null;
    return `
  <section class="karta bod" id="bod-${esc(k.bod)}">
    <h3>${esc(k.bod)} <span class="slabe">${esc(zkrat(k.slib, 160))}</span></h3>
    <p class="typ">${esc(k.popisTypu)}</p>
    <ul class="duvody">${k.problemy.map((x) => `<li>${esc(x)}</li>`).join("")}${k.brana ? `<li>brána přechodů návrh podržela: ${esc(k.brana.duvod)}</li>` : ""}</ul>
    <div class="vedle">
      <div><h4>Na webu</h4>${zaznamHtml(k.dosavadni, rozdil && rozdil.pred)}</div>
      <div><h4>${k.navrh ? "Návrh hodnotitele" : "Návrh"}</h4>${k.navrh ? zaznamHtml(k.navrh, rozdil && rozdil.po) : "<p class=\"slabe\">Hodnotitel nic jiného nenavrhl.</p>"}</div>
    </div>
    ${!k.kontrola ? "" : k.navrh && k.kontrola.stav === stav(k.navrh)
      ? `<p><b>Kontrola faktů:</b> stav podle tvých pravidel sedí s návrhem${k.kontrola.zduvodneni ? ` — ${esc(k.kontrola.zduvodneni)}` : ""}</p>`
      : `<p><b>Kontrola faktů navrhuje</b> ${stitek(k.kontrola.stav)}${k.kontrola.pravidlo ? ` podle pravidla ${esc(k.kontrola.pravidlo)}` : ""}${k.kontrola.zduvodneni ? `: ${esc(k.kontrola.zduvodneni)}` : ""}</p>`}
    ${k.nalezyD.length ? `<p><b>Program:</b></p><ul>${k.nalezyD.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>` : ""}
    ${k.tvrzeni.length ? `<p><b>Tvrzení, která neprošla:</b></p><ul class="tvrzeni">${k.tvrzeni.map(tvrzeniHtml).join("")}</ul>` : ""}
    ${(() => {
      const o = odkazyBodu(k, { repo, vetev });
      if (o) return `<p class="prikaz"><a href="${esc(o.prijmout)}"><b>Přijmout</b></a>${o.sDuvodem ? " (napiš důvod)" : ""} · <a href="${esc(o.podrzet)}">Nechat</a></p>`;
      return k.prikaz ? `<p class="prikaz">Přijmout: <code>${esc(k.prikaz)}</code> · nechat: <code>/podrzet ${esc(k.bod)}</code></p>` : "<p class=\"slabe\">Bez navrženého záznamu: zůstává, jak byl, a příští běh ho posoudí znovu.</p>";
    })()}
  </section>`;
  }).join("") + (p.nezkontrolovane.length ? `<p class="slabe">Nezkontrolováno (zůstaly bez razítka „prověřeno“): ${esc(p.nezkontrolovane.join(", "))}</p>` : "");

  const ZMENY = !p.zmeny.length ? "<p>Žádný bod nezměnil stav.</p>" : p.zmeny.map((z) => `
  <section class="karta">
    <h3>${esc(z.bod)} <span class="slabe">${esc(zkrat(z.slib, 160))}</span></h3>
    <p>${stitek(z.z)} → ${stitek(z.na)}${z.datum ? ` <span class="slabe">doklad z ${esc(z.datum)}</span>` : ""}</p>
    ${z.doklad ? `<p class="doklad">${esc(z.doklad)}</p>` : ""}
    ${z.predpisy.length ? `<p>${z.predpisy.map((x) => `<a href="${esc(x.url)}">${esc(x.kod)} Sb.</a> ${esc(x.nazev)} (vyhlášeno ${esc(x.vyhlaseno)})`).join("<br>")}</p>` : ""}
    ${z.citace.length ? `<ul class="tvrzeni">${z.citace.map(tvrzeniHtml).join("")}</ul>` : ""}
  </section>`).join("");

  const OSTATNI = !p.ostatni.length ? "<p>Nic dalšího.</p>" : `<ul>${p.ostatni.map((n) => `<li><b>${esc(n.bod)}</b> ${esc(n.text)}</li>`).join("")}</ul>`;
  const zverejnit = repo && vetev ? odkazRozhodnuti(repo, vetev, "/zverejnit") : null;
  const JAK_ROZHODNOUT = `
  <ul>
    ${zverejnit ? `<li><b>U každého bodu klepni na Přijmout, nebo Nechat</b> — GitHub otevře předvyplněný soubor s rozhodnutím, stačí ho potvrdit (Commit changes). Nakonec <a href="${esc(zverejnit)}"><b>Zveřejnit</b></a>: PR se sloučí a web se nasadí. Bod, o kterém nerozhodneš, se zveřejní podle výchozího návrhu (vyvrácené ne).</li>` : ""}
    <li><b>Přijmout všechny návrhy:</b> v PR zmáčkni Merge${odkazPR ? ` (<a href="${esc(odkazPR)}">otevřít PR</a>)` : ""}.</li>
    <li><b>Nepřijmout nic:</b> PR zavři (Close). Body zůstanou na minulém záznamu.</li>
    <li><b>Po bodech:</b> komentář v PR, třeba <code>/prijmout 10.2</code> nebo <code>/podrzet 10.2</code>. U vyvráceného tvrzení napiš důvod: <code>/prijmout 10.2 duvod: …</code> — zapíše se do auditu.</li>
    <li>Web: <a href="${esc(odkazWeb)}">${esc(odkazWeb.replace(/^https?:\/\//, ""))}</a></li>
  </ul>`;
  return { SOUHRN, K_ROZHODNUTI, ZMENY, OSTATNI, JAK_ROZHODNOUT };
}

/* --- pro-AI.md --------------------------------------------------------------- */
const zaznamMd = (e) => !e ? "—" : [
  `stav: ${NAZVY[stav(e)] || stav(e)}${e.evidenceDate ? `, doklad z ${e.evidenceDate}` : ""}`,
  e.evidence ? `doklad: ${e.evidence}` : null,
  `komentář: ${(e.comment && e.comment.cs) || "—"}`,
].filter(Boolean).map((r) => `  - ${r}`).join("\n");

/** Textový balík pro aplikaci Claude: kontext, pravidla vlastníka, všechny nálezy, dotaz. */
export function proAI(p, { metodika }) {
  const r = [];
  r.push(`# Vládoměr — kontrola běhu ${p.mesic} (podklad pro AI)`, "");
  r.push("Vládoměr (vladomer.cz) sleduje, jak vláda plní 143 bodů programového prohlášení. Jednou měsíčně je jazykový model přehodnotí, program výsledek zkontroluje proti primárním záznamům (e-Sbírka) a nezávislý model ověří každé tvrzení, na kterém stojí stav, doslovnou citací ze zdroje. Co kontrola nepotvrdila, nešlo na web a čeká na rozhodnutí vlastníka. Pomoz mu rozhodnout.", "");
  r.push(`Výsledek: ${p.verdikt}. Splněno ${pct(p.metrikaPred.procent)} → ${pct(p.metrikaPo.procent)}. Cena běhu ${usd(p.cena.celkem)}.`, "");
  r.push("## Pravidla vlastníka (podle nich se rozhoduje)", "", metodika.trim(), "");
  r.push("## Body k rozhodnutí", "");
  if (!p.kRozhodnuti.length) r.push("Žádné.", "");
  for (const k of p.kRozhodnuti) {
    r.push(`### ${k.bod} — ${k.slib}`, "", `Druh: ${k.popisTypu}`, "", "Proč:", ...k.problemy.map((x) => `- ${x}`));
    if (k.brana) r.push(`- brána přechodů návrh podržela: ${k.brana.duvod}`);
    r.push("", "Na webu:", zaznamMd(k.dosavadni), "", "Návrh hodnotitele:", k.navrh ? zaznamMd(k.navrh) : "  - nic jiného nenavrhl");
    if (k.kontrola) r.push("", `Kontrola faktů: stav podle pravidel ${NAZVY[k.kontrola.stav] || k.kontrola.stav}${k.kontrola.pravidlo ? ` (pravidlo ${k.kontrola.pravidlo})` : ""}${k.navrh && k.kontrola.stav === stav(k.navrh) ? ", sedí s návrhem" : ""}. ${k.kontrola.zduvodneni || ""}`.trim());
    for (const n of k.nalezyD) r.push("", `Program: ${n.text}`);
    if (k.tvrzeni.length) {
      r.push("", "Tvrzení, která neprošla:");
      for (const t of k.tvrzeni) r.push(`- [${t.verdikt}] ${t.text}${t.citace ? ` — citace: „${zkrat(t.citace, 400)}“ (${t.url})` : ""}${t.duvod_zahozeni ? ` — model tvrdil ${t.puvodni_verdikt}, citaci program ve zdroji nenašel` : ""}`);
    }
    r.push("", `Příkaz k přijetí: ${k.prikaz ? `\`${k.prikaz}\`` : "žádný (bez navrženého záznamu)"}`, "");
  }
  if (p.nezkontrolovane.length) r.push(`Nezkontrolované body (bez razítka „prověřeno“): ${p.nezkontrolovane.join(", ")}`, "");
  r.push("## Změny zveřejněné na webu", "");
  if (!p.zmeny.length) r.push("Žádné.", "");
  for (const z of p.zmeny) {
    r.push(`- ${z.bod}: ${NAZVY[z.z]} → ${NAZVY[z.na]}. Doklad (${z.datum || "bez data"}): ${z.doklad}`);
    for (const x of z.predpisy) r.push(`  - ${x.kod} Sb. ${x.nazev}, vyhlášeno ${x.vyhlaseno} (${x.url})`);
    for (const t of z.citace) r.push(`  - ověřeno: „${zkrat(t.citace, 300)}“ (${t.url})`);
  }
  r.push("", "## Ostatní nálezy", "", ...(p.ostatni.length ? p.ostatni.map((n) => `- ${n.bod}: ${n.text}`) : ["Žádné."]), "");
  r.push("## Dotaz", "", "Pro každý bod v oddílu „Body k rozhodnutí“ doporuč jedno: **přijmout** návrh, **podržet** dosavadní záznam, nebo **opravit** (pak napiš, jak má záznam znít). Rozhoduj podle pravidel vlastníka výše a jen podle faktů, které jsou tu doložené citací; co doložené není, tak označ. U každého bodu jednou větou zdůvodni.", "");
  return r.join("\n");
}

/* --- popis PR ------------------------------------------------------------------ */
export function popisPR(p) {
  const r = [`**Vládoměr ${p.mesic}: ${p.verdikt}.** Splněno ${pct(p.metrikaPred.procent)} → ${pct(p.metrikaPo.procent)}, cena ${usd(p.cena.celkem)}.`, ""];
  r.push("Merge = přijmout všechny navržené záznamy. Close = nechat body na minulém záznamu. Po bodech komentářem `/prijmout <bod>` nebo `/podrzet <bod>`; u vyvráceného tvrzení `/prijmout <bod> duvod: …`.", "");
  if (p.kRozhodnuti.length) {
    r.push("| bod | co | na webu | návrh | příkaz |", "|---|---|---|---|---|");
    for (const k of p.kRozhodnuti) {
      r.push(`| ${k.bod} | ${k.popisTypu} | ${NAZVY[stav(k.dosavadni)] || "—"} | ${k.navrh ? NAZVY[stav(k.navrh)] : k.kontrola ? `kontrola: ${NAZVY[k.kontrola.stav]}` : "—"} | ${k.prikaz ? `\`${k.prikaz}\`` : "ručně"} |`);
    }
    r.push("");
  }
  r.push("Podrobnosti s citacemi jsou v PDF v e-mailu a v artefaktu běhu.");
  return r.join("\n");
}
