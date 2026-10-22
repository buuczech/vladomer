/* scripts/dev/test-plan.js — Plán legislativních prací vlády v datech a v promptu (spec 006, T008).
 *
 *     node scripts/dev/test-plan.js
 *
 * Zkouší scripts/nastaveni/plan-legislativy.json (převedený z PDF nástrojem
 * scripts/dev/plan-legislativy.py) a lib/plan.js na faktech, která jdou
 * ověřit v PDF usnesení vlády č. 175 z 23. 3. 2026:
 *   - plán má 114 úkolů a výhled 69 (výhled 69 uváděla i ČTK),
 *   - úkol ke slibu 15.7 (transformace uhelných regionů) je v kapitole 15,
 *   - tabulka vazeb vnitra má v dokumentu čísla posunutá o jedna; vazba se
 *     páruje podle názvu (zpracování osobních údajů ↔ ochrana soukromí),
 *   - „kapitola 13.“ ve vazbě je kapitola 13, ne 1 (rozdělené číslo v PDF),
 *   - prompt kapitoly nese jen její úkoly a kontrola faktů je dostane jako zdroj.
 */
import { nactiPlan, tabulkaPlanu, zdrojePlanu, ukolyKapitoly, BEZ_UKOLU } from "../lib/plan.js";

let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};

const plan = nactiPlan();
console.log("Data plánu");
const pocet = (z) => plan.ukoly.filter((u) => u.zdroj === z).length;
over(pocet("plan") === 114 && pocet("vyhled") === 69, "plán 114 úkolů, výhled 69", { plan: pocet("plan"), vyhled: pocet("vyhled") });
over(/č\. 175/.test(plan.usneseni) && plan.zdroje.every((z) => /^https:\/\/vlada\.gov\.cz\//.test(z.url) && /^[0-9a-f]{64}$/.test(z.sha256)), "usnesení a zdroje s odkazem na vlada.gov.cz a otiskem PDF");
over(plan.ukoly.every((u) => u.nazev && u.vlade && Array.isArray(u.kapitoly) && typeof u.vazba === "boolean"), "každý úkol má název, termín, kapitoly a příznak vazby",
  plan.ukoly.filter((u) => !u.nazev || !u.vlade).map((u) => `${u.zdroj} ${u.resort} ${u.cislo}`));
const uhli = plan.ukoly.find((u) => u.vazba && /transformaci uhelných regionů/.test(u.program));
over(uhli && uhli.zdroj === "vyhled" && uhli.kapitoly.join() === "15", "slib transformace uhelných regionů (15.7) je ve výhledu v kapitole 15", uhli && { nazev: uhli.nazev, kapitoly: uhli.kapitoly });
const osobni = plan.ukoly.find((u) => u.zdroj === "plan" && /zpracování osobních údajů/.test(u.nazev) && u.resort === "Ministr vnitra");
over(osobni && osobni.cislo === 3 && /ochranu soukromí/.test(osobni.program || ""), "vnitro: vazba podle názvu, ne podle posunutého čísla v dokumentu", osobni && { cislo: osobni.cislo, program: osobni.program });
const puda = plan.ukoly.find((u) => u.vazba && /kapitola 13\. Životní prostředí/.test(u.program));
over(puda && puda.kapitoly.includes(13) && !puda.kapitoly.includes(1), "„kapitola 13.“ ve vazbě je kapitola 13, ne 1 (pozemkové úpravy citují kapitoly 13 a 18)", puda && { program: puda.program.slice(0, 80), kapitoly: puda.kapitoly });
over(!plan.ukoly.some((u) => /\s[,.]|\b\w \w{1,2}ístopředseda/.test(u.nazev)), "názvy bez rozdělených slov a mezer před čárkou",
  plan.ukoly.filter((u) => /\s[,.]/.test(u.nazev)).map((u) => u.nazev.slice(0, 80)));

console.log("\nPrompt a zdroje");
const t15 = tabulkaPlanu(plan, 15);
over(t15.includes("transformaci uhelných regionů") && t15.includes("usnesení vlády ze dne 23. března 2026 č. 175") && !t15.includes("o platformové práci"),
  "kapitola 15 dostane svoje úkoly s vazbou a usnesením, ne cizí");
const t10 = tabulkaPlanu(plan, 10);
const s = t10.indexOf("sama přiřadila"), bez = t10.indexOf("nepřiřadila");
over(s > 0 && (bez < 0 || bez > s), "úkoly s vazbou na program jsou první, zbytek resortu za nimi");
over(tabulkaPlanu(plan, 5) === BEZ_UKOLU, "kapitola bez úkolů dostane větu, že plán k ní nic nemá");
const celkem = Array.from({ length: 18 }, (_, i) => tabulkaPlanu(plan, i + 1).length);
over(Math.max(...celkem) < 15000, "žádná kapitola nedostane víc než 15 000 znaků plánu", celkem);
const z = zdrojePlanu(plan, 15);
over(z.length === 2 && z.every((x) => x.bezZkraceni && /#kapitola-15$/.test(x.url)) && z[1].text.includes("transformaci uhelných regionů"),
  "kontrola faktů: plán a výhled jako dva citovatelné zdroje kapitoly", z.map((x) => x.url));
over(ukolyKapitoly(plan, "15").length === ukolyKapitoly(plan, 15).length, "kapitola jako text i číslo");

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
