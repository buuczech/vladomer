/* scripts/dev/test-sbirka.js — rejstřík Sbírky, offline a zdarma.
 *
 *     node scripts/dev/test-sbirka.js
 *
 * Fixtura je výřez skutečných odpovědí e-Sbírky (fixtury/sbirka-rejstrik.json).
 * Případy jsou skutečné: model u 2.3 a 2.8 citoval neexistující „zákon
 * č. 270/2026 Sb.", u 10.4 skutečný, ale nesouvisející 360/2025 Sb., a správná
 * čísla (152/2026, 180/2026) nenašel vůbec.
 */
import { readFileSync } from "node:fs";
import {
  predpisyZOdpovedi, nactiRejstrik, overZnacky, hlavniPredpis, opravDatumVyhlaseni, tabulkaRejstriku, popisProOverovatele,
  druhPredpisu, nactiZneni,
} from "../lib/sbirka.js";
import { duvodDegradace } from "../lib/dukaz.js";

const fixtura = JSON.parse(readFileSync(new URL("./fixtury/sbirka-rejstrik.json", import.meta.url), "utf8"));
const fixturaZneni = JSON.parse(readFileSync(new URL("./fixtury/sbirka-zneni.json", import.meta.url), "utf8"));
const predpisy = new Map([...predpisyZOdpovedi(fixtura["2025"]), ...predpisyZOdpovedi(fixtura["2026"])].map((p) => [p.kod, p]));

