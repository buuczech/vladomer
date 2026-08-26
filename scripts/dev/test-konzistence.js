/* scripts/dev/test-konzistence.js — vnitřní konzistence publikovaných dat.
 *
 *     node scripts/dev/test-konzistence.js
 *
 * Offline, zdarma, nic neodesílá. Ověřuje to, co jde ověřit bez modelu: že
 * soubory v public/ sedí samy se sebou i mezi sebou a že číslo, kterým se web
 * představuje, vychází ze stejného pravidla na všech místech, kde se počítá.
 *
 * Proč v kódu a ne v pokynech pro model: kontrola, která se pokaždé udělá
 * trochu jinak, není kontrola. Je to týž důvod, proč laťka na doklad bydlí
 * v lib/dukaz.js a ne v promptu.
 *
 * Dvě úrovně nálezu:
 *   CHYBA    — web právě teď tvrdí něco nekonzistentního. Končí kódem 1.
 *   VAROVÁNÍ — dnes to nic nekazí, ale stačí jedna hodnota v datech a začne.
 *              Nekončí chybou schválně: zastavit kvůli riziku nasazení by
 *              znamenalo držet venku stará data kvůli něčemu, co se ještě
 *              nestalo.
 *
 * Pravidla se sem IMPORTUJÍ, nikdy nekopírují. Dvě kopie téhož pravidla se
 * rozejdou a nikdo si toho nevšimne — přesně to už jednou stálo dvě položky
 * „splněno“ (viz lib/dukaz.js).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ALL_ITEMS, TOTAL_ITEMS, CHAPTERS, DATES } from "../../src/data.js";
import { STATUSES } from "../lib/prompty.js";
import { duvodDegradace, CIL_DEGRADACE } from "../lib/dukaz.js";
import { ocisti } from "../lib/korektura.js";
import { readSettings, readList } from "../lib/nastaveni.js";
import { jsonLd } from "../lib/seo.js";
import { renderPrehled } from "../lib/prehled.js";

const KOREN = new URL("../../", import.meta.url);
const cesta = (c) => fileURLToPath(new URL(c, KOREN));
const cti = (c) => readFileSync(cesta(c), "utf8");
const ctiJson = (c) => JSON.parse(cti(c));

const NAST = readSettings();
const WEBY_HODNOCENI = readList("weby-hodnoceni.txt");
const WEBY_ZPRAVY = readList("weby-zpravy.txt");

const PLATNA_ID = new Set(ALL_ITEMS.map((it) => it.id));
const PLATNE_STAVY = new Set(STATUSES);
const DUVODY_DEGRADACE = Object.keys(CIL_DEGRADACE);

/* Systémová vada by jinak vypsala 143 řádků a utopila v nich zbytek. */
const MAX_UKAZEK = 5;
const vzorek = (ids) => (ids.length <= MAX_UKAZEK
  ? ids.join(", ")
  : `${ids.slice(0, MAX_UKAZEK).join(", ")} a dalších ${ids.length - MAX_UKAZEK}`);

const nalezy = [];
const chyba = (skupina, text) => nalezy.push({ uroven: "CHYBA", skupina, text });
const varovat = (skupina, text) => nalezy.push({ uroven: "VAROV", skupina, text });
const ok = (skupina, text) => console.log(`ok    [${skupina}] ${text}`);

/* Vrátí verzi souboru z gitu, nebo null (mělký klon, první commit, soubor
   tehdy ještě neexistoval). Chybějící historie není vada dat. */
