/* scripts/dev/prepocet-degradaci.js — přepočítá degradace „splněno“ na už
 * zveřejněných datech, bez jediného volání modelu.
 *
 *     node scripts/dev/prepocet-degradaci.js            jen ukáže, co by udělal
 *     node scripts/dev/prepocet-degradaci.js --zapsat   provede to
 *
 * K čemu to je: laťka na doklad se pouští jen na stavu „splněno“ (viz
 * lib/dukaz.js), takže každý záznam s „evidenceMissing“ měl původně od modelu
 * splněno. Původní verdikt jde z dat rekonstruovat — když se pravidlo opraví,
 * dají se stará data srovnat zadarmo a nemusí se čekat na páteční běh.
 *
 * Pravidlo se sem NEKOPÍRUJE. Bere se z lib/dukaz.js, tedy z téhož místa,
 * odkud ho bere ostrý běh; jinak by přepočet mohl tvrdit něco jiného, než co
 * v pátek vyjde.
 *
 * POZOR na audit.json. Web na třech místech slibuje, že je append-only
 * a záznamy se nikdy nepřepisují. Oprava se do něj proto PŘIDÁVÁ jako nový
 * záznam s příznakem „oprava“ — přepsat starý řádek by kvůli jednomu číslu
 * porušilo slib, na kterém stojí důvěryhodnost celého webu.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DATES } from "../../src/data.js";
import { readSettings } from "../lib/nastaveni.js";
import { duvodDegradace, CIL_DEGRADACE } from "../lib/dukaz.js";
import { STATUSES } from "../lib/prompty.js";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const P = (f) => join(KOREN, "public", f);
const ZAPSAT = process.argv.includes("--zapsat");
const NAST = readSettings();
const PRAVIDLA = { minDelkaDokladu: NAST.minimalni_delka_dokladu, nastup: DATES.tookOffice,
  latkaPoruseno: NAST.latka_poruseno === 1 };

const cti = (f) => JSON.parse(readFileSync(P(f), "utf8"));
const zapis = (f, o) => writeFileSync(P(f), `${JSON.stringify(o, null, 2)}\n`, "utf8");

const evaluations = cti("evaluations.json");
const history = cti("history.json");
const audit = cti("audit.json");

// history.json je { snapshots: [...] }, audit.json { entries: [...] } — sáhnout
// na ně jako na pole je snadný omyl, tak ať se pozná hned.
const snimky = history.snapshots;
if (!Array.isArray(snimky) || !snimky.length) throw new Error("history.json nemá pole snapshots");
if (!Array.isArray(audit.entries)) throw new Error("audit.json nemá pole entries");

/* Týž jmenovatel jako přísná metrika na webu: neznámý stav se nepočítá vůbec
   a neměřitelné body jsou mimo jmenovatel. Dřív se tu filtrovalo jen podle
   unverifiable, takže tenhle výpis uměl ukázat jiné číslo než web — a číslo,
   které vypadá jako publikované, se podle publikovaného pravidla počítat má. */
const souhrn = (evals) => {
  const v = Object.values(evals).filter((e) => STATUSES.includes(e.status));
  const hodnoceno = v.filter((e) => !e.unverifiable).length;
  const splneno = v.filter((e) => e.status === "fulfilled" && !e.unverifiable).length;
  return `${splneno} z ${hodnoceno} = ${(splneno / hodnoceno * 100).toFixed(1)} %`;
};

console.log(`Pravidlo: doklad min. ${PRAVIDLA.minDelkaDokladu} znaků, nástup vlády ${PRAVIDLA.nastup.slice(0, 10)}`);
console.log(`Před:  ${souhrn(evaluations.evals)}\n`);

const zmeny = [];
for (const [id, e] of Object.entries(evaluations.evals)) {
  /* Dva vstupy, ne jeden. Body s „evidenceMissing“ už jednou spadly a ptáme
     se, jestli by spadly i podle opraveného pravidla. Body, které jsou pořád
     „splněno“, se musí projít taky — nově přidaný strážce dopadá právě na ně
     a jinak by se na už zveřejněná data nikdy nedostal. Totéž pro „porušeno“,
     až se laťka u něj zapne. */
  const puvodniStav = e.evidenceMissing ? "fulfilled" : e.status;
  if (!e.evidenceMissing && puvodniStav !== "fulfilled" && puvodniStav !== "broken") continue;

  const nyni = duvodDegradace(puvodniStav, e.evidence || "", e.evidenceDate || "", PRAVIDLA);
  const stejne = nyni === (e.evidenceMissing || null);
  if (stejne) continue;
  const naNove = nyni ? CIL_DEGRADACE[nyni] : puvodniStav;
  console.log(`OPRAVA     ${id.padEnd(6)} ${e.evidenceMissing || e.status}`
    + ` → ${nyni ? `${nyni} (${naNove})` : `doklad obstojí, vrací se na ${puvodniStav}`}`);
  zmeny.push({ id, zPuvodni: e.status, naNove, puvodniDuvod: e.evidenceMissing, novyDuvod: nyni });
}

if (!zmeny.length) {
  console.log("\nNic k opravě.");
  process.exit(0);
}

const dnes = new Date().toISOString().slice(0, 10);

for (const z of zmeny) {
  const e = evaluations.evals[z.id];
  e.status = z.naNove;
  if (z.novyDuvod) e.evidenceMissing = z.novyDuvod;
  else delete e.evidenceMissing;

  /* Poslední snímek historie nese stav k témuž dni. Kdyby se nesrovnal, graf
     na webu by ukazoval propad, který se nikdy nestal.

     Ta tvrdá kontrola níž tu je z vlastní škody: první verze sahala na
     history.json jako na pole, jenže je to { snapshots: [...] }. Krok tiše
     neudělal nic a skript hlásil úspěch. Když se nenajde, co se má opravit,
     musí to spadnout — tichý no-op je horší než chyba. */
  const posledni = snimky[snimky.length - 1];
  if (!posledni?.statuses || !(z.id in posledni.statuses)) {
    throw new Error(`bod ${z.id} není v posledním snímku historie (${posledni?.date ?? "žádný snímek"}) `
      + "— historie by se rozešla s hodnocením, nic se nezapisuje");
  }
  posledni.statuses[z.id] = z.naNove;

  /* Audit se nepřepisuje, přidává se. Záznam nese kompletní kontext běhu,
     ze kterého pochází, plus vysvětlení, že nejde o nové hodnocení. */
  const puvodni = [...audit.entries].reverse().find((x) => x.id === z.id);
  audit.entries.push({
    ...puvodni,
    date: dnes,
    status: z.naNove,
    oprava: {
      puvodni_stav: z.zPuvodni,
      puvodni_zaznam: puvodni?.date || null,
      duvod: `Automatická kontrola „${z.puvodniDuvod}“ zafungovala chybně: srážela `
        + "novely starších předpisů. Pravidlo bylo opraveno a stav přepočítán.",
      bez_noveho_hodnoceni: true,
    },
  });
}

console.log(`\nPo:    ${souhrn(evaluations.evals)}`);
console.log(`Opraveno bodů: ${zmeny.map((z) => z.id).join(", ")}`);
console.log(`Do auditu přibude ${zmeny.length} záznamů o opravě (nic se nepřepisuje).`);

if (!ZAPSAT) {
  console.log("\nZkušební běh — nic se nezapsalo. Spusť s --zapsat.");
  process.exit(0);
}

zapis("evaluations.json", evaluations);
zapis("history.json", history);
zapis("audit.json", audit);
console.log("\nZapsáno. Zbývá: npm run build && npm run og");
