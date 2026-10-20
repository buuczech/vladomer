/* scripts/dev/test-faktcheck.js — deterministická kontrola faktů (spec 004, vrstva D), offline a zdarma.
 *
 *     node scripts/dev/test-faktcheck.js
 *
 * Případy jsou skutečné texty z public/evaluations.json a audit.json:
 *   - 1.2 a 15.4 (data k 20. 10. 2026): doklad vydává zákon předchozí vlády
 *     za vyhlášený 31. 12. 2025, e-Sbírka říká 15. 7. a 16. 6. 2025 — to
 *     našla vrstva D při prvním ostrém běhu a revize zlaté sady ne,
 *   - 2.3 a 10.4 z auditu: smyšlená čísla 270/2026 a 233/2026, kvůli kterým
 *     se 14.–15. 10. 2026 ručně opravovalo,
 *   - 11.9 a 14.1: falešné poplachy, na kterých se kalibrovalo porovnání
 *     češtiny a angličtiny („8. červen“ v 1. pádě; „devět procent“ slovy).
 * Rejstřík jsou výřezy skutečných odpovědí e-Sbírky (fixtury/).
 */
import { readFileSync } from "node:fs";
import { predpisyZOdpovedi } from "../lib/sbirka.js";
import { kontrolaBodu, datumyCs, datumyEn, znackySb, citovaneRoky } from "../lib/faktcheck/deterministicky.js";

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtury/${n}`, import.meta.url), "utf8"));
const rejstrikFx = fx("sbirka-rejstrik.json");
const rejstrik2025 = fx("faktcheck-rejstrik-2025.json");
const REJSTRIK = new Map([
  ...predpisyZOdpovedi(rejstrikFx["2025"]), ...predpisyZOdpovedi(rejstrik2025["2025"]), ...predpisyZOdpovedi(rejstrikFx["2026"]),
].map((p) => [p.kod, p]));
const KONTEXT = { dnes: "2026-10-16", nastup: "2025-12-15", rejstrik: REJSTRIK };

let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`); }
};
const bod = (prepis) => ({ status: "partial", evidence: "", comment: { cs: "Text.", en: "Text." }, change: { cs: "", en: "" }, sources: [], ...prepis });
const pravidla = (n) => n.map((x) => `${x.pravidlo}:${x.zavaznost}`);

console.log("Čtení dat a značek");
over(datumyCs("schválila 8. červen 2026 a 8. června 2026, pak 16. 12. 2025").sort().join() === "2025-12-16,2026-06-08,2026-06-08", "datumyCs: 1. i 2. pád měsíce, číslem");
over(datumyCs("v červenci 2026 a 3. července 2026").join() === "2026-07-03", "datumyCs: „červenec“ se nesplete s „červen“, měsíc bez dne se nečte");
over(datumyEn("on June 8, 2026 and 16 Dec 2025").sort().join() === "2025-12-16,2026-06-08", "datumyEn: oba anglické zápisy");
over(znackySb("zákon č. 152/2026 Sb. a Act No. 180/2026 Coll.").join() === "152/2026,180/2026", "znackySb: česky i anglicky");
over(citovaneRoky({ a: { evidence: "zákon č. 117/1995 Sb.", comment: { cs: "a 180/2026 Sb." } } }).join() === "1995,2026", "citovaneRoky pro načtení rejstříku");

