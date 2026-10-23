/* scripts/dev/test-zneni.js — doslovné znění slibů z programového prohlášení.
 *
 *     node scripts/dev/test-zneni.js
 *
 * scripts/nastaveni/zneni-slibu.json (převedl scripts/dev/zneni-slibu.py, ruční
 * výběr vět prošel člověk) musí:
 *   - mít znění u všech 143 bodů src/data.js,
 *   - citovat doslova: každý úsek (mezi výpustkami „…“) stojí v textu
 *     prohlášení scripts/nastaveni/programove-prohlaseni.txt,
 *   - nést podnadpis, který v téže kapitole prohlášení opravdu je,
 *   - a dostat se do promptu hodnotitele, ověřovatele i kontroly faktů.
 * Pevné body jsou ty, na kterých chybějící znění měřitelně škodilo (15.2, 3.2).
 */
import { readFileSync } from "node:fs";
import { CHAPTERS } from "../../src/data.js";
import { promptHodnoceni, zneniSKontextem, slibySKontextem, zneniSlibu } from "../lib/prompty.js";

let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};

const data = JSON.parse(readFileSync(new URL("../nastaveni/zneni-slibu.json", import.meta.url), "utf8"));
const radky = readFileSync(new URL("../nastaveni/programove-prohlaseni.txt", import.meta.url), "utf8").split("\n");
const souvisly = radky.filter((r) => !r.startsWith("#")).join(" ").replace(/\s+/g, " ");
const ids = CHAPTERS.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => i.id)));

console.log("Data");
over(/^https:\/\/vlada\.gov\.cz\//.test(data.zdroj) && data.stazeno, "zdroj na vlada.gov.cz a datum stažení");
over(radky.filter((r) => /^# \d+\. /.test(r)).length === 18, "text prohlášení má 18 kapitol");
const chybi = ids.filter((id) => !data.body[id] || !data.body[id].zneni);
over(!chybi.length && Object.keys(data.body).length === ids.length, "znění u všech bodů, nic navíc", chybi);
const nedoslovne = Object.entries(data.body).flatMap(([id, b]) => b.zneni.split(" … ").filter((u) => !souvisly.includes(u.replace(/\s+/g, " "))).map((u) => `${id}: ${u.slice(0, 60)}`));
over(!nedoslovne.length, "každý úsek znění stojí v textu prohlášení doslova", nedoslovne);
const kapitolaNadpisu = {};
let kap = null;
for (const r of radky) { const m = r.match(/^# (\d+)\. /); if (m) kap = m[1]; else if (r.startsWith("## ")) (kapitolaNadpisu[r.slice(3)] = kapitolaNadpisu[r.slice(3)] || new Set()).add(kap); }
const spatneNadpisy = Object.entries(data.body).filter(([id, b]) => b.nadpis && !(kapitolaNadpisu[b.nadpis] && kapitolaNadpisu[b.nadpis].has(id.split(".")[0]))).map(([id, b]) => `${id}: ${b.nadpis}`);
over(!spatneNadpisy.length, "podnadpis je v téže kapitole prohlášení", spatneNadpisy);

console.log("\nBody, na kterých chybějící znění škodilo");
over(/modulovém řešení/.test(zneniSlibu("15.2").zneni) && /pilotního ověření/.test(zneniSlibu("15.2").zneni), "15.2: modulové řešení i pilotní ověření");
over(/policisty a hasiče/.test(zneniSlibu("3.2").nadpis || ""), "3.2: příspěvek na bydlení pod podnadpisem pro policisty a hasiče", zneniSlibu("3.2"));
over(/65 letech/.test(zneniSlibu("10.1").zneni) && /Trenéři do školek/.test(zneniSlibu("16.3").zneni), "10.1 a 16.3: znění sedí");

console.log("\nPrompty");
const kap15 = CHAPTERS.find((c) => String(c.id) === "15");
const p = promptHodnoceni(kap15, {}, [], null, null, null);
over(p.includes("Znění v programovém prohlášení (podnadpis „Stavební právo a bydlení“): „V návaznosti na nový stavební zákon"), "hodnotitel: znění pod řádkem bodu");
over(zneniSKontextem({ id: "3.2", cs: "x" }).includes("pro policisty a hasiče"), "ověřovatel: znění s podnadpisem");
over(slibySKontextem(CHAPTERS)["15.2"].includes("pilotního ověření"), "kontrola faktů: znění ve slibu");

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
