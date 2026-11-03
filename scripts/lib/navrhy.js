/* scripts/lib/navrhy.js — návrhy, o kterých rozhoduje vlastník v PR beh/RRRR-MM (spec 005).
 *
 * Měsíční běh zveřejní ověřené a podrží sporné (vrstva R). Podržené body
 * s navrženým záznamem jdou do PR. Vyjde jen to, co vlastník výslovně
 * přijme (/prijmout z e-mailu nebo z komentáře); Merge i Zveřejnit pak
 * zveřejní přijaté, Close nic.
 *
 * Stav větve se vždy SKLÁDÁ znovu: ze zveřejněných souborů běhu (commit
 * `zaklad` na main) a ze seznamu přijatých bodů v navrhy/RRRR-MM.json.
 * Žádný příkaz tedy nepřepisuje výsledek jiného a pořadí příkazů nehraje
 * roli. Větev není zveřejněná, takže její přeskládání append-only neporušuje;
 * zveřejněný audit se jen rozšíří — přijetí je nový řádek s polem „oprava“,
 * jako každá oprava na webu.
 *
 * Výchozí stav: přijaté jsou návrhy, jejichž tvrzení kontrola jen nemohla
 * ověřit (nebo které čekají kvůli kalibraci). Návrh s vyvráceným tvrzením
 * nebo s chybou proti primárnímu záznamu se jen vypíše; přijmout ho jde
 * jen s důvodem, který se zapíše do auditu.
 *
 * Když vlastník nesouhlasí ani s webem, ani s návrhem, napíše stav
 * a komentář sám (/opravit, „Vlastní hodnocení“). Takový záznam projde
 * stejnou laťkou na doklad jako hodnocení modelu a v auditu má jako autora
 * „vlastník“.
 */

import { POLE_KOREKTURY, ctiPole, zapisPole, jazykPole, ocisti, STAV_POPIS } from "./korektura.js";
import { duvodDegradace, CIL_DEGRADACE } from "./dukaz.js";

const NAZVY_STAVU = Object.fromEntries(Object.entries(STAV_POPIS).filter(([k]) => k !== "stalled").map(([k, v]) => [k, v.cs]));

const vyvraceny = (problemy) => problemy.some((p) => p === "m-vyvraceno" || p.startsWith("d:"));

/* Návrh v podobě, v jaké by po přijetí vyšel na web: mechanicky očištěný
   (<cite>, syrové klíče stavu) stejně jako každý zveřejňovaný záznam. Návrhy,
   které podržela brána, se dřív zapisovaly syrové — generálka 2. 11. 2026
   nabídla k přijetí 2.9, 2.14 a 5.4 se značkami <cite>. Očišťuje se při
   zápisu v evaluate.js i tady, aby to platilo i pro starší soubory návrhů.
   Vrací kopii, originál zůstává. Jazykovou korekturu dělá zkorigujNavrhy(). */
export function ocistenyZaznam(zaznam) {
  if (!zaznam) return zaznam;
  const e = structuredClone(zaznam);
  for (const pole of POLE_KOREKTURY) {
    const t = ctiPole(e, pole);
    if (t) zapisPole(e, pole, ocisti(t, jazykPole(pole)));
  }
  return e;
}

/* Jazyková korektura návrhů, které podržela brána (NEPRIJATE v evaluate.js).
   Korektura běhu bere jen záznamy, které běh zapsal, a „Přijmout“ přitom
   návrh zveřejní tak, jak je — v generálce 2. 11. 2026 takhle čekalo na
   vlastníka 42 návrhů bez korektury. Dávky po kapitolách a kontrola každé
   opravy (opravDavku → zkontrolujOpravu) jsou stejné jako u zveřejňovaných
   textů; co kontrola odmítne nebo co spadne, zůstane v původním znění.
   @param neprijate { id: { navrh, … } } — navrh se nahradí opravenou kopií
   @param kapitoly  [[id, …], …] — dělení do dávek (kapitoly běhu)
   @param oprav     async (davka) => { opravy: [{ id, pole, text }], zmeneno, odmitnuto, duvody }
   @returns { zmeneno, odmitnuto, davek, selhalo } */