console.log("\nPředpisy proti e-Sbírce (skutečné doklady)");
let n = kontrolaBodu("1.2", bod({ evidence: "Zákon č. 236/2025 Sb., vyhlášen 31. 12. 2025; eŽádanky spuštěny od 2. 1. 2026 (dobrovolně); povinné od 1. 7. 2027 dle novely v přípravě", evidenceDate: "2025-12-31" }), KONTEXT);
over(n.some((x) => x.pravidlo === "datum-vyhlaseni" && x.zavaznost === "CHYBA" && x.nesestav), "1.2: 236/2025 Sb. „vyhlášen 31. 12. 2025“ → CHYBA (e-Sbírka 15. 7. 2025)", pravidla(n));
n = kontrolaBodu("15.4", bod({ evidence: "Zákon č. 176/2025 Sb., vyhlášen 31. prosince 2025; účinný od 1. ledna 2026 – daňový odpočet úroků z úvěrů bytových družstev", evidenceDate: "2025-12-31" }), KONTEXT);
over(n.some((x) => x.pravidlo === "datum-vyhlaseni" && x.zavaznost === "CHYBA"), "15.4: 176/2025 Sb. „vyhlášen 31. prosince 2025“ (slovem) → CHYBA (e-Sbírka 16. 6. 2025)", pravidla(n));
n = kontrolaBodu("2.3", bod({ evidence: "Zákon č. 270/2026 Sb., vyhlášen ve Sbírce zákonů 22. září 2026; prezident Petr Pavel zákon podepsal 17. září 2026", evidenceDate: "2026-09-22" }), KONTEXT);
over(n.some((x) => x.pravidlo === "neexistujici-predpis" && x.zavaznost === "CHYBA" && x.nesestav), "2.3 (audit 9. 10.): smyšlený 270/2026 Sb. → CHYBA, nese stav", pravidla(n));
n = kontrolaBodu("10.4", bod({ status: "fulfilled", evidence: "Zákon č. 233/2026 Sb., kterým se mění zákon č. 117/1995 Sb., o státní sociální podpoře, podepsaný prezidentem Petrem Pavlem dne 17. srpna 2026.", evidenceDate: "2026-08-17" }), KONTEXT);
over(n.filter((x) => x.pravidlo === "neexistujici-predpis").map((x) => x.text).join().includes("233/2026") && !n.some((x) => x.text.includes("117/1995")),
  "10.4 (audit 21. 8.): smyšlený 233/2026 → CHYBA, novelizovaný 117/1995 se nechá (rok mimo rejstřík)", pravidla(n));
n = kontrolaBodu("2.3", bod({ status: "fulfilled", evidence: "Zákon č. 180/2026 Sb., vyhlášen 7. 10. 2026", evidenceDate: "2026-10-07",
  sbirka: { overene: [{ kod: "180/2026", nazev: "Zákon o evidenci tržeb", vyhlaseno: "2026-10-07", url: "https://e-sbirka.gov.cz/sb/2026/180" }], neexistujici: [] } }), KONTEXT);
over(!n.some((x) => x.zavaznost === "CHYBA"), "2.3 dnes (180/2026 Sb., vyhlášen 7. 10. 2026) → bez chyby", pravidla(n));
n = kontrolaBodu("2.3", bod({ status: "fulfilled", evidence: "Zákon č. 180/2026 Sb., vyhlášen 7. 10. 2026", evidenceDate: "2026-09-22",
  sbirka: { overene: [{ kod: "180/2026", nazev: "Zákon o evidenci tržeb", vyhlaseno: "2026-10-07", url: "x" }], neexistujici: [] } }), KONTEXT);
over(n.some((x) => x.pravidlo === "datum-dokladu-vs-sbirka" && x.zavaznost === "VAROVANI"), "odvozeno z 2.3: „splněno“ s datem dokladu jiným než vyhlášení → VAROVÁNÍ", pravidla(n));
n = kontrolaBodu("1.2", bod({ evidence: "Zákon č. 236/2025 Sb., vyhlášen 31. 12. 2025" }), { ...KONTEXT, rejstrik: null });
over(!n.some((x) => /predpis|vyhlaseni/.test(x.pravidlo)), "bez rejstříku (e-Sbírka nedostupná) se předpisy nesoudí", pravidla(n));

console.log("\nData dokladů");
n = kontrolaBodu("3.2", bod({ evidenceDate: "2025-10-01", evidence: "Superdávka od 1. 10. 2025 (zákon č. 108/2024 Sb.)" }), { ...KONTEXT, rejstrik: null });
over(n.some((x) => x.pravidlo === "doklad-pred-nastupem" && x.zavaznost === "VAROVANI"), "3.2: doklad z 1. 10. 2025 u „částečně“ → VAROVÁNÍ (ne chyba)", pravidla(n));
n = kontrolaBodu("x", bod({ status: "fulfilled", evidenceDate: "2026-11-02", evidence: "Nařízení vlády vyhlášeno 2. 11. 2026." }), { ...KONTEXT, rejstrik: null });
over(n.some((x) => x.pravidlo === "doklad-z-budoucnosti" && x.zavaznost === "CHYBA"), "odvozeno: doklad datovaný po dni běhu → CHYBA", pravidla(n));