function zGitu(rev, c) {
  try {
    return execFileSync("git", ["show", `${rev}:${c}`], {
      cwd: cesta("."), encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { return null; }
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}
function schema(url) {
  try { return new URL(url).protocol; } catch { return null; }
}
const vSeznamu = (h, seznam) => seznam.some((d) => h === d || h.endsWith(`.${d}`));

// ===========================================================================
//  A — tvar a úplnost evaluations.json
// ===========================================================================
const EV = ctiJson("public/evaluations.json");
const evals = EV.evals || {};

{
  const chybi = ALL_ITEMS.filter((it) => !evals[it.id]).map((it) => it.id);
  const navic = Object.keys(evals).filter((id) => !PLATNA_ID.has(id));
  if (chybi.length) chyba("A", `chybí hodnocení pro ${chybi.length} bodů: ${vzorek(chybi)}`);
  if (navic.length) chyba("A", `${navic.length} id, která v src/data.js nejsou: ${vzorek(navic)}`);
  if (!chybi.length && !navic.length) ok("A", `všech ${TOTAL_ITEMS} bodů z data.js má hodnocení a nic navíc`);

  const POVINNA = ["status", "evidence", "unverifiable", "comment", "change", "sources", "updatedAt"];
  const bezPole = [], spatnyStav = [], spatnyMinuly = [], spatneDatum = [];
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e) continue;
    if (POVINNA.some((p) => !(p in e))) bezPole.push(it.id);
    if (!PLATNE_STAVY.has(e.status)) spatnyStav.push(`${it.id} (${e.status})`);
    if (e.previousStatus != null && !PLATNE_STAVY.has(e.previousStatus)) {
      spatnyMinuly.push(`${it.id} (${e.previousStatus})`);
    }
    if (e.evidenceDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(e.evidenceDate)) {
      spatneDatum.push(`${it.id} (${e.evidenceDate})`);
    }
  }
  if (bezPole.length) chyba("A", `${bezPole.length} bodů nemá všechna povinná pole: ${vzorek(bezPole)}`);
  if (spatnyStav.length) chyba("A", `neznámý stav u ${spatnyStav.length} bodů: ${vzorek(spatnyStav)}`);
  if (spatnyMinuly.length) chyba("A", `neznámý previousStatus u ${spatnyMinuly.length} bodů: ${vzorek(spatnyMinuly)}`);
  if (spatneDatum.length) chyba("A", `evidenceDate mimo tvar RRRR-MM-DD u ${spatneDatum.length} bodů: ${vzorek(spatneDatum)}`);
  if (!bezPole.length && !spatnyStav.length && !spatnyMinuly.length && !spatneDatum.length) {
    ok("A", "povinná pole, stavy i tvar dat jsou v pořádku");
  }
}

// ===========================================================================
//  B — zdroje: existují, dají se otevřít a jsou z povoleného seznamu
// ===========================================================================
{
  const prilis = [], neuplne = [], nevalidni = [], mimoSeznam = [];
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e || !Array.isArray(e.sources)) continue;
    if (e.sources.length > NAST.maximalne_zdroju) prilis.push(`${it.id} (${e.sources.length})`);
    for (const s of e.sources) {
      if (!s || !s.url || !s.title) { neuplne.push(it.id); continue; }
      const h = host(s.url);
      if (!h || !/^https?:$/.test(schema(s.url) || "")) { nevalidni.push(`${it.id} (${s.url})`); continue; }
      if (!vSeznamu(h, WEBY_HODNOCENI)) mimoSeznam.push(`${it.id} (${h})`);
    }
  }
  if (prilis.length) chyba("B", `víc než ${NAST.maximalne_zdroju} zdrojů u ${prilis.length} bodů: ${vzorek(prilis)}`);
  if (neuplne.length) chyba("B", `zdroj bez url nebo bez title u ${neuplne.length} bodů: ${vzorek(neuplne)}`);
  if (nevalidni.length) chyba("B", `zdroj, který není platná http(s) adresa, u ${nevalidni.length} bodů: ${vzorek(nevalidni)}`);
  if (mimoSeznam.length) chyba("B", `zdroj mimo weby-hodnoceni.txt u ${mimoSeznam.length} bodů: ${vzorek(mimoSeznam)}`);
  if (!prilis.length && !neuplne.length && !nevalidni.length && !mimoSeznam.length) {
    ok("B", "všechny zdroje jsou úplné, platné a z povoleného seznamu");
  }
}

