/* scripts/lib/navrhy.js — návrhy, o kterých rozhoduje vlastník v PR beh/RRRR-MM (spec 005).
 *
 * Měsíční běh zveřejní ověřené a podrží sporné (vrstva R). Podržené body
 * s navrženým záznamem jdou do PR: Merge = přijmout, Close = nechat.
 * Po bodech rozhoduje vlastník komentářem /prijmout a /podrzet.
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
 */

const vyvraceny = (problemy) => problemy.some((p) => p === "m-vyvraceno" || p.startsWith("d:"));

/** Návrhy z rozhodnutí vrstvy R: bod → { zaznam, problemy, vyvraceny, typ }. */
export function navrhyZRozhodnuti(rozhodnuti) {
  const out = {};
  for (const b of Object.values(rozhodnuti.body || {})) {
    const n = b.vlastnik && b.vlastnik.navrh;
    if (!n || n.zdroj !== "hodnotitel" || !n.zaznam) continue;
    out[b.bod] = { zaznam: n.zaznam, problemy: b.problemy, vyvraceny: vyvraceny(b.problemy), typ: b.vlastnik.typ };
  }
  return out;
}

/** Soubor rozhodnutí PR. Ve výchozím stavu přijaté vše, co není vyvrácené. */
export function novySoubor({ rozhodnuti, zaklad }) {
  const navrhy = navrhyZRozhodnuti(rozhodnuti);
  const prijate = {};
  for (const [bod, n] of Object.entries(navrhy)) if (!n.vyvraceny) prijate[bod] = { duvod: null };
  return { beh: rozhodnuti.beh, zaklad, navrhy, prijate, historie: [] };
}

/**
 * Příkaz vlastníka. Vrací { ok, zprava } — zpráva jde do odpovědi v PR.
 * @param prikaz "prijmout" | "podrzet"
 */
export function proved(soubor, { prikaz, bod, duvod = null, kdo = "vlastník", kdy = new Date().toISOString() }) {
  const n = soubor.navrhy[bod];
  if (!n) return { ok: false, zprava: `Bod ${bod} v tomto běhu žádný návrh nemá.` };
  if (prikaz === "podrzet") {
    delete soubor.prijate[bod];
    soubor.historie.push({ kdy, kdo, prikaz, bod });
    return { ok: true, zprava: `${bod}: zůstane minulý záznam.` };
  }
  if (prikaz === "zverejnit") return { ok: true, zprava: "Zveřejňuji: PR se sloučí do main a web se nasadí." };
  if (prikaz === "prijmout") {
    if (n.vyvraceny && !duvod) return { ok: false, zprava: `${bod}: kontrola faktů tvrzení vyvrátila — přijmout jde jen s důvodem: /prijmout ${bod} duvod: …` };
    soubor.prijate[bod] = { duvod: duvod || null };
    soubor.historie.push({ kdy, kdo, prikaz, bod, ...(duvod ? { duvod } : {}) });
    return { ok: true, zprava: `${bod}: návrh přijat${duvod ? " s důvodem, který se zapíše do auditu" : ""}.` };
  }
  return { ok: false, zprava: `Neznámý příkaz ${prikaz}.` };
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

/**
 * Složí soubory větve: zveřejněná data běhu + přijaté návrhy.
 * @param zaklad { evals: evaluations.json, audit: audit.json, hist: history.json, faktcheck?: faktcheck.json } z commitu běhu (kopie se upraví)
 * @param dnes   den přijetí (datum řádku auditu)
 * @returns { evals, audit, hist, faktcheck, prijato: [bod] }
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
  if (faktcheck) faktcheck.prijato_vlastnikem = prijato;
  return { evals, audit, hist, faktcheck, prijato };
}

/** Přísné čtení příkazů z komentáře: jen celé řádky, jen známé tvary. Nic se nespouští.
 *  /prijmout <bod> [duvod: …], /podrzet <bod>, /zverejnit (sloučit PR a nasadit web). */
const PRIKAZ = /^\/(prijmout|podrzet)\s+(\d{1,2}\.\d{1,2})(?:\s+duvod:\s*(\S.{3,498}))?\s*$/;
const ZVEREJNIT = /^\/zverejnit\s*$/;
export function prikazyZKomentare(text) {
  const out = [];
  for (const radek of String(text || "").split(/\r?\n/)) {
    const r = radek.trim();
    const m = r.match(PRIKAZ);
    if (m) out.push({ prikaz: m[1], bod: m[2], duvod: m[3] ? m[3].trim() : null });
    else if (ZVEREJNIT.test(r)) out.push({ prikaz: "zverejnit" });
  }
  return out;
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
  const m = prikaz.match(/^\/(prijmout|podrzet)\s+(\d{1,2}\.\d{1,2})/);
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
    const p = prikazyZKomentare(String(s.text || "").slice(0, 2000));
    if (p.length) prikazy.push(...p); else neplatne.push(s.jmeno);
  }
  return { prikazy, neplatne };
}