export async function zkorigujNavrhy(neprijate, kapitoly, oprav, { log = () => {}, pauzaMs = 0 } = {}) {
  const st = { zmeneno: 0, odmitnuto: 0, davek: 0, selhalo: 0 };
  for (const ids of kapitoly) {
    const davka = [];
    for (const id of ids) {
      const n = neprijate[id] && neprijate[id].navrh;
      if (!n) continue;
      for (const pole of POLE_KOREKTURY) {
        const t = ctiPole(n, pole);
        if (t) davka.push({ klic: `${id}|${pole}`, id, pole, text: ocisti(t, jazykPole(pole)) });
      }
    }
    if (!davka.length) continue;
    if (st.davek++ && pauzaMs) await new Promise((r) => setTimeout(r, pauzaMs));
    try {
      const r = await oprav(davka);
      for (const o of r.opravy) {
        const x = neprijate[o.id];
        x.navrh = ocistenyZaznam(x.navrh);
        zapisPole(x.navrh, o.pole, o.text);
      }
      st.zmeneno += r.zmeneno;
      st.odmitnuto += r.odmitnuto;
      if (r.duvody.length) log(`  korektura návrhů odmítla: ${r.duvody.join("; ")}`);
    } catch (e) {
      st.selhalo++;
      log(`  korektura návrhů selhala: ${e.message} — tyto návrhy zůstávají bez korektury`);
    }
  }
  return st;
}

/** Návrhy z rozhodnutí vrstvy R: bod → { zaznam, problemy, vyvraceny, typ }. */
export function navrhyZRozhodnuti(rozhodnuti) {
  const out = {};
  for (const b of Object.values(rozhodnuti.body || {})) {
    const n = b.vlastnik && b.vlastnik.navrh;
    if (!n || n.zdroj !== "hodnotitel" || !n.zaznam) continue;
    out[b.bod] = { zaznam: ocistenyZaznam(n.zaznam), problemy: b.problemy, vyvraceny: vyvraceny(b.problemy), typ: b.vlastnik.typ };
  }
  return out;
}

/** Soubor rozhodnutí PR. Ve výchozím stavu nepřijaté nic.
 *  Kontrola faktů žádný z návrhů nepotvrdila, a dokud vlastník nerozhodne,
 *  zůstává bod na minulém záznamu. Původně bylo přijaté vše nevyvrácené: v generálce
 *  21. 10. 2026 vlastník rozhodl tři body, Zveřejnit vydalo 85 dalších a mezi
 *  nimi 10.1 „porušeno → deklarováno“, které zlatá sada vede jako porušené
 *  (rozhodnutí vlastníka 22. 10. 2026). */
export function novySoubor({ rozhodnuti, zaklad }) {
  // body = všechny body k rozhodnutí i bez návrhu (vlastní hodnocení jde u každého) → jejich problémy
  const body = Object.fromEntries(Object.values(rozhodnuti.body || {}).filter((b) => b.vlastnik).map((b) => [b.bod, b.problemy]));
  return { beh: rozhodnuti.beh, zaklad, navrhy: navrhyZRozhodnuti(rozhodnuti), body, prijate: {}, vlastni: {}, historie: [] };
}

/**
 * Příkaz vlastníka. Vrací { ok, zprava } — zpráva jde do odpovědi v PR.
 * @param prikaz  "prijmout" | "podrzet" | "opravit" | "zverejnit"
 * @param vlastni u „opravit“ hotové vlastní hodnocení i s překladem
 *                (scripts/navrhy.js), chyba = proč se provést nedá
 * Poslední příkaz u bodu platí: přijetí i „nechat“ vlastní hodnocení ruší
 * a vlastní hodnocení ruší přijetí.
 */
