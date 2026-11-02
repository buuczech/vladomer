/* scripts/lib/srovnani.js — srovnání generálky DEV2 se současným main.
 *
 * Vlastník (23. 10. 2026): DEV2 se na main sloučí až po dvou generálkách
 * celého měsíčního běhu, z nichž každá se srovná s tím, co ve stejné době
 * ukazuje main (týdenní běh s Haiku). Srovnává se:
 *   - hlavní metrika a rozložení stavů,
 *   - shoda se zlatou a kontrolní sadou (pravda, kterou vlastník ověřil
 *     z primárních záznamů) — jediné měřítko „kdo má pravdu“,
 *   - seznam bodů, ve kterých se stav liší.
 * Pravda v sadách platí k datu „datum_pravdy“; u bodů, kde se mezitím
 * něco stalo, může být zastaralá — srovnání to uvádí.
 *
 * DEV2 má dva sloupce. „Web“ je to, co běh pustil ven: bez rozhodnutí
 * vlastníka zůstává nepřijatý bod na minulém záznamu, takže web DEV2 se
 * hned po běhu od main skoro neliší (generálka 2. 11. 2026: 2 body ze 143).
 * „Návrh“ je web s každým návrhem hodnotitele, který šel k vlastníkovi,
 * jako by ho přijal — teprve to srovnává oba hodnotitele.
 * Volá ho scripts/report.js --srovnani-main (e-mail generálky) a ručně
 * scripts/dev/srovnani-s-main.js.
 */
import { readFileSync } from "node:fs";
import { metrika, NAZVY, esc } from "./report.js";

const stav = (e) => (e ? (e.unverifiable ? "unverifiable" : e.status === "stalled" ? "broken" : e.status) : null);
const pravda = (b) => (b.unverifiable ? "unverifiable" : b.stav);
const pct = (x) => `${x.toFixed(1).replace(".", ",")} %`;
const den = (d) => String(d || "?").slice(0, 10);

/* Zlatá a kontrolní sada (scripts/dev/fixtury/). */
export function nactiSady() {
  return [["zlatá sada", "zlata-sada"], ["kontrolní sada", "kontrolni-sada"]].map(([nazev, f]) => ({
    nazev,
    body: JSON.parse(readFileSync(new URL(`../dev/fixtury/${f}.json`, import.meta.url), "utf8")).body,
  }));
}

/* Návrhy hodnotitele, o kterých rozhoduje vlastník (rozhodnuti.json z rozhodni.js). */
export function navrhyZRozhodnuti(rozhodnuti) {
  const out = {};
  for (const [id, b] of Object.entries((rozhodnuti && rozhodnuti.body) || {})) {
    const z = b.vlastnik && b.vlastnik.navrh && b.vlastnik.navrh.zaznam;
    if (z) out[id] = z;
  }
  return out;
}

/**
 * @param dev2, main  evaluations.json (celý objekt s .evals a .lastUpdated)
 * @param polozky     [{ id, cs }] všech bodů
 * @param sady        [{ nazev, body: [{ id, stav, unverifiable, datum_pravdy }] }]
 * @param navrhy      { id → záznam } návrhů hodnotitele k rozhodnutí (navrhyZRozhodnuti)
 * @returns { md, html, text, souhrn }
 */