console.log("\nČeština ↔ angličtina (kalibrace na skutečných textech)");
n = kontrolaBodu("11.9", bod({ comment: {
  cs: "Vláda pracuje na reformě veřejného zdravotního pojištění: schválila návrh novely o zvýšení plateb státu za státní pojištěnce o 24 miliard Kč (8. červen 2026). Ano, ale: jedná se o návrh v legislativním procesu, nikoliv o schválený zákon. Reforma konkurence pojišťoven je plánována na rok 2028.",
  en: "The government is working on public health insurance reform: it approved a draft amendment to increase state payments for state-insured persons by 24 billion CZK (June 8, 2026). However: this is a draft in the legislative process, not an approved law. Insurance company competition reform is planned for 2028.",
} }), KONTEXT);
over(!n.some((x) => x.pravidlo === "cs-en"), "11.9: „8. červen 2026“ = „June 8, 2026“ → bez nálezu", pravidla(n));
n = kontrolaBodu("14.1", bod({ comment: {
  cs: "Vláda se s odbory dohodla na zvýšení platů pracovníků v kultuře o devět procent od dubna 2026, což fakticky splňuje slib na zvýšení. Představuje částečné splnění, protože zvýšení je nižší, než původně požadovaly odbory (10 %).",
  en: "The government agreed with unions on a 9% salary increase for cultural workers from April 2026, which factually fulfills the promise. It represents partial fulfillment as the increase is lower than unions originally demanded (10%).",
} }), KONTEXT);
over(n.some((x) => x.pravidlo === "cs-en" && x.zavaznost === "VAROVANI") && !n.some((x) => x.zavaznost === "CHYBA"), "14.1: „devět procent“ slovy vs. „9 %“ → jen VAROVÁNÍ (posoudí model a člověk)", pravidla(n));

console.log("\nKomentář proti stavu");
n = kontrolaBodu("17.4", bod({ status: "partial", comment: { cs: "Ano, splněno: Vláda fakticky zrušila samostatnou funkci ministra pro vědu.", en: "Yes, fulfilled: the government abolished the separate post." } }), { ...KONTEXT, rejstrik: null });
over(n.some((x) => x.pravidlo === "polarita"), "odvozeno ze 17.4: „Ano, splněno:“ u stavu „částečně“ → VAROVÁNÍ", pravidla(n));
n = kontrolaBodu("17.4", bod({ status: "fulfilled", comment: { cs: "Ano, splněno: Vláda fakticky zrušila samostatnou funkci ministra pro vědu.", en: "Yes, fulfilled." } }), { ...KONTEXT, rejstrik: null });
over(!n.some((x) => x.pravidlo === "polarita"), "17.4 skutečně: „Ano, splněno:“ u „splněno“ → bez nálezu", pravidla(n));
n = kontrolaBodu("x", bod({ status: "partial", comment: { cs: "Částečně splněno: zákon prošel jen Sněmovnou.", en: "Partially fulfilled." } }), { ...KONTEXT, rejstrik: null });
over(!n.some((x) => x.pravidlo === "polarita"), "„Částečně splněno“ u „částečně“ se nesplete se „splněno“", pravidla(n));

