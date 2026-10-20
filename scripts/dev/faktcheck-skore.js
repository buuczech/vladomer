/* scripts/dev/faktcheck-skore.js — chytá kontrola faktů to, co je na webu špatně? (spec 004, T009)
 *
 *     node scripts/dev/faktcheck-skore.js [adresář výstupu kontroly] [evaluations.json]
 *
 * Výchozí: faktcheck-vystup/ (deterministicky.json + modelova.json z
 * scripts/faktcheck.js) proti public/evaluations.json a OBĚMA sadám s ručně
 * ověřenou pravdou (zlatá + kontrolní, scripts/dev/fixtury/).
 *
 * Zlatá a kontrolní sada říkají, kde se web liší od skutečnosti (k 20. 10.
 * 2026 v 19 bodech ze 46). Kontrola faktů je tu proto, aby takový bod
 * nevyšel jako ověřený: bod se „označí“, když na něm vrstva D našla nález
 * nesoucí stav, nebo když ho vrstva M nepustila jako čistý (vyvrácené nebo
 * neověřené tvrzení nesoucí stav, spor o stav podle pravidel vlastníka).
 *
 *   chycen      web se liší od pravdy a kontrola bod označila   — cíl: všechny
 *   PROPUŠTĚN   web se liší od pravdy a kontrola bod pustila    — cíl: žádný
 *   podržen     web sedí, ale kontrola bod označila             — práce navíc pro vlastníka
 *   puštěn      web sedí a kontrola bod pustila
 *
 * Navíc: u kolika bodů dala vrstva M podle pravidel PRAVDIVÝ stav. To je
 * návrh, který dostane vlastník v PR u opravy bez události (FR-009) — měří
 * se zvlášť, protože bod se dá správně podržet i se špatným návrhem.
 *
 * Exit 0 vždy: i špatné skóre je platný výsledek měření. Strojově čitelný
 * souhrn je poslední řádek (SKORE_FC {…}).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [, , adresar = "faktcheck-vystup", cestaEval = "public/evaluations.json"] = process.argv;
const cist = (p) => JSON.parse(readFileSync(p, "utf8"));
const evals = cist(cestaEval).evals || {};
const D = existsSync(join(adresar, "deterministicky.json")) ? cist(join(adresar, "deterministicky.json")) : null;
const M = existsSync(join(adresar, "modelova.json")) ? cist(join(adresar, "modelova.json")) : null;
if (!D && !M) { console.error(`${adresar}: chybí deterministicky.json i modelova.json`); process.exit(1); }

const SADY = ["zlata-sada.json", "kontrolni-sada.json"].map((f) => ({ jmeno: f.replace(".json", ""), ...cist(new URL(`./fixtury/${f}`, import.meta.url)) }));
const CS = { fulfilled: "splněno", partial: "částečně", in_progress: "probíhá", declared: "deklarováno", not_started: "nezahájeno", broken: "porušeno", unverifiable: "neměřitelné" };
const popis = (s) => CS[s] || s || "—";

const nalezyD = {};
for (const n of (D && D.nalezy) || []) if (n.nesestav) (nalezyD[n.bod] = nalezyD[n.bod] || []).push(`${n.zavaznost === "CHYBA" ? "D!" : "D"}:${n.pravidlo}`);

const vsechny = [];
for (const sada of SADY) {
  for (const g of sada.body) {
    const e = evals[g.id];
    if (!e) continue;
    const pravda = g.unverifiable ? "unverifiable" : g.stav;
    const web = e.unverifiable ? "unverifiable" : e.status;
    const b = M && M.body && M.body[g.id];
    const s = b && b.shrnuti;
    const duvody = [...(nalezyD[g.id] || [])];
    if (s) {
      if (s.nezkontrolovano) duvody.push("M:nezkontrolováno");
      if (s.vyvraceno) duvody.push(`M:vyvráceno ${s.vyvraceno}`);
      if (s.neovereno) duvody.push(`M:neověřeno ${s.neovereno}`);
      if (s.spor_o_stav) duvody.push(`M:spor → ${s.stav_podle_pravidel} (${s.pravidlo || "?"})`);
    }
    const oznacen = duvody.length > 0;
    const webSedi = web === pravda;
    const vysledek = webSedi ? (oznacen ? "podržen" : "puštěn") : (oznacen ? "chycen" : "PROPUŠTĚN");
    // Návrh vrstvy M (stav podle pravidel). Neměřitelnost M navrhnout neumí —
    // tu drží seznam vlastníka (nemeritelne.txt) —, takže se u ní návrh nehodnotí.
    const navrh = s && !s.nezkontrolovano && pravda !== "unverifiable" ? (s.stav_podle_pravidel || null) : null;
    vsechny.push({ sada: sada.jmeno, id: g.id, web, pravda, vysledek, duvody, navrh, navrhSedi: navrh ? navrh === pravda : null, kolo2: Boolean(b && b.kolo2), zahozeno: (b && b.finalni && b.finalni.zahozeno) || 0 });
  }
}

const pocet = (rad, v) => rad.filter((r) => r.vysledek === v).length;
console.log(`Kontrola faktů proti ověřené pravdě | výstup: ${adresar} | data: ${cestaEval}`);
if (M) console.log(`Vrstva M: ${M.model} (effort ${M.effort}), kolo 1 ${M.davka ? "přes dávku" : "přímo"}, kolo 2: ${M.kolo2 ? `${M.kolo2.bodu} bodů${M.kolo2.vynechano ? " (VYNECHÁNO)" : ""}` : "?"}; cena ${M.cena ? `${M.cena.celkem_usd.toFixed(2)} $` : "?"}`);
else console.log("Vrstva M: neběžela (jen vrstva D)");
console.log("\nsada       bod    web            pravda         výsledek   návrh M        důvody");
for (const r of vsechny) {
  const navrh = r.navrh ? `${popis(r.navrh)}${r.navrhSedi ? " ✓" : " ✗"}` : "—";
  console.log(`${r.sada.padEnd(10)} ${r.id.padEnd(6)} ${popis(r.web).padEnd(14)} ${popis(r.pravda).padEnd(14)} ${r.vysledek.padEnd(10)} ${navrh.padEnd(14)} ${r.duvody.join("; ")}`);
}

const souhrn = {};
for (const sada of [...SADY.map((s) => s.jmeno), "celkem"]) {
  const rad = sada === "celkem" ? vsechny : vsechny.filter((r) => r.sada === sada);
  const navrhy = rad.filter((r) => r.navrh);
  souhrn[sada] = {
    bodu: rad.length,
    spatne_na_webu: rad.filter((r) => r.web !== r.pravda).length,
    chyceno: pocet(rad, "chycen"),
    propusteno: rad.filter((r) => r.vysledek === "PROPUŠTĚN").map((r) => r.id),
    podrzeno_zbytecne: pocet(rad, "podržen"),
    pusteno: pocet(rad, "puštěn"),
    navrh_m_sedi: navrhy.filter((r) => r.navrhSedi).length,
    navrh_m_z: navrhy.length,
  };
}
console.log("");
for (const [sada, x] of Object.entries(souhrn)) {
  console.log(`souhrn ${sada.padEnd(15)} chyceno ${x.chyceno}/${x.spatne_na_webu}, propuštěno ${x.propusteno.length}${x.propusteno.length ? ` (${x.propusteno.join(", ")})` : ""}, `
    + `zbytečně podrženo ${x.podrzeno_zbytecne}/${x.bodu - x.spatne_na_webu}, návrh M sedí s pravdou ${x.navrh_m_sedi}/${x.navrh_m_z}`);
}
const c = souhrn.celkem;
// Nezkontrolovaný bod se podrží (počítá se jako označený), ale měření o něm nic neříká.
const nezkontrolovano = vsechny.filter((r) => r.duvody.includes("M:nezkontrolováno")).map((r) => r.id);
c.nezkontrolovano = nezkontrolovano;
const verdikt = c.propusteno.length ? `NESPLNĚNA — propuštěno ${c.propusteno.join(", ")}` : "SPLNĚNA — žádný špatný bod neprošel jako ověřený";
console.log(`\nAkceptace (spec 004, T009): ${verdikt}${nezkontrolovano.length ? ` — ALE měření je neúplné, vrstva M nezkontrolovala ${nezkontrolovano.join(", ")}` : ""}`);
console.log(`\nSKORE_FC ${JSON.stringify({ ...c, zahozeno_citaci: vsechny.reduce((n, r) => n + r.zahozeno, 0), cena_usd: M && M.cena ? Number(M.cena.celkem_usd.toFixed(2)) : null })}`);
