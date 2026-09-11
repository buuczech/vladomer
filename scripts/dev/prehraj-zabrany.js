/* scripts/dev/prehraj-zabrany.js — laťka na doklad přehraná přes celou
 * auditní stopu. Offline, zdarma, nic nezapisuje.
 *
 *     node scripts/dev/prehraj-zabrany.js
 *
 * K čemu to je: test-zabrany.js běží na hrstce vzorků, které do něj někdo
 * ručně opsal. Tenhle nástroj pustí totéž pravidlo na VŠECHNO, co kdy model
 * napsal — audit.json nese doklad, datum i zdroje ke každému hodnocení
 * z každého běhu. Odpovídá tedy na otázku, na kterou vymyšlená fixture
 * odpovědět neumí: koho by nové pravidlo srazilo z těch, kdo už jednou vyšli
 * na web jako „splněno“.
 *
 * Používá se jako dump-prompts: sejmout výstup PŘED změnou pravidla a PO ní
 * a porovnat diffem. Rozdíl je celý přínos i celá cena té změny.
 *
 * Netvrdí pass/fail a nekončí chybou. Korpus každý týden roste, takže nové
 * sepnutí může být správný nález stejně dobře jako regrese — rozhodnout to
 * musí člověk, který si přečte doklad vypsaný pod každým řádkem.
 *
 * POZOR na jedno omezení: audit.json nese stav PO degradaci a pole
 * evidenceMissing v něm není, takže záznam, který už tehdy spadl, je tu
 * vidět jako „partial“ a přehrát se nedá. Korpus je tedy množina hodnocení,
 * která tehdejšími zábranami PROŠLA — a přesně o ty jde.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DATES } from "../../src/data.js";
import { readSettings } from "../lib/nastaveni.js";
import { duvodDegradace, CIL_DEGRADACE, tvrdiSbirku } from "../lib/dukaz.js";

const cesta = (c) => fileURLToPath(new URL(c, new URL("../../", import.meta.url)));
const NAST = readSettings();
const PRAVIDLA = {
  minDelkaDokladu: NAST.minimalni_delka_dokladu,
  nastup: DATES.tookOffice,
  latkaPoruseno: NAST.latka_poruseno === 1,
};

const entries = JSON.parse(readFileSync(cesta("public/audit.json"), "utf8")).entries || [];

/* Laťka sahá jen na „splněno“ a — když je zapnutá — na „porušeno“. Ostatní
   stavy se přehrávat nemusí, degradovat se nemají z čeho. */
const PODLEHA = new Set(["fulfilled", ...(PRAVIDLA.latkaPoruseno ? ["broken"] : [])]);

const zkraceno = (t, n = 130) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const hostitel = (z) => {
  try { return new URL(typeof z === "string" ? z : z.url).hostname.replace(/^www\./, ""); }
  catch { return "?"; }
};

const srazene = [], tesne = [];
const poDuvodu = {};
let prehrano = 0;

for (const e of entries) {
  if (!PODLEHA.has(e.status)) continue;
  prehrano++;
  const duvod = duvodDegradace(e.status, e.evidence || "", e.evidence_date || "",
    { ...PRAVIDLA, zdroje: e.sources || [] });
  if (duvod) {
    poDuvodu[duvod] = (poDuvodu[duvod] || 0) + 1;
    srazene.push({ e, duvod });
    continue;
  }
  /* Záznamy, které se o Sbírku opírají a přesto obstály. Tady se hlídá ta
     druhá, tišší chyba: pravidlo, které je moc horlivé, se pozná podle toho,
     že tenhle seznam začne řídnout o věci, které na něm zůstat měly. */
  if (tvrdiSbirku(e.evidence || "", e.evidence_date || "")) tesne.push(e);
}

console.log(`Korpus: ${entries.length} auditních záznamů, z toho ${prehrano} podléhá laťce`);
console.log(`Pravidlo: doklad min. ${PRAVIDLA.minDelkaDokladu} znaků, nástup vlády `
  + `${String(PRAVIDLA.nastup).slice(0, 10)}, laťka u „porušeno“ `
  + `${PRAVIDLA.latkaPoruseno ? "zapnutá" : "vypnutá"}\n`);

console.log(`── SRAZÍ (${srazene.length}) ──`);
for (const { e, duvod } of srazene) {
  console.log(`${e.date}  ${e.id.padEnd(5)} ${e.status} → ${CIL_DEGRADACE[duvod]}  [${duvod}]`);
  console.log(`   doklad: ${zkraceno(e.evidence)}`);
  console.log(`   dat. ${e.evidence_date || "—"}   zdroje: ${(e.sources || []).map(hostitel).join(", ") || "žádné"}`);
}
if (!srazene.length) console.log("(nic)");

console.log(`\n── OBSTÁLO, ale opírá se o Sbírku (${tesne.length}) ──`);
for (const e of tesne) {
  console.log(`${e.date}  ${e.id.padEnd(5)} ${e.status}`);
  console.log(`   doklad: ${zkraceno(e.evidence)}`);
  console.log(`   zdroje: ${(e.sources || []).map(hostitel).join(", ") || "žádné"}`);
}
if (!tesne.length) console.log("(nic)");

const souhrn = Object.entries(poDuvodu).sort((a, b) => b[1] - a[1])
  .map(([d, n]) => `${d} ${n}×`).join(", ");
console.log(`\nSouhrn: ${srazene.length} sraženo${souhrn ? ` (${souhrn})` : ""}, `
  + `${tesne.length} obstálo se Sbírkou v dokladu.`);
