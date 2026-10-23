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

/**
 * @param dev2, main  evaluations.json (celý objekt s .evals a .lastUpdated)
 * @param polozky     [{ id, cs }] všech bodů
 * @param sady        [{ nazev, body: [{ id, stav, unverifiable, datum_pravdy }] }]
 * @returns { md, html, text, souhrn }
 */
export function srovnani({ dev2, main, polozky, sady = [] }) {
  const d = dev2.evals || {}, m = main.evals || {};
  const md = metrika(d, polozky), mm = metrika(m, polozky);
  const r = [
    `# Srovnání generálky DEV2 s main`,
    "",
    `DEV2 (měsíční běh): data k ${den(dev2.lastUpdated)}. Main (týdenní běh, teď na webu): data k ${den(main.lastUpdated)}.`,
    "",
    "| | main | DEV2 |",
    "|---|---|---|",
    `| splněno (přísná metrika) | ${pct(mm.procent)} (${mm.splneno}/${mm.hodnoceno}) | ${pct(md.procent)} (${md.splneno}/${md.hodnoceno}) |`,
    ...Object.keys(NAZVY).map((s) => `| ${NAZVY[s]} | ${mm.stavy[s] || 0} | ${md.stavy[s] || 0} |`),
  ];
  const souhrn = {
    main: { data: den(main.lastUpdated), procent: mm.procent },
    dev2: { data: den(dev2.lastUpdated), procent: md.procent },
    sady: {}, lisi: 0, pravdu: { dev2: 0, main: 0, nikdo: 0 },
  };
  if (sady.length) {
    r.push("", "## Shoda s pravdou (zlatá a kontrolní sada)", "", "| sada | main | DEV2 |", "|---|---|---|");
    for (const sada of sady) {
      let sm = 0, sd = 0;
      for (const b of sada.body) { if (stav(m[b.id]) === pravda(b)) sm++; if (stav(d[b.id]) === pravda(b)) sd++; }
      souhrn.sady[sada.nazev] = { main: sm, dev2: sd, bodu: sada.body.length };
      r.push(`| ${sada.nazev} (${sada.body.length}) | ${sm} | ${sd} |`);
    }
    const datumy = [...new Set(sady.flatMap((s) => s.body.map((b) => b.datum_pravdy)).filter(Boolean))].sort();
    r.push("", `Pravda platí k ${datumy.join(", ")}; co se stalo potom, sady nevidí.`);
  }
  const lisi = polozky.filter((p) => stav(d[p.id]) !== stav(m[p.id]));
  souhrn.lisi = lisi.length;
  r.push("", `## Body s jiným stavem (${lisi.length} ze ${polozky.length})`, "");
  const vSade = new Map(sady.flatMap((s) => s.body.map((b) => [b.id, pravda(b)])));
  for (const p of lisi) {
    const t = vSade.get(p.id);
    const kdo = !t ? null : stav(d[p.id]) === t ? "dev2" : stav(m[p.id]) === t ? "main" : "nikdo";
    if (kdo) souhrn.pravdu[kdo]++;
    const veta = { dev2: " — pravdu má DEV2", main: " — pravdu má main", nikdo: " — pravdu nemá ani jeden" }[kdo] || "";
    r.push(`- **${p.id}** ${p.cs || ""}: main ${NAZVY[stav(m[p.id])] || "—"} → DEV2 ${NAZVY[stav(d[p.id])] || "—"}${veta}`);
  }

  /* Krátké shrnutí do e-mailu; celé srovnání je v příloze. */
  const sadyVeta = Object.entries(souhrn.sady).map(([n, s]) => `${n} main ${s.main}/${s.bodu}, DEV2 ${s.dev2}/${s.bodu}`).join("; ");
  const kdoVeta = sady.length ? ` U bodů ze sad má pravdu DEV2 ${souhrn.pravdu.dev2}×, main ${souhrn.pravdu.main}×, ani jeden ${souhrn.pravdu.nikdo}×.` : "";
  const text = `Srovnání s main (web teď, data k ${souhrn.main.data}): splněno main ${pct(mm.procent)}, DEV2 ${pct(md.procent)}.`
    + `${sadyVeta ? ` Shoda s pravdou: ${sadyVeta}.` : ""} Jiný stav u ${lisi.length} bodů.${kdoVeta}`;
  const html = `<p><b>Srovnání s main</b> (web teď, data k ${esc(souhrn.main.data)}): splněno main ${esc(pct(mm.procent))}, DEV2 ${esc(pct(md.procent))}.`
    + `${sadyVeta ? ` Shoda s pravdou: ${esc(sadyVeta)}.` : ""} Jiný stav u ${lisi.length} bodů.${esc(kdoVeta)} Celé srovnání je v příloze srovnani-s-main.md.</p>`;
  return { md: `${r.join("\n")}\n`, html, text, souhrn };
}