// ===========================================================================
//  C — laťka na doklad. Přepočítá se týmž pravidlem, jakým běh rozhodoval.
// ===========================================================================
{
  const PRAVIDLA = { minDelkaDokladu: NAST.minimalni_delka_dokladu, nastup: DATES.tookOffice,
    latkaPoruseno: NAST.latka_poruseno === 1 };
  const neobstalo = [], spatnaDegradace = [], neznamyDuvod = [];
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e) continue;
    /* TODO (po prvním plném auditu od 26. 8. 2026): doplnit sem
       `zdroje: e.sources || []`, aby se přehrávala i laťka na doklad opřený
       o Sbírku zákonů — ta je uvozená `zdroje &&`, takže bez nich se na
       publikovaná data nedostane. Nedělá se to hned schválně: bod 10.4 nese
       z běhu z 21. 8. doklad „Zákon č. 233/2026 Sb.“ bez pramene, kde by se
       to číslo dalo dohledat, takže by kontrola [C] hlásila CHYBU a CI by
       bylo červené až do pátku. Plný audit ten záznam přepíše a zábrana
       v lib/dukaz.js na něj dopadne rovnou při zápisu. */
    const duvod = duvodDegradace(e.status, e.evidence, e.evidenceDate || "", PRAVIDLA);
    if (e.status === "fulfilled" && duvod) neobstalo.push(`${it.id} (${duvod})`);
    if (e.evidenceMissing) {
      if (!DUVODY_DEGRADACE.includes(e.evidenceMissing)) neznamyDuvod.push(`${it.id} (${e.evidenceMissing})`);
      /* Kam se sráží, říká CIL_DEGRADACE — natvrdo „partial“ to být nesmí,
         protože obvinění bez dokladu padá na „jen deklarováno“. */
      else if (e.status !== CIL_DEGRADACE[e.evidenceMissing]) {
        spatnaDegradace.push(`${it.id} (${e.status}, čekáno ${CIL_DEGRADACE[e.evidenceMissing]})`);
      }
    }
  }
  if (neobstalo.length) chyba("C", `„splněno“ neprojde laťkou na doklad u ${neobstalo.length} bodů: ${vzorek(neobstalo)}`);
  if (spatnaDegradace.length) chyba("C", `evidenceMissing u bodu s jiným stavem, než na jaký se sráží: ${vzorek(spatnaDegradace)}`);
  if (neznamyDuvod.length) chyba("C", `neznámý důvod degradace: ${vzorek(neznamyDuvod)}`);
  if (!neobstalo.length && !spatnaDegradace.length && !neznamyDuvod.length) {
    ok("C", "každé „splněno“ obstojí a každá degradace má platný důvod");
  }

  /* Bez vysvětlivky stojí na webu odznak „částečně splněno“ nad komentářem,
     který tvrdí, že slib je naplněn — a vypadá to, že si stránka protiřečí. */
  const app = cti("src/App.jsx");
  const prehled = cti("scripts/lib/prehled.js");
  const bezPopisku = DUVODY_DEGRADACE.filter((d) => !app.includes(`"${d}"`) || !prehled.includes(`"${d}"`));
  if (bezPopisku.length) chyba("C", `důvod degradace bez vysvětlivky v App.jsx nebo prehled.js: ${bezPopisku.join(", ")}`);
  else ok("C", `všech ${DUVODY_DEGRADACE.length} důvodů degradace má vysvětlivku na webu i v přehledu`);
}