let spadlo = 0, kontrol = 0;
function over(ok, popis, detail) {
  kontrol++;
  if (!ok) spadlo++;
  console.log(`${ok ? "ok  " : "CHYBA"} ${popis}`);
  if (!ok && detail !== undefined) console.log(`      ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- čtení odpovědi API ---
{
  const p152 = predpisy.get("152/2026");
  over(predpisy.size === 11, "fixtura: 11 předpisů z let 2025 a 2026", predpisy.size);
  over(p152 && p152.druh === "zákon" && p152.vyhlaseno === "2026-08-26" && p152.url === "https://e-sbirka.gov.cz/sb/2026/152",
    "152/2026: zákon, vyhlášen 26. 8. 2026, odkaz do e-Sbírky", p152);
  over(predpisy.get("16/2026").druh === "nařízení vlády" && predpisy.get("1/2026").druh === "vyhláška",
    "druh: nařízení vlády a vyhláška");
  over(druhPredpisu("Sdělení Ministerstva zahraničních věcí…") === "jiné" && druhPredpisu("Nález Ústavního soudu…") === "jiné"
      && druhPredpisu("Ústavní zákon o…") === "ústavní zákon",
    "druh: sdělení a nález jsou „jiné“, ústavní zákon se pozná");
}

// --- ověření značek v dokladu ---
{
  const a = overZnacky("Zákon č. 152/2026 Sb., kterým se mění zákon č. 117/1995 Sb., o státní sociální podpoře", predpisy);
  over(stejne(a.overene.map((p) => p.kod), ["152/2026"]) && !a.neexistujici.length,
    "10.4 správně: 152/2026 ověřen, 117/1995 (rok mimo rejstřík) se přeskočí", a);
  const b = overZnacky("Zákon č. 270/2026 Sb., vyhlášen ve Sbírce zákonů 22. září 2026", predpisy);
  over(stejne(b.neexistujici, ["270/2026"]) && !b.overene.length, "2.3 a 2.8: 270/2026 v e-Sbírce neexistuje", b);
  const c = overZnacky("Zákon č. 360/2025 Sb., kterým se mění zákon č. 117/1995 Sb., vyhlášen 18. srpna 2026", predpisy);
  over(stejne(c.overene.map((p) => p.kod), ["360/2025"]),
    "10.4 špatně: 360/2025 existuje — že se slibu netýká, kód nepozná (to čte ověřovatel)", c);
  const d = overZnacky("č. 152/2026 Sb. … opět 152/2026 Sb.", predpisy);
  over(d.overene.length === 1, "stejná značka dvakrát se počítá jednou", d);
  over(stejne(overZnacky("Zákon č. 270/2026 Sb.", null), { overene: [], neexistujici: [] }),
    "bez rejstříku se nic neověřuje ani nesráží");
  over(hlavniPredpis([predpisy.get("151/2025"), predpisy.get("152/2026")]).kod === "152/2026",
    "hlavní předpis dokladu je nejnovější z ověřených (novela, ne zákon, který mění)");
}

// --- den vyhlášení v textu dokladu (u „splněno" s oficiálním datem) ---
{
  const o = (t) => opravDatumVyhlaseni(t, "2026-10-07");
  over(o("Zákon č. 180/2026 Sb., vyhlášen ve Sbírce zákonů 17. září 2026").text
      === "Zákon č. 180/2026 Sb., vyhlášen ve Sbírce zákonů 7. října 2026",
    "2.3: „vyhlášen ve Sbírce zákonů 17. září“ → 7. října, zápis slovem zůstane");
  over(o("Zákon č. 180/2026 Sb. vyhlášen 17. 9. 2026, účinný od 1. 1. 2027").text
      === "Zákon č. 180/2026 Sb. vyhlášen 7. 10. 2026, účinný od 1. 1. 2027",
    "zápis číslem zůstane číslem, den účinnosti se nemění");
  const podpis = o("Sněmovna 9. září 2026 přehlasovala Senát, prezident podepsal 17. září 2026");
  over(!podpis.zmeneno, "hlasování a podpis se nepřepisují — jen datum za „vyhlášen“", podpis);
  over(!o("Zákon č. 180/2026 Sb., vyhlášený dne 7. října 2026").zmeneno, "správné datum zůstane, zmeneno=false");
}

// --- tabulka do promptu ---
{
  const t = tabulkaRejstriku(predpisy, "2025-12-15T00:00:00");
  const kody = [...t.matchAll(/^- (\S+) Sb\./gm)].map((m) => m[1]);
  over(stejne(kody, ["532/2025", "1/2026", "16/2026", "23/2026", "152/2026", "180/2026"]),
    "tabulka: jen od nástupu vlády (včetně 15. 12.), bez sdělení a nálezů, podle data vyhlášení", kody);
  over(/^- 152\/2026 Sb\. \| zákon \| vyhlášeno 26\. 8\. 2026 \| Zákon, kterým se mění/m.test(t),
    "řádek tabulky: číslo | druh | datum vyhlášení | název");
  over(t.split("\n").every((r) => r.length < 200) && t.includes("…"), "dlouhé názvy se zkracují");
}

// --- podklady pro ověřovatele ---
{
  const s = popisProOverovatele({ overene: [predpisy.get("360/2025")], neexistujici: ["270/2026"] }, true);
  over(s.includes("360/2025 Sb. existuje: „Zákon, kterým se mění některé zákony v souvislosti s přijetím zákona o jednotném")
      && s.includes("270/2026 Sb. V E-SBÍRCE NEEXISTUJE"),
    "ověřovatel vidí oficiální název (pozná, že 360/2025 není o rodičovském příspěvku) i neexistující číslo", s);
  over(popisProOverovatele(undefined, true).includes("necituje žádný předpis"), "doklad bez předpisu");
  over(popisProOverovatele(undefined, false).includes("nepodařilo načíst"), "nenačtený rejstřík se přizná");
}

// --- načtení z API, včetně výpadku ---
{
  const ok = await nactiRejstrik({
    roky: [2025, 2026],
    fetchFn: async (url, opt) => ({ ok: true, json: async () => fixtura[String(JSON.parse(opt.body).rok)] }),
  });
  over(ok.predpisy && ok.predpisy.size === 11 && ok.chyba === null, "načtení obou let", ok.chyba);
  const http = await nactiRejstrik({ roky: [2026], fetchFn: async () => ({ ok: false, status: 503 }) });
  over(http.predpisy === null && /503/.test(http.chyba), "HTTP chyba → bez rejstříku, s důvodem", http);
  const vyjimka = await nactiRejstrik({ roky: [2026], fetchFn: async () => { throw new Error("ETIMEDOUT"); } });
  over(vyjimka.predpisy === null && /ETIMEDOUT/.test(vyjimka.chyba), "výpadek sítě nevyhodí výjimku", vyjimka);
  const prazdno = await nactiRejstrik({ roky: [2026], fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  over(prazdno.predpisy === null, "prázdná odpověď se nebere jako rejstřík bez předpisů", prazdno);
}

// --- znění předpisu pro ověřovatele ---
{
  const zFixtury = async (url) => {
    const kod = decodeURIComponent(url).match(/\/sb\/(\d{4})\/(\d+)\/fragmenty/);
    const j = kod && fixturaZneni[`${kod[2]}/${kod[1]}`];
    return j ? { ok: true, json: async () => j } : { ok: false, status: 400 };
  };
  const z91 = await nactiZneni({ kod: "91/2026" }, { fetchFn: zFixtury });
  over(z91.stav === "ok" && z91.text.includes("se číslo „2026“ nahrazuje číslem „2027“") && !/<|&nbsp;/.test(z91.text),
    "1.3: znění 91/2026 ukáže, že novela jen posouvá lhůtu (bez značek a entit)", z91);
  const z90 = await nactiZneni({ kod: "90/2026" }, { fetchFn: zFixtury });
  over(z90.text.includes("ve znění pozdějších předpisů, se slova „30 % průměrné mzdy v roce 2024")
      && !z90.text.includes("160/1993"),
    "2.10: výčet třinácti novel se zkrátí na „ve znění pozdějších předpisů“, podstatná věta zůstane", z90.text);
  const z180 = await nactiZneni({ kod: "180/2026" }, { fetchFn: zFixtury });
  over(z180.stav === "nezpracovano" && z180.text === null,
    "180/2026 týden po vyhlášení: jen hlavička a poznámka o 30 dnech → „zatím nezpracované“, ne znění", z180);
  const kratke = await nactiZneni({ kod: "90/2026" }, { fetchFn: zFixtury, maxZnaku: 300 });
  over(kratke.text.length < 360 && kratke.text.endsWith("(zkráceno, celé znění v e-Sbírce)"), "dlouhé znění se zkrátí a přizná to", kratke.text);
  const chyba = await nactiZneni({ kod: "9999/2026" }, { fetchFn: zFixtury });
  const vyjimka = await nactiZneni({ kod: "91/2026" }, { fetchFn: async () => { throw new Error("ETIMEDOUT"); } });
  over(chyba.stav === "chyba" && /400/.test(chyba.chyba) && vyjimka.stav === "chyba" && /ETIMEDOUT/.test(vyjimka.chyba),
    "HTTP chyba i výpadek sítě vrátí stav „chyba“, nevyhodí výjimku", { chyba, vyjimka });

  const p91 = { kod: "91/2026", nazev: "Zákon, kterým se mění zákon č. 283/2021 Sb., stavební zákon, ve znění pozdějších předpisů", vyhlaseno: "2026-06-10" };
  const s1 = popisProOverovatele({ overene: [p91] }, true, new Map([["91/2026", z91]]));
  over(s1.includes("91/2026 Sb. existuje") && s1.includes("Znění podle e-Sbírky:") && s1.includes("nahrazuje číslem „2027“"),
    "ověřovatel dostane u předpisu jeho znění", s1);
  const s2 = popisProOverovatele({ overene: [predpisy.get("180/2026")] }, true, new Map([["180/2026", z180]]));
  over(s2.includes("zatím nezpracovala") && s2.includes("podle názvu a vyhledávání"), "nezpracované znění se ověřovateli přizná", s2);
  over(!popisProOverovatele({ overene: [p91] }, true).includes("Znění"), "bez mapy znění (prostřední přechod) jen název jako dřív");
}

// --- laťka na „splněno“ s rejstříkem (lib/dukaz.js) ---
{
  const z = { minDelkaDokladu: 20, nastup: "2025-12-15T00:00:00" };
  const mf = [{ url: "https://mf.gov.cz/cs/ministerstvo/media/tiskove-zpravy/2026/x" }];
  const fake = "Zákon č. 270/2026 Sb., vyhlášen ve Sbírce zákonů 22. září 2026; prezident zákon podepsal 17. září 2026";
  over(duvodDegradace("fulfilled", fake, "2026-09-22", { ...z, zdroje: mf, rejstrik: predpisy }) === "neexistujici-predpis",
    "2.3: „splněno“ na neexistujícím 270/2026 → neexistujici-predpis");
  const pravy = "Zákon č. 152/2026 Sb., kterým se mění zákon č. 117/1995 Sb., vyhlášen ve Sbírce zákonů 26. srpna 2026";
  over(duvodDegradace("fulfilled", pravy, "2026-08-26", { ...z, zdroje: mf, rejstrik: predpisy }) === null,
    "10.4: „splněno“ na ověřeném 152/2026 projde i bez odkazu do e-Sbírky mezi zdroji");
  over(duvodDegradace("fulfilled", pravy, "2026-08-26", { ...z, zdroje: mf }) === "sbirka-bez-uredniho-zdroje",
    "bez rejstříku platí dosavadní zábrana (data už venku se kontrolují stejně jako dřív)");
  over(duvodDegradace("fulfilled", "Zákon č. 360/2025 Sb., vyhlášen ve Sbírce zákonů 29. září 2025",
    "2025-09-29", { ...z, zdroje: mf, rejstrik: predpisy }) === "predates-term",
    "předpis předchozí vlády srazí datum (s oficiálním datem z e-Sbírky to funguje vždy)");
  over(duvodDegradace("partial", fake, "2026-09-22", { ...z, zdroje: mf, rejstrik: predpisy }) === null,
    "„částečně“ s neexistujícím číslem stav nesráží (vypíše se jen v logu)");
}

console.log(spadlo ? `\n${spadlo} selhání z ${kontrol} kontrol.` : `\nVšech ${kontrol} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