export function proved(soubor, { prikaz, bod, duvod = null, chyba = null, vlastni = null, kdo = "vlastník", kdy = new Date().toISOString() }) {
  if (prikaz === "zverejnit") return { ok: true, zprava: "Zveřejňuji: PR se sloučí a web se nasadí." };
  const n = soubor.navrhy[bod];
  if (prikaz === "opravit") {
    if (chyba) return { ok: false, zprava: chyba };
    if (!n && !(bod in (soubor.body || {}))) return { ok: false, zprava: `Bod ${bod} v tomto běhu k rozhodnutí není.` };
    if (!vlastni || !vlastni.comment || !vlastni.comment.en) return { ok: false, zprava: `${bod}: chybí anglický překlad komentáře — nic se neprovedlo.` };
    delete soubor.prijate[bod];
    (soubor.vlastni = soubor.vlastni || {})[bod] = vlastni;
    soubor.historie.push({ kdy, kdo, prikaz, bod, stav: vlastni.status });
    return { ok: true, zprava: `${bod}: vlastní hodnocení „${NAZVY_STAVU[vlastni.status]}“ s tvým komentářem. Anglicky: „${vlastni.comment.en}“` };
  }
  if (prikaz === "podrzet" && (n || (soubor.vlastni && soubor.vlastni[bod]))) {
    delete soubor.prijate[bod];
    if (soubor.vlastni) delete soubor.vlastni[bod];
    soubor.historie.push({ kdy, kdo, prikaz, bod });
    return { ok: true, zprava: `${bod}: zůstane minulý záznam.` };
  }
  if (!n) return { ok: false, zprava: `Bod ${bod} v tomto běhu žádný návrh nemá.` };
  if (prikaz === "prijmout") {
    if (n.vyvraceny && !duvod) return { ok: false, zprava: `${bod}: kontrola faktů tvrzení vyvrátila — přijmout jde jen s důvodem: /prijmout ${bod} duvod: …` };
    soubor.prijate[bod] = { duvod: duvod || null };
    if (soubor.vlastni) delete soubor.vlastni[bod];
    soubor.historie.push({ kdy, kdo, prikaz, bod, ...(duvod ? { duvod } : {}) });
    return { ok: true, zprava: `${bod}: návrh přijat${duvod ? " s důvodem, který se zapíše do auditu" : ""}.` };
  }
  return { ok: false, zprava: `Neznámý příkaz ${prikaz}.` };
}

/* Záznam, který napsal vlastník: stav a komentář od něj, doklad a jeho datum
   od něj, nebo z webu; zdroje a neměřitelnost (seznam nemeritelne.txt) z webu.
   Věta o změně zůstane prázdná — prázdná je přípustná a přechod web vykreslí
   sám z previousStatus. updatedAt = čas běhu, aby se změna počítala k tomuto
   běhu (src/zmeny.js). Údaje ze Sbírky platí k dokladu a jeho datu, takže
   když je vlastník změní, odpadnou. */
export function vlastniZaznam(puvodni, v, kdy) {
  const e = structuredClone(puvodni || { sources: [], unverifiable: false });
  delete e.overeno; delete e.evidenceMissing;
  const evidence = v.evidence || e.evidence || "";
  const evidenceDate = v.evidenceDate || e.evidenceDate || undefined;
  if (evidence !== e.evidence || evidenceDate !== e.evidenceDate) delete e.sbirka;
  return {
    ...e, status: v.status, evidence, evidenceDate,
    comment: { cs: v.comment.cs, en: v.comment.en || "" }, change: { cs: "", en: "" },
    previousStatus: puvodni ? puvodni.status : null, updatedAt: kdy,
  };
}

/* Vlastní hodnocení projde stejnou laťkou na doklad jako hodnocení modelu
   (lib/dukaz.js): jinak by zveřejnění spadlo na test-konzistence a web by
   tvrdil „splněno“ bez dokladu, který to unese. Vrací text pro vlastníka,
   nebo null. */
export function chybaVlastnihoZaznamu(e, { dnes, ...pravidla }) {
  if (e.evidenceDate && e.evidenceDate > dnes) return `datum dokladu ${e.evidenceDate} je v budoucnosti — oprav ho za „datum:“`;
  const d = duvodDegradace(e.status, e.evidence, e.evidenceDate || "", { ...pravidla, zdroje: e.sources || [] });
  if (!d) return null;
  return `„${NAZVY_STAVU[e.status]}“ s tímhle dokladem neprojde laťkou, kterou web drží u každého hodnocení (${d}; běh by ho srazil na „${NAZVY_STAVU[CIL_DEGRADACE[d]]}“). Doplň doklad a datum, nebo vyber jiný stav.`;
}

/** Řádek auditu ze záznamu — stejná pole jako řádky, které zapisuje evaluate.js. */
export function radekAuditu(id, e, date, model) {
  return {
    id, date,
    status: e.status,
    evidence: e.evidence || "",
    evidence_date: e.evidenceDate || "",
    unverifiable: e.unverifiable === true,
    comment_cs: (e.comment && e.comment.cs) || "",
    comment_en: (e.comment && e.comment.en) || "",
    change_cs: (e.change && e.change.cs) || "",
    change_en: (e.change && e.change.en) || "",
    sources: (e.sources || []).map((s) => s.url),
    model,
  };
}