// ===========================================================================
//  D — texty: obě jazykové verze existují a nezůstal v nich strojový odpad
// ===========================================================================
{
  const prazdne = [], neocistene = [];
  /* Odpad se nehledá vlastním vzorem, ale pustí se na text přímo ocisti() —
     ta v běhu čistí každé pole, takže cokoli, co po ní ještě jde změnit, tam
     zůstalo neprávem. Vlastní vzor by navíc musel rozlišit klíč stavu od
     běžného anglického slova: „the promise was fulfilled" je věta, ne
     nepřeložený klíč, a proto se v ocisti() srážejí jen in_progress
     a not_started a klíče v uvozovkách. */
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e) continue;
    for (const pole of ["comment", "change"]) {
      for (const jazyk of ["cs", "en"]) {
        const t = e[pole] && e[pole][jazyk];
        if (!t || !String(t).trim()) {
          /* Prázdný popis změny je přípustný, prázdný komentář ne. Věta
             „co se změnilo" se maže, když se ukáže, že nebyla pravdivá —
             a dopsat za model, co se ve světě stalo, nelze: bylo by to
             tvrzení, které nikdo neověřil. Web takový bod prostě nechá bez
             popisu změny. Komentář je naproti tomu jádro hodnocení a bez
             něj by bod na webu nic neříkal. */
          if (pole !== "change") prazdne.push(`${it.id} (${pole}.${jazyk})`);
          continue;
        }
        if (ocisti(t, jazyk) !== t) neocistene.push(`${it.id} (${pole}.${jazyk})`);
      }
    }
  }
  if (prazdne.length) chyba("D", `prázdný text u ${prazdne.length} polí: ${vzorek(prazdne)}`);
  if (neocistene.length) chyba("D", `strojový odpad (<cite>, syrový klíč stavu, dvojité mezery) u ${neocistene.length} polí: ${vzorek(neocistene)}`);
  if (!prazdne.length && !neocistene.length) {
    ok("D", "komentáře i popisy změn jsou vyplněné v obou jazycích a bez odpadu");
  }
}

// ===========================================================================
//  E — křížem mezi soubory
// ===========================================================================
const AUDIT = ctiJson("public/audit.json");
{
  const HIST = ctiJson("public/history.json");
  if (!Array.isArray(HIST.snapshots)) chyba("E", "history.json nemá pole snapshots");
  else {
    const posledni = HIST.snapshots[HIST.snapshots.length - 1];
    const denEvals = String(EV.lastUpdated || "").slice(0, 10);
    if (posledni && posledni.date === denEvals) {
      const rozdil = ALL_ITEMS
        .filter((it) => evals[it.id] && posledni.statuses[it.id] !== evals[it.id].status)
        .map((it) => it.id);
      if (rozdil.length) chyba("E", `poslední snímek historie se liší od evaluations.json u ${rozdil.length} bodů: ${vzorek(rozdil)}`);
      else ok("E", `poslední snímek historie (${posledni.date}) souhlasí s evaluations.json`);
    } else {
      /* Snímek se schválně nezapíše, když v běhu spadla kapitola — historie
         pak legitimně zaostává o týden a není to vada. */
      ok("E", `historie končí ${posledni ? posledni.date : "?"}, data jsou z ${denEvals} — snímek se nezapsal, což běh dělá po selhání kapitoly`);
    }
    if (HIST.snapshots.length > NAST.historie_tydnu) {
      chyba("E", `historie má ${HIST.snapshots.length} snímků, povoleno je ${NAST.historie_tydnu}`);
    }
  }

  if (!Array.isArray(AUDIT.entries)) chyba("E", "audit.json nemá pole entries");
  else {
    const navic = [...new Set(AUDIT.entries.map((e) => e.id).filter((id) => !PLATNA_ID.has(id)))];
    if (navic.length) chyba("E", `audit.json obsahuje neplatná id: ${vzorek(navic)}`);

    /* (id, date) smí být dvakrát jen tam, kde druhý řádek nese „oprava“ —
       audit je append-only, oprava se přidává, nepřepisuje. */
    const videno = new Set();
    const duplicity = [];
    for (const e of AUDIT.entries) {
      const klic = `${e.id}|${e.date}`;
      if (videno.has(klic) && !e.oprava) duplicity.push(klic);
      videno.add(klic);
    }
    if (duplicity.length) chyba("E", `dvojí záznam bez pole „oprava“ v audit.json: ${vzorek(duplicity)}`);

    /* Řazení se ověřuje jen na řádcích, které zapsal běh. Opravy připojuje
       prepocet-degradaci.js na konec souboru a nepřerovnává ho — přerovnat
       by znamenalo sáhnout na už zveřejněné řádky, což je přesně to, co
       append-only zakazuje. Nesetříděná oprava na konci je tedy v pořádku. */
    const zBehu = AUDIT.entries.filter((e) => !e.oprava);
    const setrideno = zBehu.every((e, i) => {
      if (i === 0) return true;
      const p = zBehu[i - 1];
      return p.date < e.date || (p.date === e.date && p.id.localeCompare(e.id, "cs", { numeric: true }) <= 0);
    });
    if (!setrideno) chyba("E", "audit.json není setříděn podle (datum, id)");
    if (!navic.length && !duplicity.length && setrideno) {
      ok("E", `audit.json: ${AUDIT.entries.length} záznamů, setříděno, bez neoprávněných duplicit`);
    }
  }

  const NEWS = ctiJson("public/news.json");
  const okno = NAST.zpravy_pocet_dni + NAST.zpravy_tolerance_dni;
  const zpravy = NEWS.items || [];
  if (zpravy.length > NAST.pocet_zprav) chyba("E", `news.json má ${zpravy.length} zpráv, povoleno je ${NAST.pocet_zprav}`);
  const domeny = new Set(), dvakrat = [], mimo = [], stare = [];
  for (const z of zpravy) {
    const h = host(z.url);
    if (!h || !vSeznamu(h, WEBY_ZPRAVY)) { mimo.push(String(z.url)); continue; }
    if (domeny.has(h)) dvakrat.push(h);
    domeny.add(h);
    if (z.date && NEWS.generatedAt) {
      const dni = (Date.parse(NEWS.generatedAt) - Date.parse(z.date)) / 86400000;
      if (dni > okno) stare.push(`${z.date} (${Math.round(dni)} dní)`);
    }
  }
  if (mimo.length) chyba("E", `zpráva mimo weby-zpravy.txt: ${vzorek(mimo)}`);
  if (dvakrat.length) chyba("E", `dvě zprávy z téže domény: ${vzorek(dvakrat)}`);
  if (stare.length) chyba("E", `zpráva starší než ${okno} dní: ${vzorek(stare)}`);
  if (!mimo.length && !dvakrat.length && !stare.length && zpravy.length <= NAST.pocet_zprav) {
    ok("E", `news.json: ${zpravy.length} zpráv, každá z jiné povolené domény a v okně ${okno} dní`);
  }
}

