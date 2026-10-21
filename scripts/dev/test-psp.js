/* scripts/dev/test-psp.js — otevřená data Poslanecké sněmovny (spec 006), offline a zdarma.
 *
 *     node scripts/dev/test-psp.js
 *
 * Fixtura je výřez skutečných dat (fixtury/psp-tisky.json, stažen 21. 10. 2026):
 *   - tisk 11 → zákon 90/2026 Sb. (bod 2.10): poslanecký návrh, ne vládní,
 *   - tisk 198 → zákon 152/2026 Sb. (bod 10.4, rodičovský příspěvek),
 *   - tisk 189 → zákon 180/2026 Sb. (evidence tržeb),
 *   - tisk 11 z 9. období, který se do aktuálního nesmí přimíchat.
 * Ověřuje čtení UNL (zpětné lomítko), rozbalení ZIPu bez závislosti, model
 * tisků a texty, které z nich dostane kontrola faktů.
 */
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { unl, rozbalZip, modelTisku, zdrojTisku, zdrojSeznamu, nactiTisky, VETA_UPLNOSTI } from "../lib/psp.js";

const fx = JSON.parse(readFileSync(new URL("./fixtury/psp-tisky.json", import.meta.url), "utf8"));
let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};

console.log("Formát UNL a ZIP");
over(JSON.stringify(unl("a|b\\|c|d\\\nx|\n1|2|\r\n")) === JSON.stringify([["a", "b|c", "d\nx"], ["1", "2"]]),
  "zpětné lomítko ruší „|“ i konec řádku; CRLF i koncové „|“", unl("a|b\\|c|d\\\nx|\n1|2|\r\n"));
// Malý ZIP sestavený v testu: jeden soubor uložený, jeden komprimovaný.
function zip(soubory) {
  const casti = [], adresar = [];
  let offset = 0;
  for (const [jmeno, obsah, komprimovat] of soubory) {
    const data = komprimovat ? deflateRawSync(obsah) : obsah;
    const jm = Buffer.from(jmeno, "latin1");
    const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(komprimovat ? 8 : 0, 8);
    lokal.writeUInt32LE(data.length, 18); lokal.writeUInt32LE(obsah.length, 22); lokal.writeUInt16LE(jm.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(komprimovat ? 8 : 0, 10);
    cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(obsah.length, 24); cd.writeUInt16LE(jm.length, 28); cd.writeUInt32LE(offset, 42);
    casti.push(lokal, jm, data); adresar.push(cd, jm);
    offset += 30 + jm.length + data.length;
  }
  const cdBuf = Buffer.concat(adresar);
  const konec = Buffer.alloc(22); konec.writeUInt32LE(0x06054b50, 0); konec.writeUInt16LE(soubory.length, 8); konec.writeUInt16LE(soubory.length, 10);
  konec.writeUInt32LE(cdBuf.length, 12); konec.writeUInt32LE(offset, 16);
  return Buffer.concat([...casti, cdBuf, konec]);
}
const z = rozbalZip(zip([["a.unl", Buffer.from("1|x|\n"), false], ["b.unl", Buffer.from("2|y|\n".repeat(50)), true]]));
over(z.get("a.unl").toString() === "1|x|\n" && z.get("b.unl").toString() === "2|y|\n".repeat(50), "ZIP: uložený i komprimovaný soubor");
over(new TextDecoder("windows-1250").decode(Buffer.from([0x9e, 0xe1, 0xe8])) === "žáč", "windows-1250 dekóduje Node bez závislosti");

console.log("\nModel tisků (skutečná data, 10. období)");
const m = modelTisku(new Map(Object.entries(fx).filter(([k]) => k.endsWith(".unl"))), { obdobi: "174" });
over(m.cisloObdobi === 10 && m.tisky.map((t) => t.ct).join() === "4,10,11,189,198", "jen tisky 10. období; tisk 11 z 9. období vynechán", m.tisky.map((t) => t.ct));
const t11 = m.podleSb.get("90/2026"), t198 = m.podleSb.get("152/2026"), t189 = m.podleSb.get("180/2026");
over(t11 && t11.ct === 11 && t11.druh === "Návrh zákona" && /Schillerová/.test(t11.navrhovatel), "90/2026 Sb. (bod 2.10) vznikl z poslaneckého tisku 11, ne z vládního", t11 && { ct: t11.ct, druh: t11.druh, navrhovatel: t11.navrhovatel });
over(t198 && t198.ct === 198 && t198.druh === "Vládní návrh zákona" && t198.predlozeno === "2026-05-22", "152/2026 Sb. (bod 10.4): vládní tisk 198 předložený 22. 5. 2026", t198 && { ct: t198.ct, predlozeno: t198.predlozeno });
over(t189 && t189.ct === 189, "180/2026 Sb. → tisk 189 (evidence tržeb)");
const vyhl198 = t198 && t198.kroky.find((k) => k.sb === "152/2026");
over(vyhl198 && vyhl198.vyhlaseno === "2026-08-26", "datum vyhlášení 152/2026 ze Sněmovny sedí s e-Sbírkou (26. 8. 2026)", vyhl198);

console.log("\nTexty pro kontrolu faktů");
const zt = zdrojTisku(m, t198);
over(zt.url === "https://www.psp.cz/sqw/historie.sqw?o=10&t=198" && zt.text.includes("Předloženo 22. května 2026") && zt.text.includes("pod č. 152/2026 Sb. dne 26. srpna 2026"),
  "průběh tisku: odkaz na psp.cz, předložení i vyhlášení česky", zt.text.slice(0, 300));
over(!/\?\s/.test(zt.text.split("Průběh:")[1] || ""), "krok bez data nemá v textu otazník");
const zs = zdrojSeznamu(m, "2026-10-21");
over(zs.text.includes(VETA_UPLNOSTI) && zs.text.includes("tisk 198 — ") && /tisk 198 — [^\n]*\(vláda;/.test(zs.text) && !/9\. volebním/.test(zs.text),
  "úplný seznam: věta o úplnosti, vládní návrh označený „vláda“", zs.text.slice(0, 300));

console.log("\nVýpadek Sněmovny");
const r = await nactiTisky({ fetchFn: async () => ({ ok: false, status: 503 }) });
over(r.model === null && r.chyba === "HTTP 503", "HTTP chyba → bez dat, s důvodem; nic se nevyhodí", r);
const r2 = await nactiTisky({ fetchFn: async () => { throw new Error("ECONNRESET"); } });
over(r2.model === null && /ECONNRESET/.test(r2.chyba), "síťová chyba → bez dat, s důvodem", r2);

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