/* Text za „Důvod:“ v oprava.duvod, jak ho píše sloz() níže. */
const DUVOD_VLASTNIKA = / přijal vlastník\. Důvod: (.+)$/s;

/**
 * Poslední rozhodnutí vlastníka u bodu z běhu před `beh` (řádek auditu ze
 * sloz()): přijetí návrhu, nebo vlastní hodnocení. Report ho ukáže u bodu,
 * který se vrátil k rozhodnutí, aby ho vlastník nemusel dohledávat znovu.
 * Jen pro vlastníka: model důvod nedostává, stav má stát na zdroji, ne na
 * tom, že ho vlastník jednou přijal.
 * @returns { beh, duvod } | { beh, vlastni: true, stav } | null
 */
export function predchoziPrijeti(audit, bod, beh) {
  let posledni = null;
  for (const r of (audit && audit.entries) || []) {
    const o = r.oprava;
    const z = o && (o.prijato_z_behu || o.vlastni_z_behu);
    if (r.id !== bod || !z || !(z < beh)) continue;
    if (posledni && z < posledni.beh) continue;
    posledni = o.vlastni_z_behu
      ? { beh: z, vlastni: true, stav: r.status }
      : { beh: z, duvod: (String(o.duvod || "").match(DUVOD_VLASTNIKA) || [])[1] || null };
  }
  return posledni;
}

/**
 * Složí soubory větve: zveřejněná data běhu + přijaté návrhy.
 * @param zaklad { evals: evaluations.json, audit: audit.json, hist: history.json, faktcheck?: faktcheck.json } z commitu běhu (kopie se upraví)
 * @param dnes   den přijetí (datum řádku auditu)
 * @returns { evals, audit, hist, faktcheck, prijato: [bod], vlastni: [bod] }
 */
export function sloz(soubor, zaklad, dnes) {
  const evals = structuredClone(zaklad.evals);
  const audit = structuredClone(zaklad.audit);
  const hist = structuredClone(zaklad.hist);
  // Veřejný souhrn kontroly: přijatý bod už nečeká na ověření (web podle něj ukazuje odznak).
  const faktcheck = zaklad.faktcheck ? structuredClone(zaklad.faktcheck) : null;
  const snimek = (hist.snapshots || []).find((s) => s.date === soubor.beh);
  const prijato = [];
  for (const [bod, { duvod }] of Object.entries(soubor.prijate).sort(([a], [b]) => a.localeCompare(b, "cs", { numeric: true }))) {
    const n = soubor.navrhy[bod];
    const puvodni = evals.evals[bod];
    // Model, který návrh napsal: z dnešního (podrženého) řádku běhu.
    const zBehu = audit.entries.find((r) => r.id === bod && r.date === soubor.beh && r.zadrzeno);
    evals.evals[bod] = n.zaznam;
    audit.entries.push({
      ...radekAuditu(bod, n.zaznam, dnes, zBehu ? zBehu.model : "neznámý"),
      oprava: {
        puvodni_zaznam: puvodni && puvodni.updatedAt ? puvodni.updatedAt.slice(0, 10) : null,
        puvodni_status: puvodni ? puvodni.status : null,
        duvod: `Návrh z běhu ${soubor.beh}, který kontrola faktů podržela (${n.problemy.join(", ")}), přijal vlastník.${duvod ? ` Důvod: ${duvod}` : ""}`,
        prijato_z_behu: soubor.beh,
      },
    });
    if (snimek) snimek.statuses[bod] = n.zaznam.status;
    if (faktcheck && faktcheck.body) delete faktcheck.body[bod];
    prijato.push(bod);
  }
  const vlastni = [];
  for (const [bod, v] of Object.entries(soubor.vlastni || {}).sort(([a], [b]) => a.localeCompare(b, "cs", { numeric: true }))) {
    const puvodni = evals.evals[bod];
    const zaznam = vlastniZaznam(puvodni, v, evals.lastUpdated || `${dnes}T00:00:00.000Z`);
    const problemy = (soubor.navrhy[bod] && soubor.navrhy[bod].problemy) || (soubor.body && soubor.body[bod]) || [];
    evals.evals[bod] = zaznam;
    audit.entries.push({
      ...radekAuditu(bod, zaznam, dnes, "vlastník"),
      oprava: {
        puvodni_zaznam: puvodni && puvodni.updatedAt ? puvodni.updatedAt.slice(0, 10) : null,
        puvodni_status: puvodni ? puvodni.status : null,
        duvod: `Bod z běhu ${soubor.beh}, který kontrola faktů podržela${problemy.length ? ` (${problemy.join(", ")})` : ""}. Vlastník nepřijal návrh ani dosavadní záznam a stav a komentář napsal sám; anglickou verzi přeložil ${v.preklad || "model"}.`,
        vlastni_z_behu: soubor.beh,
      },
    });
    if (snimek) snimek.statuses[bod] = zaznam.status;
    if (faktcheck && faktcheck.body) delete faktcheck.body[bod];
    vlastni.push(bod);
  }
  if (faktcheck) faktcheck.prijato_vlastnikem = prijato;
  return { evals, audit, hist, faktcheck, prijato, vlastni };
}