// ===========================================================================
//  F — přísná metrika. Pět míst musí říkat totéž číslo o téže vládě.
// ===========================================================================
{
  /* Referenční výpočet: splněno / hodnocené, neměřitelné mimo jmenovatel.
     Napsaný znovu schválně — kdyby se importoval z jednoho z těch pěti míst,
     kontrola by porovnávala to místo samo se sebou. */
  const SCORED = new Set(STATUSES);
  let done = 0, n = 0, unver = 0;
  for (const it of ALL_ITEMS) {
    const e = evals[it.id];
    if (!e || !SCORED.has(e.status)) continue;
    if (e.unverifiable) { unver++; continue; }
    n++;
    if (e.status === "fulfilled") done++;
  }
  const pct = n ? (done / n) * 100 : 0;
  const jedno = (v) => (v >= 10 || v === 0 ? Math.round(v) : Math.round(v * 10) / 10);
  ok("F", `referenční metrika: ${done} splněno z ${n} hodnocených (${jedno(pct)} %), ${unver} neměřitelných mimo jmenovatel`);

  // Dvě z pěti míst jdou zavolat doopravdy a porovnat jejich skutečný výstup.
  try {
    const ld = JSON.parse(jsonLd({
      evaluationsPath: cesta("public/evaluations.json"),
      items: ALL_ITEMS, totalItems: TOTAL_ITEMS, tookOffice: DATES.tookOffice,
    }));
    const dataset = ld["@graph"].find((u) => u["@type"] === "Dataset");
    const promenna = dataset.variableMeasured.find((v) => v.unitText === "%");
    const podil = promenna ? promenna.value : undefined;
    const hodnoceno = Number(String(dataset.size || "").match(/^(\d+)/) ? String(dataset.size).match(/^(\d+)/)[1] : NaN);
    if (Math.abs(podil - Math.round(pct * 10) / 10) > 0.05 || hodnoceno !== n) {
      chyba("F", `JSON-LD (lib/seo.js) tvrdí ${podil} % z ${hodnoceno} hodnocených, referenční výpočet ${Math.round(pct * 10) / 10} % z ${n}`);
    } else ok("F", "JSON-LD ve strukturovaných datech souhlasí");
  } catch (e) { chyba("F", `JSON-LD se nepodařilo spočítat: ${e.message}`); }

  try {
    const html = renderPrehled("cs", {
      chapters: CHAPTERS, evals, lastUpdated: EV.lastUpdated, totalItems: TOTAL_ITEMS,
    });
    const zHtml = html.match(/(\d+) z (\d+) závazků hodnoceno/);
    const prvniPct = html.match(/>(\d+(?:,\d+)?)&#8239;%</);
    if (!zHtml || !prvniPct) {
      varovat("F", "z textového přehledu se nepodařilo vyčíst čísla — změnila se šablona a kontrola je tam slepá");
    } else if (Number(zHtml[1]) !== n || Number(prvniPct[1].replace(",", ".")) !== jedno(pct)) {
      chyba("F", `textový přehled (lib/prehled.js) tvrdí ${prvniPct[1]} % z ${zHtml[1]} hodnocených, referenční výpočet ${jedno(pct)} % z ${n}`);
    } else ok("F", "textový přehled /prehled/ souhlasí");
  } catch (e) { chyba("F", `textový přehled se nepodařilo vykreslit: ${e.message}`); }

  /* og-image.js a instagram/post.js nic neexportují a při importu by se samy
     rozeběhly, takže se u nich porovnává aspoň to, co se reálně rozchází:
     množina stavů, které tvoří jmenovatel. */
  const mnoziny = {
    "scripts/og-image.js": /const SCORED = new Set\(\[([^\]]*)\]\)/,
    "scripts/lib/seo.js": /const SCORED = new Set\(\[([^\]]*)\]\)/,
    "scripts/lib/prehled.js": /const SCORED = new Set\(\[([^\]]*)\]\)/,
    "scripts/instagram/post.js": /const HODNOCENE = new Set\(\[([^\]]*)\]\)/,
  };
  const jmenovatele = {};
  for (const [soubor, vzor] of Object.entries(mnoziny)) {
    const m = cti(soubor).match(vzor);
    if (!m) { varovat("F", `v ${soubor} se nenašla množina hodnocených stavů — kontrola je tam slepá`); continue; }
    jmenovatele[soubor] = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
  }

  /* V App.jsx tutéž roli hraje score !== null v tabulce STATUS. */
  const app = cti("src/App.jsx");
  const odStatusu = app.slice(app.indexOf("const STATUS = {"));
  const blok = odStatusu.slice(0, odStatusu.indexOf("\n};"));
  const doApp = [];
  for (const radek of blok.split("\n")) {
    const m = radek.match(/^\s+(\w+):\s*\{.*score:\s*(null|\d+)/);
    if (m && m[2] !== "null") doApp.push(m[1]);
  }
  jmenovatele["src/App.jsx (STATUS.score)"] = doApp.sort();

  const varianty = new Map();
  for (const [soubor, seznam] of Object.entries(jmenovatele)) {
    const klic = seznam.join(",");
    if (!varianty.has(klic)) varianty.set(klic, []);
    varianty.get(klic).push(soubor);
  }
  if (varianty.size > 1) {
    const popis = [...varianty.entries()]
      .map(([klic, soubory]) => `\n         {${klic}}\n           → ${soubory.join(", ")}`).join("");
    varovat("F", `místa počítající metriku se neshodují na tom, které stavy patří do jmenovatele:${popis}`
      + "\n         Dnes to nic nekazí, protože žádný bod ten stav nemá. Jakmile ho dostane,"
      + "\n         začne web hlásit dvě různá procenta o téže vládě.");
  } else ok("F", `všech ${Object.keys(jmenovatele).length} míst počítá jmenovatel ze stejných stavů`);

  /* Geometrie oblouků je schválně zdvojená mezi Ring v App.jsx a oblouk
     v instagram/post.js — nesdílí se přes hranici src/scripts. Nikdo ji
     dosud nehlídal, přitom zaoblený konec bez zkrácení nafoukne 5,7 % na
     9,1 %. Neporovnává se text, ale to, co musí platit v obou: délka se
     krátí o tloušťku, začátek se posouvá o polovinu, a segment kratší než
     tloušťka se nezaobluje. */
  const geometrie = {
    "src/App.jsx (Ring)": cti("src/App.jsx"),
    "scripts/instagram/post.js (oblouk)": cti("scripts/instagram/post.js"),
  };
  const chybiVzor = [];
  for (const [kde, kod] of Object.entries(geometrie)) {
    const zkraceni = /kumulativne\s*-\s*(sirka|tloustka)/.test(kod);
    const posun = /-\s*(sirka|tloustka)\s*\/\s*2/.test(kod);
    const butt = /kumulativne\s*<=\s*(sirka|tloustka)/.test(kod) && /"butt"/.test(kod);
    if (!zkraceni || !posun || !butt) {
      chybiVzor.push(`${kde} (${[!zkraceni && "zkrácení", !posun && "posun", !butt && "rovný konec"].filter(Boolean).join(", ")})`);
    }
  }
  if (chybiVzor.length) chyba("F", `geometrie prstence neodpovídá pravidlu o zaoblených koncích: ${chybiVzor.join("; ")}`);
  else ok("F", "obě geometrie prstence krátí oblouk o tloušťku a nezaoblují krátký segment");
}

