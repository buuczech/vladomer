/* scripts/dev/test-rozhodnuti.js — co z běhu smí na web (spec 004, vrstva R), offline a zdarma.
 *
 *     node scripts/dev/test-rozhodnuti.js
 *
 * Záznamy jsou skutečné (fixtury/rozhodnuti.json): web k 16. 10. 2026 a co
 * z něj udělal Sonnet 5.5 při měření 20. 10. 2026, včetně návrhů, které
 * brána podržela. Případy, na kterých celá vrstva stojí:
 *   - 10.2 „probíhá“ → „deklarováno“: návrh je správně (zlatá sada), ověřovatel
 *     ho pustil, ale doklad je týž — oprava bez události, rozhodne vlastník,
 *   - 7.2 „porušeno“, návrh „deklarováno“ podržela brána: když kontrola
 *     dosavadní stav zpochybní, jde návrh vlastníkovi (FR-009), jinak by
 *     chyba zůstala na webu navždy,
 *   - 12.2 „splněno“ přepsané, kontrola podle M1 říká „částečně“: podržet,
 *     a vlastník dostane návrh hodnotitele i kontroly,
 *   - 1.2: CHYBA vrstvy D (datum vyhlášení proti e-Sbírce) drží přepsaný bod,
 *   - 2.3 „částečně“ → „splněno“ na novém, potvrzeném dokladu: ven; při
 *     kalibraci čeká na vlastníka.
 * Výsledky vrstvy M jsou zatím sestavené ručně; první placený běh kontroly
 * faktů je nahradí skutečnými.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rozhodniBod, rozhodniBeh, problemyBodu, oznacAudit, upravSnimek, stavZaznamu } from "../lib/faktcheck/rozhodnuti.js";
import { novySoubor, proved, sloz, prikazyZKomentare, odkazRozhodnuti, prikazyZeSouboru, VETEV_BEHU } from "../lib/navrhy.js";

const fx = JSON.parse(readFileSync(new URL("./fixtury/rozhodnuti.json", import.meta.url), "utf8"));
let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`); }
};
const RAZITKO = "2026-10-20T10:00:00.000Z";
const orazitkuj = (e) => ({ ...e, overeno: RAZITKO });
// Výsledek vrstvy M k bodu, jak ho skládá scripts/faktcheck.js (shrnutiBodu).
const m = (s = {}) => ({ shrnuti: { vyvraceno: 0, neovereno: 0, potvrzeno: 1, spor_o_stav: false, stav_podle_pravidel: null, pravidlo: null, ...s }, finalni: { zduvodneni: "test" } });
const strucne = (r) => ({ akce: r.akce, problemy: r.problemy, vlastnik: r.vlastnik && r.vlastnik.typ });

console.log("Problémy z vrstev D a M");
over(problemyBodu([], null).join() === "m-nezkontrolovano", "bez vrstvy M je bod nezkontrolovaný — nikdy nevyjde jako ověřený");
over(problemyBodu(fx.nalezy_d, m()).join() === "d:datum-vyhlaseni", "1.2: drží jen CHYBA nesoucí stav, VAROVÁNÍ jdou do reportu", problemyBodu(fx.nalezy_d, m()));
over(problemyBodu([], m({ vyvraceno: 1, neovereno: 2, spor_o_stav: true })).join() === "m-vyvraceno,m-neovereno,m-spor", "M: vyvráceno, neověřeno, spor");

console.log("\nOpravy bez události (FR-009)");
let r = rozhodniBod({ bod: "10.2", pred: fx.pred["10.2"], po: fx.po["10.2"], m: m() });
over(r.akce === "podrzet" && r.vlastnik.typ === "oprava-bez-udalosti" && r.zaznam === fx.pred["10.2"], "10.2: nový stav na tomtéž dokladu → podržet, vlastník rozhodne", strucne(r));
over(stavZaznamu(r.vlastnik.navrh.zaznam) === "declared", "10.2: vlastník dostane návrh „deklarováno“ (pravda podle zlaté sady)");

const po72 = orazitkuj(fx.pred["7.2"]); // brána podržela: celý minulý záznam + razítko
r = rozhodniBod({ bod: "7.2", pred: fx.pred["7.2"], po: po72, m: m({ spor_o_stav: true, stav_podle_pravidel: "declared", pravidlo: "M7" }), neprijaty: fx.neprijate["7.2"] });
over(r.akce === "bez-razitka" && r.zaznam === fx.pred["7.2"] && r.zaznam.overeno !== RAZITKO, "7.2: zpochybněný stav zůstane bez nového razítka „prověřeno“ (staré z 16. 10. platí dál)", strucne(r));
over(r.vlastnik.typ === "oprava-bez-udalosti" && stavZaznamu(r.vlastnik.navrh.zaznam) === "declared" && r.vlastnik.navrh.brana.duvod === "zapadka-bez-datovaneho-dokladu",
  "7.2: podržený návrh „deklarováno“ jde vlastníkovi i s důvodem brány", r.vlastnik);
r = rozhodniBod({ bod: "7.2", pred: fx.pred["7.2"], po: po72, m: m(), neprijaty: fx.neprijate["7.2"] });
over(r.akce === "zverejnit" && !r.vlastnik && r.zaznam.overeno === RAZITKO, "7.2: když kontrola dosavadní stav potvrdí, brána měla pravdu — nic k rozhodnutí", strucne(r));

console.log("\nPřepsané záznamy");
r = rozhodniBod({ bod: "12.2", pred: fx.pred["12.2"], po: fx.po["12.2"], m: m({ spor_o_stav: true, stav_podle_pravidel: "partial", pravidlo: "M1" }) });
over(r.akce === "podrzet" && r.zaznam === fx.pred["12.2"] && r.vlastnik.typ === "podrzeno", "12.2: přepsaný „splněno“ ve sporu s pravidly → celý předchozí záznam", strucne(r));
over(r.vlastnik.kontrola && r.vlastnik.kontrola.stav === "partial" && r.vlastnik.kontrola.pravidlo === "M1", "12.2: vlastník dostane i návrh kontroly („částečně“, M1)", r.vlastnik.kontrola);

const po12 = { ...fx.pred["1.2"], comment: { ...fx.pred["1.2"].comment, cs: `${fx.pred["1.2"].comment.cs} Doplněno.` }, updatedAt: RAZITKO };
r = rozhodniBod({ bod: "1.2", pred: fx.pred["1.2"], po: po12, nalezyD: fx.nalezy_d, m: m() });
over(r.akce === "podrzet" && r.problemy.includes("d:datum-vyhlaseni"), "1.2: CHYBA vrstvy D drží přepsaný bod i při čisté vrstvě M", strucne(r));
r = rozhodniBod({ bod: "1.2", pred: fx.pred["1.2"], po: orazitkuj(fx.pred["1.2"]), nalezyD: fx.nalezy_d, m: m() });
over(r.akce === "bez-razitka" && r.vlastnik.typ === "uz-zverejneno", "1.2: táž chyba v nezměněném záznamu — podržení nepomůže, jde k vlastníkovi", strucne(r));

console.log("\nPřechod na novém dokladu (2.3 „částečně“ → „splněno“)");
const pred23 = { ...fx.pred["2.3"], status: "partial", evidence: fx.predchozi_2_3.evidence, updatedAt: `${fx.predchozi_2_3.date}T09:00:00.000Z` };
const po23 = orazitkuj(fx.pred["2.3"]);
r = rozhodniBod({ bod: "2.3", pred: pred23, po: po23, m: m({ potvrzeno: 2 }) });
over(r.akce === "zverejnit" && !r.vlastnik && r.zaznam === po23, "potvrzená událost, čistá kontrola → ven", strucne(r));
r = rozhodniBod({ bod: "2.3", pred: pred23, po: po23, m: m({ potvrzeno: 0 }) });
over(r.akce === "podrzet" && r.problemy.includes("prechod-bez-potvrzene-udalosti"), "bez potvrzeného tvrzení nesoucího stav se přechod nezveřejní", strucne(r));
r = rozhodniBod({ bod: "2.3", pred: pred23, po: po23, m: m({ potvrzeno: 2 }), kalibrace: true });
over(r.akce === "podrzet" && r.vlastnik.typ === "kalibrace", "kalibrace: i ověřený přechod čeká na vlastníka", strucne(r));
r = rozhodniBod({ bod: "2.3", pred: pred23, po: po23, m: m({ neovereno: 1 }) });
over(r.akce === "podrzet" && r.vlastnik.typ === "podrzeno", "neověřené tvrzení nesoucí stav → podržet", strucne(r));

r = rozhodniBod({ bod: "2.3", pred: pred23, po: po23, m: m({ potvrzeno: 2, neovereno_absence: 1 }) });
over(r.akce === "podrzet" && r.problemy.includes("m-neovereno-absence"), "změna stavu na neověřeném tvrzení, že něco nenastalo → podržet (vlastník, 21. 10. 2026)", strucne(r));

console.log("\nNezměněné záznamy");
r = rozhodniBod({ bod: "6.6", pred: fx.pred["6.6"], po: orazitkuj(fx.pred["6.6"]), m: m({ neovereno_absence: 2 }) });
over(r.akce === "zverejnit" && !r.vlastnik, "nezměněný bod kvůli neověřené absenci nedrží", strucne(r));
r = rozhodniBod({ bod: "2.3", pred: fx.pred["2.3"], po: po23, m: m() });
over(r.akce === "zverejnit" && r.zaznam.overeno === RAZITKO, "kontrola potvrdila → razítko „prověřeno beze změny“ platí", strucne(r));
r = rozhodniBod({ bod: "2.3", pred: fx.pred["2.3"], po: po23, m: null });
over(r.akce === "bez-razitka" && r.vlastnik.typ === "nezkontrolovano" && r.zaznam.overeno === fx.pred["2.3"].overeno, "nezkontrolovaný bod nedostane razítko", strucne(r));
r = rozhodniBod({ bod: "6.6", pred: fx.pred["6.6"], po: orazitkuj(fx.pred["6.6"]), m: m({ spor_o_stav: true, stav_podle_pravidel: "declared", pravidlo: "M7" }) });
over(r.vlastnik.typ === "spor" && r.vlastnik.navrh.zdroj === "kontrola", "spor bez návrhu hodnotitele → vlastník dostane návrh kontroly", r.vlastnik);

console.log("\nCelý běh: web, historie, audit");
const pred = { ...fx.pred, "2.3": pred23 };
const po = { "2.3": po23, "7.2": po72, "10.2": fx.po["10.2"], "12.2": fx.po["12.2"], "1.2": orazitkuj(fx.pred["1.2"]), "6.6": orazitkuj(fx.pred["6.6"]) };
const modelova = { body: { "2.3": m({ potvrzeno: 2 }), "7.2": m({ spor_o_stav: true, stav_podle_pravidel: "declared" }), "10.2": m(), "12.2": m({ spor_o_stav: true, stav_podle_pravidel: "partial" }), "1.2": m(), "6.6": m() } };
const beh = rozhodniBeh({ pred, po, nalezy: fx.nalezy_d, modelova, neprijate: fx.neprijate });
over(beh.souhrn.zverejneno === 2 && beh.souhrn.podrzeno.join() === "10.2,12.2" && beh.souhrn.bez_razitka.join() === "7.2,1.2", "souhrn: 2 ven (2.3, 6.6), 2 podržené, 2 bez razítka", beh.souhrn);
over(beh.evals["10.2"] === fx.pred["10.2"] && beh.evals["2.3"] === po23, "na web jde předchozí záznam podržených a nový u ověřených");
const dnes = RAZITKO.slice(0, 10);
const snimky = [{ date: dnes, statuses: { "10.2": "declared", "12.2": "fulfilled", "2.3": "fulfilled" } }];
over(upravSnimek(snimky, dnes, beh.evals, beh.body) && snimky[0].statuses["10.2"] === "in_progress" && snimky[0].statuses["2.3"] === "fulfilled", "dnešní snímek historie nese stav, který je na webu");
const audit = [
  { id: "10.2", date: "2026-10-16", status: "in_progress" },
  { id: "10.2", date: dnes, status: "declared" },
  { id: "2.3", date: dnes, status: "fulfilled" },
  { id: "12.2", date: dnes, status: "fulfilled", oprava: "ruční" },
];
const n = oznacAudit(audit, dnes, beh.body);
over(n === 1 && audit[1].zadrzeno === true && audit[1].faktcheck.includes("prechod-bez-noveho-dokladu"), "dnešní řádek podrženého 10.2 nese zadrzeno a důvod", audit[1]);
over(!audit[0].zadrzeno && !audit[2].zadrzeno && !audit[3].zadrzeno, "starší řádky, zveřejněné body a opravy se nemění (append-only)");

console.log("\nNeměřitelnost podle vlastníka (nemeritelne.txt)");
{
  const pred54 = { status: "broken", unverifiable: false, evidence: "x", comment: { cs: "a", en: "a" }, updatedAt: "2026-10-16T10:00:00Z" };
  const drzeny = { ...pred54, overeno: "2026-11-01T06:00:00Z", unverifiable: true }; // evaluate.js: brána podržela, rozhodnutí vlastníka platí
  const nem = new Set(["5.4"]);
  const a = rozhodniBod({ bod: "5.4", pred: pred54, po: drzeny, m: { shrnuti: { potvrzeno: 1 } }, kalibrace: true, nemeritelne: nem });
  over(a.akce === "zverejnit" && !a.vlastnik && a.zaznam.unverifiable, "záznam liší jen neměřitelností podle vlastníka: zveřejní se, k vlastníkovi nejde (ani v kalibraci)", a);
  const b = rozhodniBod({ bod: "5.4", pred: pred54, po: drzeny, nalezyD: [{ bod: "5.4", zavaznost: "CHYBA", pravidlo: "x", nesestav: true }], m: { shrnuti: { vyvraceno: 1 } }, nemeritelne: nem });
  over(b.akce === "bez-razitka" && b.zaznam.unverifiable === true, "i bez razítka zůstane bod neměřitelný", b.zaznam);
  const prepsany = { ...pred54, status: "declared", unverifiable: true, evidence: "y", comment: { cs: "b", en: "b" }, updatedAt: "2026-11-01T06:00:00Z" };
  const c = rozhodniBod({ bod: "5.4", pred: pred54, po: prepsany, m: { shrnuti: { vyvraceno: 1 } }, nemeritelne: nem });
  over(c.akce === "podrzet" && c.zaznam.status === "broken" && c.zaznam.unverifiable === true, "podržený přepis: předchozí záznam, ale neměřitelný", c.zaznam);
  const d = rozhodniBod({ bod: "5.4", pred: pred54, po: drzeny, m: { shrnuti: { potvrzeno: 1 } } });
  over(d.vlastnik, "bez seznamu vlastníka jde změna neměřitelnosti k vlastníkovi jako dřív", d);
}

console.log("\nPR s návrhy (lib/navrhy.js)");
const rozh = { beh: dnes, body: beh.body };
const soubor = novySoubor({ rozhodnuti: rozh, zaklad: "abc123" });
over(Object.keys(soubor.navrhy).sort().join() === "10.2,12.2,7.2" && Object.keys(soubor.prijate).sort().join() === "10.2,12.2,7.2",
  "návrhy hodnotitele jdou do PR a ve výchozím stavu jsou přijaté (Merge = přijmout)", Object.keys(soubor.navrhy));
const vyvr = novySoubor({ rozhodnuti: { beh: dnes, body: { "2.3": { bod: "2.3", problemy: ["m-vyvraceno"], vlastnik: { typ: "podrzeno", navrh: { zdroj: "hodnotitel", zaznam: po23 } } } } }, zaklad: "abc" });
over(vyvr.navrhy["2.3"].vyvraceny && !vyvr.prijate["2.3"], "návrh s vyvráceným tvrzením se jen vypíše, přijatý není");
over(!proved(vyvr, { prikaz: "prijmout", bod: "2.3" }).ok && proved(vyvr, { prikaz: "prijmout", bod: "2.3", duvod: "Zdroj je zastaralý, platí novější." }).ok,
  "vyvrácený návrh jde přijmout jen s důvodem");
over(proved(soubor, { prikaz: "podrzet", bod: "12.2" }).ok && !soubor.prijate["12.2"], "/podrzet vrátí bod na minulý záznam");
over(!proved(soubor, { prikaz: "prijmout", bod: "5.5" }).ok, "bod bez návrhu příkaz odmítne");

const zakladPR = { faktcheck: { body: { "10.2": { akce: "podrzet" }, "12.2": { akce: "podrzet" } } }, evals: { evals: { ...beh.evals } }, audit: { entries: [{ id: "10.2", date: dnes, status: "declared", model: "claude-sonnet-5-5", zadrzeno: true, faktcheck: ["prechod-bez-noveho-dokladu"] }] }, hist: { snapshots: [{ date: dnes, statuses: { "10.2": "in_progress" } }] } };
const slozeno = sloz(soubor, zakladPR, "2026-10-22");
const stejne = (x, y) => JSON.stringify(x) === JSON.stringify(y);
over(stejne(slozeno.evals.evals["10.2"], fx.po["10.2"]) && stejne(slozeno.evals.evals["12.2"], fx.pred["12.2"]), "větev: přijatý návrh na webu, podržený bod beze změny");
const novy = slozeno.audit.entries.find((r) => r.id === "10.2" && r.oprava);
over(novy && novy.date === "2026-10-22" && novy.model === "claude-sonnet-5-5" && novy.oprava.puvodni_status === "in_progress" && novy.oprava.prijato_z_behu === dnes,
  "přijetí je nový řádek auditu s „oprava“ (append-only), s modelem, který návrh napsal", novy);
over(slozeno.hist.snapshots[0].statuses["10.2"] === "declared" && zakladPR.evals.evals["10.2"] === beh.evals["10.2"], "snímek běhu nese přijatý stav; vstup se nemění");
over(!slozeno.faktcheck.body["10.2"] && slozeno.faktcheck.body["12.2"], "přijatý bod zmizí z faktcheck.json (web u něj přestane ukazovat „čeká na ověření“)", slozeno.faktcheck);

over(JSON.stringify(prikazyZKomentare("Díky!\n/prijmout 10.2\n /podrzet 12.2 \n/prijmout 2.3 duvod: zdroj je zastaralý\n/prijmout 7.2; rm -rf /\n/prijmout 7.2 `x`")) === JSON.stringify([
  { prikaz: "prijmout", bod: "10.2", duvod: null }, { prikaz: "podrzet", bod: "12.2", duvod: null }, { prikaz: "prijmout", bod: "2.3", duvod: "zdroj je zastaralý" },
]), "příkazy z komentáře: jen celé řádky známého tvaru, nic navíc", prikazyZKomentare("/prijmout 7.2; rm -rf /"));
over(JSON.stringify(prikazyZKomentare("/zverejnit\n/zverejnit teď")) === JSON.stringify([{ prikaz: "zverejnit" }]), "/zverejnit jen sám na řádku");

console.log("\nOdkazy z e-mailu (rozhodnutí jedním klepnutím)");
const odkaz = odkazRozhodnuti("buuczech/vladomer", "beh/2026-11", "/prijmout 10.2");
const u = new URL(odkaz);
over(u.origin + u.pathname === "https://github.com/buuczech/vladomer/new/beh/2026-11" && u.searchParams.get("filename") === "rozhodnuti/10.2-prijmout.txt"
  && u.searchParams.get("value") === "/prijmout 10.2", "odkaz otevře nový soubor rozhodnuti/10.2-prijmout.txt s příkazem ve větvi PR", odkaz);
const sDuvodem = new URL(odkazRozhodnuti("buuczech/vladomer", "beh/2026-11", "/prijmout 2.3 duvod: "));
over(sDuvodem.searchParams.get("filename") === "rozhodnuti/2.3-prijmout.txt" && sDuvodem.searchParams.get("value") === "/prijmout 2.3 duvod: ", "u vyvráceného bodu je v souboru místo pro důvod");
const zv = new URL(odkazRozhodnuti("buuczech/vladomer", "beh/2026-11-zkouska", "/zverejnit"));
over(zv.pathname === "/buuczech/vladomer/new/beh/2026-11-zkouska" && zv.searchParams.get("filename") === "rozhodnuti/zverejnit.txt", "Zveřejnit: soubor rozhodnuti/zverejnit.txt, i ve zkušební větvi");
over(VETEV_BEHU.test("beh/2026-11") && VETEV_BEHU.test("beh/2026-11-zkouska") && !VETEV_BEHU.test("beh/2026-11-x") && !VETEV_BEHU.test("beh/2026-11/../main"), "větev běhu jen ve tvaru beh/RRRR-MM[-zkouska]");

console.log("\nSoubory rozhodnuti/ ve větvi (rozhodnuti-vetev.yml)");
const zeSouboru = prikazyZeSouboru([
  { jmeno: "10.2-podrzet.txt", text: "/podrzet 10.2\n", poradi: 200 },
  { jmeno: "10.2-prijmout.txt", text: "/prijmout 10.2", poradi: 100 },
  { jmeno: "2.3-prijmout.txt", text: "/prijmout 2.3 duvod: ", poradi: 150 },
  { jmeno: "zverejnit.txt", text: "/zverejnit", poradi: 300 },
]);
over(JSON.stringify(zeSouboru.prikazy) === JSON.stringify([{ prikaz: "prijmout", bod: "10.2", duvod: null }, { prikaz: "podrzet", bod: "10.2", duvod: null }, { prikaz: "zverejnit" }])
  && JSON.stringify(zeSouboru.neplatne) === JSON.stringify(["2.3-prijmout.txt"]),
  "v pořadí přidání (přijmout, pak nechat = nechat); „duvod:“ bez důvodu se ohlásí, neprovede", zeSouboru);

/* Celá cesta jako v rozhodnuti-vetev.yml: větev z commitu běhu (navrhy.js
   vytvor), vlastník přidá dva soubory dvěma commity, navrhy.js soubory je
   provede v pořadí přidání a smaže. Dočasný git repozitář, nic se nestahuje. */
{
  const tmp = mkdtempSync(join(tmpdir(), "vm-vetev-"));
  const git = (...a) => execFileSync("git", ["-C", tmp, "-c", "user.name=t", "-c", "user.email=test", "-c", "core.autocrlf=false", ...a], { encoding: "utf8", env: { ...process.env, ...(git.cas ? { GIT_COMMITTER_DATE: git.cas, GIT_AUTHOR_DATE: git.cas } : {}) } });
  const navrhy = (...a) => execFileSync(process.execPath, [join("scripts", "navrhy.js"), ...a, "--koren", tmp], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: join(tmp, "..", `${tmp.split(/[\\/]/).pop()}-out.txt`) } });
  try {
    git("init", "-q");
    mkdirSync(join(tmp, "public"));
    const zapis = (n, d) => writeFileSync(join(tmp, "public", n), JSON.stringify(d, null, 2));
    zapis("evaluations.json", zakladPR.evals); zapis("audit.json", zakladPR.audit); zapis("history.json", zakladPR.hist); zapis("faktcheck.json", zakladPR.faktcheck);
    git("add", "-A"); git("commit", "-qm", "běh");
    const sha = git("rev-parse", "HEAD").trim();
    writeFileSync(join(tmp, "rozhodnuti-vstup.json"), JSON.stringify(rozh));
    navrhy("vytvor", "--rozhodnuti", join(tmp, "rozhodnuti-vstup.json"), "--zaklad", sha);
    const cesta = `navrhy/${dnes.slice(0, 7)}.json`;
    git("add", "-A"); git("commit", "-qm", "návrhy");
    mkdirSync(join(tmp, "rozhodnuti"));
    // 12.2 nechat (dřív), pak 10.2 nechat — commity s různým časem, jména v opačném pořadí
    git.cas = "2026-11-01T10:00:00Z"; writeFileSync(join(tmp, "rozhodnuti", "12.2-podrzet.txt"), "/podrzet 12.2"); git("add", "-A"); git("commit", "-qm", "rozhodnutí 1");
    git.cas = "2026-11-01T10:05:00Z"; writeFileSync(join(tmp, "rozhodnuti", "10.2-podrzet.txt"), "/podrzet 10.2\n"); writeFileSync(join(tmp, "rozhodnuti", "7.2-prijmout.txt"), "/prijmout 7.2 duvod:"); git("add", "-A"); git("commit", "-qm", "rozhodnutí 2");
    git.cas = null;
    const vystup = navrhy("soubory", "--soubor", cesta);
    const po = JSON.parse(readFileSync(join(tmp, cesta), "utf8"));
    const evals = JSON.parse(readFileSync(join(tmp, "public", "evaluations.json"), "utf8"));
    over(!po.prijate["12.2"] && !po.prijate["10.2"] && po.prijate["7.2"] && po.historie.map((h) => h.bod).join() === "12.2,10.2",
      "soubory provedené v pořadí přidání; 7.2 bez důvodu zůstal, jak byl", { prijate: po.prijate, historie: po.historie });
    over(JSON.stringify(evals.evals["10.2"]) === JSON.stringify(zakladPR.evals.evals["10.2"]), "větev přeskládaná: 10.2 na minulém záznamu");
    over(!readdirSync(join(tmp, "rozhodnuti")).length, "provedené soubory jsou smazané (do main nepatří)");
    over(/7\.2-prijmout\.txt neobsahuje platný příkaz/.test(vystup) && /\| 12\.2 \|/.test(vystup), "odpověď do PR: co se provedlo, co ne, a souhrn", vystup.slice(0, 400));
  } finally { rmSync(tmp, { recursive: true, force: true }); rmSync(`${tmp}-out.txt`, { force: true }); }
}

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