export function srovnani({ dev2, main, polozky, sady = [], navrhy = {} }) {
  const d = dev2.evals || {}, m = main.evals || {};
  const n = { ...d, ...navrhy };
  const mm = metrika(m, polozky), md = metrika(d, polozky), mn = metrika(n, polozky);
  const pocetNavrhu = Object.keys(navrhy).length;
  const r = [
    `# Srovnání generálky DEV2 s main`,
    "",
    `DEV2 (měsíční běh): data k ${den(dev2.lastUpdated)}. Main (týdenní běh, teď na webu): data k ${den(main.lastUpdated)}.`,
    "",
    `„DEV2 web“ je to, co běh pustil ven — nepřijatý bod zůstává na minulém záznamu. „DEV2 návrh“ je totéž s ${pocetNavrhu} návrhy hodnotitele, které šly k rozhodnutí, jako by je vlastník přijal.`,
    "",
    "| | main | DEV2 web | DEV2 návrh |",
    "|---|---|---|---|",
    `| splněno (přísná metrika) | ${pct(mm.procent)} (${mm.splneno}/${mm.hodnoceno}) | ${pct(md.procent)} (${md.splneno}/${md.hodnoceno}) | ${pct(mn.procent)} (${mn.splneno}/${mn.hodnoceno}) |`,
    ...Object.keys(NAZVY).map((s) => `| ${NAZVY[s]} | ${mm.stavy[s] || 0} | ${md.stavy[s] || 0} | ${mn.stavy[s] || 0} |`),
  ];
  const souhrn = {
    main: { data: den(main.lastUpdated), procent: mm.procent },
    dev2: { data: den(dev2.lastUpdated), procent: md.procent },
    navrh: { procent: mn.procent, navrhu: pocetNavrhu },
    sady: {}, lisi: 0, pravdu: { navrh: 0, main: 0, nikdo: 0 },
  };
  if (sady.length) {
    r.push("", "## Shoda s pravdou (zlatá a kontrolní sada)", "", "| sada | main | DEV2 web | DEV2 návrh |", "|---|---|---|---|");
    for (const sada of sady) {
      let sm = 0, sd = 0, sn = 0;
      for (const b of sada.body) {
        if (stav(m[b.id]) === pravda(b)) sm++;
        if (stav(d[b.id]) === pravda(b)) sd++;
        if (stav(n[b.id]) === pravda(b)) sn++;
      }
      souhrn.sady[sada.nazev] = { main: sm, dev2: sd, navrh: sn, bodu: sada.body.length };
      r.push(`| ${sada.nazev} (${sada.body.length}) | ${sm} | ${sd} | ${sn} |`);
    }
    const datumy = [...new Set(sady.flatMap((s) => s.body.map((b) => b.datum_pravdy)).filter(Boolean))].sort();
    r.push("", `Pravda platí k ${datumy.join(", ")}; co se stalo potom, sady nevidí.`);
  }
  const lisi = polozky.filter((p) => stav(n[p.id]) !== stav(m[p.id]));
  souhrn.lisi = lisi.length;
  r.push("", `## Body, kde návrh DEV2 má jiný stav než main (${lisi.length} ze ${polozky.length})`, "");
  const vSade = new Map(sady.flatMap((s) => s.body.map((b) => [b.id, pravda(b)])));
  for (const p of lisi) {
    const t = vSade.get(p.id);
    const kdo = !t ? null : stav(n[p.id]) === t ? "navrh" : stav(m[p.id]) === t ? "main" : "nikdo";
    if (kdo) souhrn.pravdu[kdo]++;
    const veta = { navrh: " — pravdu má DEV2", main: " — pravdu má main", nikdo: " — pravdu nemá ani jeden" }[kdo] || "";
    const naWebu = stav(d[p.id]) === stav(n[p.id]) ? "" : " (na webu DEV2 zatím minulý záznam)";
    r.push(`- **${p.id}** ${p.cs || ""}: main ${NAZVY[stav(m[p.id])] || "—"} → DEV2 ${NAZVY[stav(n[p.id])] || "—"}${naWebu}${veta}`);
  }

  /* Krátké shrnutí do e-mailu; celé srovnání je v příloze. */
  const sadyVeta = Object.entries(souhrn.sady).map(([nz, s]) => `${nz} main ${s.main}/${s.bodu}, návrhy DEV2 ${s.navrh}/${s.bodu}`).join("; ");
  const kdoVeta = sady.length ? ` U bodů ze sad má pravdu DEV2 ${souhrn.pravdu.navrh}×, main ${souhrn.pravdu.main}×, ani jeden ${souhrn.pravdu.nikdo}×.` : "";
  const text = `Srovnání s main (web teď, data k ${souhrn.main.data}): splněno main ${pct(mm.procent)}, DEV2 podle návrhů hodnotitele ${pct(mn.procent)} (na webu DEV2 bez tvých rozhodnutí ${pct(md.procent)}).`
    + `${sadyVeta ? ` Shoda s pravdou: ${sadyVeta}.` : ""} Návrh DEV2 má jiný stav u ${lisi.length} bodů.${kdoVeta}`;
  const html = `<p><b>Srovnání s main</b> (web teď, data k ${esc(souhrn.main.data)}): splněno main ${esc(pct(mm.procent))}, DEV2 podle návrhů hodnotitele ${esc(pct(mn.procent))} (na webu DEV2 bez tvých rozhodnutí ${esc(pct(md.procent))}).`
    + `${sadyVeta ? ` Shoda s pravdou: ${esc(sadyVeta)}.` : ""} Návrh DEV2 má jiný stav u ${lisi.length} bodů.${esc(kdoVeta)} Celé srovnání je v příloze srovnani-s-main.md.</p>`;
  return { md: `${r.join("\n")}\n`, html, text, souhrn };
}