// ===========================================================================
//  G — audit.json je append-only. Web to slibuje na třech místech.
// ===========================================================================
{
  const predchozi = zGitu("HEAD", "public/audit.json");
  if (!predchozi) varovat("G", "předchozí verze audit.json není v gitu k dispozici — append-only se nedá ověřit");
  else {
    const stare = JSON.parse(predchozi).entries || [];
    const nove = AUDIT.entries || [];
    if (nove.length < stare.length) chyba("G", `audit.json se zkrátil z ${stare.length} na ${nove.length} záznamů`);
    /* Záznamy z posledního dne se legitimně přepisují — běh spuštěný dvakrát
       za den svoje řádky nejdřív odstraní a zapíše znovu. Všechno starší už
       je slib, který se porušit nesmí. */
    const hranice = stare.reduce((max, e) => (e.date > max ? e.date : max), "");
    const stareStare = stare.filter((e) => e.date < hranice);
    const noveStare = nove.filter((e) => e.date < hranice);
    const zmenene = [];
    for (let i = 0; i < stareStare.length; i++) {
      if (JSON.stringify(stareStare[i]) !== JSON.stringify(noveStare[i])) {
        zmenene.push(`${stareStare[i].id}/${stareStare[i].date}`);
        if (zmenene.length > MAX_UKAZEK) break;
      }
    }
    if (zmenene.length) chyba("G", `přepsané starší záznamy v audit.json: ${vzorek(zmenene)}`);
    else ok("G", `append-only drží — ${stareStare.length} záznamů starších než ${hranice} je beze změny`);
  }
}

// ===========================================================================
const chyb = nalezy.filter((n) => n.uroven === "CHYBA").length;
const varovani = nalezy.length - chyb;
if (nalezy.length) {
  console.log("");
  for (const n of nalezy) console.log(`${n.uroven} [${n.skupina}] ${n.text}`);
}
console.log("");
if (chyb) console.log(`${chyb} ${chyb === 1 ? "chyba" : chyb < 5 ? "chyby" : "chyb"}${varovani ? ` a ${varovani} varování` : ""}.`);
else console.log(`Konzistence v pořádku${varovani ? `, ${varovani} varování k rozhodnutí.` : "."}`);
process.exitCode = chyb ? 1 : 0;