/** Přísné čtení příkazů z komentáře: jen celé řádky, jen známé tvary. Nic se nespouští.
 *  /prijmout <bod> [duvod: …], /podrzet <bod>, /zverejnit (sloučit PR a nasadit web)
 *  a blok /opravit <bod> (vlastní hodnocení, níže). */
const PRIKAZ = /^\/(prijmout|podrzet)\s+(\d{1,2}\.\d{1,2})(?:\s+duvod:\s*(\S.{3,498}))?\s*$/;
const ZVEREJNIT = /^\/zverejnit\s*$/;
/* Vlastní hodnocení (vlastník, 3. 11. 2026): s webem ani s návrhem
   nesouhlasí a stav i komentář napíše sám. Blok řádků:
     /opravit 2.13
     stav: probíhá
     komentar: …        (smí pokračovat na dalších řádcích)
     doklad: …          (prázdné = doklad z webu)
     datum: RRRR-MM-DD  (prázdné = datum dokladu z webu)
   Řádek s # je nápověda ze šablony. Blok končí dalším příkazem nebo koncem
   textu. Neměřitelnost se tu nenastavuje: běh ji píše podle seznamu
   nemeritelne.txt, takže by ji příští měsíc stejně přepsal. */
const OPRAVIT = /^\/opravit\s+(\d{1,2}\.\d{1,2})\s*$/;
const POLE_OPRAVY = /^(stav|koment[aá][rř]|doklad|datum)\s*:\s*(.*)$/i;
const holy = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const STAV_Z_TEXTU = Object.fromEntries(Object.entries(NAZVY_STAVU).flatMap(([k, cs]) => [[holy(cs), k], [k, k]]));