console.log("\nNestabilní čísla předpisů (skutečný audit 15.4, srpen–říjen 2026)");
const audit154 = [
  ["2026-08-03", ""],
  ["2026-08-07", "zákon č. 586/1992 Sb., Daňový zákon (novelizace účinná od 1. 1. 2026)"],
  ["2026-08-14", "zákon č. 250/2025 Sb., daňový odpočet na splátky družstevního podílu"],
  ["2026-08-21", "Daňový odpočet na družstevní bydlení (úroky z úvěru) od 1. ledna 2026 je součástí zákona o daních z příjmů"],
  ["2026-08-28", "Zákon č. 296/2025 Sb., vyhlášen 31. prosince 2025, zavedl daňový odpočet pro družstevní bydlení od 1. ledna 2026"],
  ["2026-09-04", "Zákon č. 404/2025 Sb., který zavedl daňový odpočet pro družstevní bydlení, vyhlášen 31. prosince 2025; účinný od 1. ledna 2026"],
  ["2026-09-25", "Zákon č. 128/2026 Sb., vyhlášen 1. srpna 2026, zavádí daňový odpočet úroků z bytového družstva od 1. ledna 2026"],
  ["2026-10-02", "Zákon č. 586/1992 Sb., účinný od 1. 1. 2026; daňový odpočet úroků z družstevního bydlení"],
  ["2026-10-16", "Zákon č. 176/2025 Sb., vyhlášen 31. prosince 2025; účinný od 1. ledna 2026 – daňový odpočet úroků z úvěrů bytových družstev"],
].map(([date, evidence]) => ({ id: "15.4", date, status: "partial", evidence }));
n = kontrolaBodu("15.4", bod({ evidence: audit154.at(-1).evidence }), { ...KONTEXT, rejstrik: null, auditBodu: audit154 });
const nest = n.find((x) => x.pravidlo === "nestabilni-predpisy");
over(nest && nest.zavaznost === "VAROVANI" && nest.text.includes("250/2025 → 296/2025 → 404/2025 → 128/2026 → 176/2025"),
  "15.4: pět různých čísel za stavu „částečně“ → VAROVÁNÍ (podpis fabulace); 586/1992 z let před 2025 se nepočítá", nest && nest.text);
n = kontrolaBodu("15.4", bod({ evidence: "x" }), { ...KONTEXT, rejstrik: null, auditBodu: [...audit154.slice(0, 6), { id: "15.4", date: "2026-09-10", status: "in_progress", evidence: "Zákon č. 1/2026 Sb." }, ...audit154.slice(6)] });
over(!n.some((x) => x.pravidlo === "nestabilni-predpisy"), "změna stavu počítadlo nuluje (po přechodu zbydou 2 sady: 128/2026 → 176/2025)", pravidla(n));

console.log("\n„Splněno“ s výhradou (Sonnet 5.5, bod 12.2, měření 20. 10. 2026)");
n = kontrolaBodu("12.2", bod({ status: "fulfilled", comment: {
  cs: "Ano, ale: funkce je zřízena a funguje. Přijímá podněty přes web a e-mail a vede pracovní skupinu. Ne, ale: ombudsman nedostal žádné nové pravomoci, jde o rozšířenou agendu stávajícího ředitele sekce.",
  en: "Yes, but: the office exists and works. No, but: the ombudsman received no new powers.",
} }), { ...KONTEXT, rejstrik: null });
over(n.some((x) => x.pravidlo === "splneno-s-vyhradou" && x.nesestav), "12.2: „splněno“ + „Ne, ale:“ → VAROVÁNÍ, nese stav", pravidla(n));
n = kontrolaBodu("12.2", bod({ status: "partial", comment: { cs: "Ano, ale: funkce je zřízena. Ne, ale: dohledatelnost původu chybí.", en: "x" } }), { ...KONTEXT, rejstrik: null });
over(!n.some((x) => x.pravidlo === "splneno-s-vyhradou"), "totéž u „částečně“ je v pořádku", pravidla(n));

console.log("\nNeměřitelnost podle vlastníka (scripts/nastaveni/nemeritelne.txt)");
n = kontrolaBodu("5.4", bod({ status: "broken", unverifiable: false }), { ...KONTEXT, rejstrik: null, nemeritelne: new Set(["5.4"]) });
over(n.some((x) => x.pravidlo === "nemeritelne-neuplatneno"), "5.4 na seznamu, na webu měřitelný → VAROVÁNÍ", pravidla(n));
n = kontrolaBodu("5.4", bod({ status: "broken", unverifiable: true }), { ...KONTEXT, rejstrik: null, nemeritelne: new Set(["5.4"]) });
over(!n.some((x) => x.pravidlo === "nemeritelne-neuplatneno"), "5.4 už neměřitelný → bez nálezu", pravidla(n));

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
