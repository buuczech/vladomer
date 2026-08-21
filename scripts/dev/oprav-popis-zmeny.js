/* scripts/dev/oprav-popis-zmeny.js — uklidí pole „co se změnilo" v už
 * zveřejněných datech.
 *
 *     node scripts/dev/oprav-popis-zmeny.js            ukáže, co by udělal
 *     node scripts/dev/oprav-popis-zmeny.js --zapsat   provede to
 *
 * Do 21. 8. 2026 psal tohle pole model vlastními slovy včetně přechodu stavu
 * a data minulého hodnocení — tedy údajů, které program zná přesně. Vznikly
 * tím tři druhy nepravd, které jsou na webu vidět:
 *
 *   1. „První hodnocení" u bodu, který už hodnocený byl. Od 31. 7. 2026 se to
 *      opakuje v každém běhu u 31 až 86 bodů.
 *   2. Věta tvrdící jiný stav, než jaký bod má („nyní splněno" pod odznakem
 *      „částečně splněno" u 14.1) — někdy i s datem, které ještě nenastalo.
 *   3. Syrový anglický klíč stavu v české větě („status partial").
 *
 * Prompt od té doby přechod popisovat zakazuje a web ho vypisuje z dat.
 * Tohle uklidí, co zůstalo venku.
 *
 * Nepravdivá část se MAŽE, nedopisuje. Vymyslet za model, co se ve světě
 * stalo, by znamenalo napsat na web tvrzení, které nikdo neověřil.
 *
 * audit.json se NEPŘEPISUJE — oprava se přidává jako nový záznam.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ocisti } from "../lib/korektura.js";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const P = (f) => join(KOREN, "public", f);
const ZAPSAT = process.argv.includes("--zapsat");

const evaluations = JSON.parse(readFileSync(P("evaluations.json"), "utf8"));
const audit = JSON.parse(readFileSync(P("audit.json"), "utf8"));
if (!Array.isArray(audit.entries)) throw new Error("audit.json nemá pole entries");

const STAV = {
  fulfilled: "splněno", partial: "částečně splněno", in_progress: "probíhá",
  declared: "deklarováno", not_started: "nezahájeno", broken: "porušeno",
};
/* Diakritika kolísá („Prvé hodnocení" se v datech taky vyskytlo), proto
   tolerantní vzor. Bere jen začátek věty — uprostřed textu by to mohla být
   legitimní zmínka. */
const PREFIX_PRVNI = /^\s*Prv[éní]{1,2}\s+hodnocení\s*[.:]?\s*/i;
const PREFIX_STAV = /^\s*(?:status|stav)\s+[„"']?[\p{L}\s]{3,22}[”"']?\s*[;:]\s*/iu;
/* Druhý tvar téhož: „status partial (vláda schválila…)" — stav v předponě
   a zbytek v závorce. Vytáhne se obsah závorky, jinak by věta začínala
   závorkou nebo by v ní zůstal přeložený, ale nadbytečný název stavu. */
const PREFIX_STAV_ZAVORKA = /^\s*(?:status|stav)\s+[„"']?[\p{L}\s]{3,22}[”"']?\s*\((.*)\)\s*\.?\s*$/isu;

const zmeny = [];
for (const [id, e] of Object.entries(evaluations.evals)) {
  const pred = { cs: e.change?.cs || "", en: e.change?.en || "" };
  let cs = pred.cs, en = pred.en, duvod = [];

  // 1) tvrdí jiný stav, než jaký bod má → celá věta je nedůvěryhodná
  const m = cs.match(/nyní\s+(splněno|částečně splněno|probíhá|deklarováno|nezahájeno|porušeno)/i);
  if (m && m[1].toLowerCase() !== STAV[e.status]) {
    cs = ""; en = "";
    duvod.push(`věta tvrdila „nyní ${m[1]}“, ale stav je „${STAV[e.status]}“`);
  }

  // 2) falešné „první hodnocení" — smaže se jen ta předpona, zbytek nese obsah
  if (cs && e.previousStatus && PREFIX_PRVNI.test(cs)) {
    cs = cs.replace(PREFIX_PRVNI, "").replace(PREFIX_STAV_ZAVORKA, "$1").replace(PREFIX_STAV, "");
    en = en.replace(/^\s*First\s+assessment\s*[.:]?\s*/i, "")
      .replace(/^\s*status\s+[\p{L}\s]{3,22}\s*\((.*)\)\s*\.?\s*$/isu, "$1")
      .replace(/^\s*status\s+[\p{L}\s]{3,22}\s*[;:]\s*/iu, "");
    // Velké písmeno na začátku a tečka na konci: vytažením ze závorky
    // se obojí ztratí a věta by pak vypadala uříznutě.
    const dovetu = (x) => {
      const t = x.trim();
      if (!t) return "";
      const s2 = t.charAt(0).toUpperCase() + t.slice(1);
      return /[.!?]$/.test(s2) ? s2 : `${s2}.`;
    };
    cs = dovetu(cs);
    en = dovetu(en);
    duvod.push("hlásilo „první hodnocení“, ačkoli předchozí existuje");
  }

  // 3) syrový klíč stavu v české větě
  const poOcisteni = { cs: ocisti(cs, "cs"), en: ocisti(en, "en") };
  if (poOcisteni.cs !== cs) duvod.push("syrový klíč stavu v české větě");
  cs = poOcisteni.cs; en = poOcisteni.en;

  if (cs === pred.cs && en === pred.en) continue;
  zmeny.push({ id, pred, po: { cs, en }, duvod });
  e.change = { cs, en };
}

/* Komentáře se čistí taky — tam se klíč objevil u 8.7. */
let komentaru = 0;
for (const e of Object.values(evaluations.evals)) {
  const cs = ocisti(e.comment?.cs || "", "cs");
  if (cs !== (e.comment?.cs || "")) { e.comment.cs = cs; komentaru++; }
}

for (const z of zmeny) {
  console.log(`${z.id}  (${z.duvod.join("; ")})`);
  console.log(`   bylo: ${z.pred.cs}`);
  console.log(`   je:   ${z.po.cs || "(prázdné)"}`);
}
console.log(`\nUpraveno ${zmeny.length} popisů změny, ${komentaru} komentářů.`);

if (!zmeny.length && !komentaru) { console.log("Nic k opravě."); process.exit(0); }

const dnes = new Date().toISOString().slice(0, 10);
for (const z of zmeny) {
  const posledni = [...audit.entries].reverse().find((x) => x.id === z.id);
  audit.entries.push({
    ...posledni,
    date: dnes,
    change_cs: z.po.cs,
    change_en: z.po.en,
    oprava: {
      puvodni_zaznam: posledni?.date || null,
      puvodni_change_cs: z.pred.cs,
      duvod: `Popis změny obsahoval nepravdu: ${z.duvod.join("; ")}. `
        + "Model už přechod stavu nepopisuje, vypisuje ho web z dat.",
      bez_noveho_hodnoceni: true,
    },
  });
}
console.log(`Do auditu přibude ${zmeny.length} záznamů o opravě (nic se nepřepisuje).`);

if (!ZAPSAT) { console.log("Zkušební běh — nic se nezapsalo. Spusť s --zapsat."); process.exit(0); }
writeFileSync(P("evaluations.json"), `${JSON.stringify(evaluations, null, 2)}\n`, "utf8");
writeFileSync(P("audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log("Zapsáno. Zbývá: npm run build");