function opravaZBloku({ bod, pole }) {
  const p = { prikaz: "opravit", bod };
  const seznam = Object.values(NAZVY_STAVU).join(", ");
  const stavText = holy(pole.stav);
  if (stavText === "nemeritelne") return { ...p, chyba: `${bod}: neměřitelnost se nastavuje v seznamu scripts/nastaveni/nemeritelne.txt, ne tady — za „stav:“ napiš jeden z: ${seznam}` };
  const stav = STAV_Z_TEXTU[stavText];
  if (!stav) return { ...p, chyba: `${bod}: ${stavText ? `stav „${String(pole.stav).slice(0, 40)}“ neznám` : "chybí stav"} — za „stav:“ napiš jeden z: ${seznam}` };
  const komentar = String(pole.komentar || "").replace(/\s+/g, " ").trim();
  if (komentar.length < 20) return { ...p, chyba: `${bod}: chybí komentář — za „komentar:“ napiš aspoň jednu větu` };
  if (komentar.length > 1500) return { ...p, chyba: `${bod}: komentář má přes 1500 znaků — zkrať ho` };
  const datum = String(pole.datum || "").trim();
  if (datum && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { ...p, chyba: `${bod}: datum dokladu piš jako RRRR-MM-DD, třeba 2026-10-14` };
  const doklad = String(pole.doklad || "").replace(/\s+/g, " ").trim();
  return { ...p, stav, komentar, doklad: doklad || null, datum: datum || null };
}

export function prikazyZKomentare(text) {
  const out = [];
  let blok = null;
  const uzavri = () => { if (blok) out.push(opravaZBloku(blok)); blok = null; };
  for (const radek of String(text || "").split(/\r?\n/)) {
    const r = radek.trim();
    const o = r.match(OPRAVIT);
    const m = r.match(PRIKAZ);
    const zverejnit = ZVEREJNIT.test(r);
    if (o || m || zverejnit) uzavri();
    if (o) blok = { bod: o[1], pole: {}, posledni: null };
    else if (m) out.push({ prikaz: m[1], bod: m[2], duvod: m[3] ? m[3].trim() : null });
    else if (zverejnit) out.push({ prikaz: "zverejnit" });
    else if (blok && r && !r.startsWith("#")) {
      const pole = r.match(POLE_OPRAVY);
      if (pole) { blok.posledni = holy(pole[1]); blok.pole[blok.posledni] = pole[2].trim(); }
      else if (blok.posledni === "komentar") blok.pole.komentar = `${blok.pole.komentar} ${r}`;
    }
  }
  uzavri();
  return out;
}

/** Obsah souboru za tlačítkem „Vlastní hodnocení“. Doklad z webu se do
 *  odkazu nepředvyplňuje: zakódovaný by e-mail nafoukl o desítky kB a Gmail
 *  ho ořezává už nad ~100 kB. Prázdný doklad = zůstane ten z webu. */
export function sablonaOpravy(bod) {
  return [`/opravit ${bod}`, "stav: ", "komentar: ", "doklad: ", "datum: ",
    `# stav: ${Object.values(NAZVY_STAVU).join(" | ")}`,
    "# doklad a datum (RRRR-MM-DD) nech prázdné, zůstanou z webu"].join("\n");
}

/* Větev s návrhy: beh/RRRR-MM, u generálky beh/RRRR-MM-zkouska (PR proti
   zahazovací větvi zkouska/RRRR-MM, nic nejde na web ani na Instagram). */
export const VETEV_BEHU = /^beh\/\d{4}-\d{2}(-zkouska)?$/;

/* Rozhodnutí jedním klepnutím z e-mailu. GitHub neumí předvyplnit komentář
   v PR, ale umí předvyplnit nový soubor ve větvi: odkaz otevře editor se
   souborem rozhodnuti/<bod>-<příkaz>.txt a příkazem uvnitř a vlastník jen
   potvrdí commit. Push do beh/** spustí rozhodnuti-vetev.yml, které příkaz
   provede, soubor smaže a odpoví do PR. Na rozdíl od issue (to GitHub předá
   jen workflow z výchozí větve) to funguje v každé větvi — i v generálce
   na DEV2. Na větev smí pushovat jen vlastník. */
export function odkazRozhodnuti(repo, vetev, prikaz) {
  const m = prikaz.match(/^\/(prijmout|podrzet|opravit)\s+(\d{1,2}\.\d{1,2})/);
  const jmeno = m ? `${m[2]}-${m[1]}` : prikaz.replace(/^\//, "").split(/\s/)[0];
  return `https://github.com/${repo}/new/${vetev}?filename=rozhodnuti/${encodeURIComponent(jmeno)}.txt&value=${encodeURIComponent(prikaz)}`;
}

/** Příkazy ze souborů rozhodnuti/ ve větvi (odkazy z e-mailu).
 *  @param soubory [{ jmeno, text, poradi }] — poradi = čas commitu, který soubor přidal
 *  @returns { prikazy, neplatne: [jméno souboru bez platného příkazu] }
 *  Pořadí je pořadí přidání: „přijmout“ a pak „nechat“ u téhož bodu znamená
 *  nechat. Soubor bez platného příkazu (třeba „duvod:“ bez důvodu) se jen ohlásí. */
export function prikazyZeSouboru(soubory) {
  const prikazy = [], neplatne = [];
  for (const s of [...soubory].sort((a, b) => a.poradi - b.poradi || a.jmeno.localeCompare(b.jmeno))) {
    const p = prikazyZKomentare(String(s.text || "").slice(0, 4000));
    if (p.length) prikazy.push(...p); else neplatne.push(s.jmeno);
  }
  return { prikazy, neplatne };
}
