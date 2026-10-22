/* scripts/lib/faktcheck/rozhodnuti.js — co z běhu smí na web (spec 004, vrstva R).
 *
 * Běh se zveřejní vždy (rozhodnutí vlastníka); bod, u kterého kontrola faktů
 * něco nepotvrdila, zůstane na posledním ověřeném záznamu a rozhoduje o něm
 * člověk. Tady je jediné místo, které to rozhoduje — čistá funkce nad tím,
 * co bylo před během, co běh navrhl, a co našly vrstvy D a M.
 *
 * Proč to nedělá brána přechodů (lib/prechody.js, stejná jako na main):
 * brána vidí jen přechody a jen text hodnotitele. Kontrola faktů vidí i
 * záznam, jehož stav se nezměnil, a ověřuje proti zdrojům. A brána oprav
 * nepouští: oprava chybně zveřejněného stavu nemá událost (7.2 „porušeno“,
 * které nikdy porušeno nebylo), takže by ji brána podržela navždy. Takový
 * návrh tu jde vlastníkovi (FR-009) — nikdy potichu na web ani do koše.
 */

/** Stav, jak ho čte web: neměřitelnost má přednost před statusem. */
export const stavZaznamu = (e) => (e ? (e.unverifiable ? "unverifiable" : e.status) : null);

/* Obsah záznamu bez razítka „prověřeno“ — razítko říká, kdy se někdo díval,
   ne co bod tvrdí. Dva záznamy se stejným obsahem se liší jen jím. */
const obsah = (e) => { if (!e) return null; const { overeno, ...zbytek } = e; return JSON.stringify(zbytek); };
/* Jediný problém je neověřené tvrzení (kolo 2 případně nad stropem). */
const jenNeovereno = (problemy) => problemy.length > 0 && problemy.every((p) => p === "m-neovereno" || p === "m-kolo2-strop");

/**
 * Problémy, které kontrola faktů našla na záznamu (kódy pro report a audit).
 *   d:<pravidlo>        CHYBA vrstvy D na tvrzení, které nese stav
 *   m-nezkontrolovano   vrstva M bod nezkontrolovala (technicky) — nikdy nevyjde jako ověřený
 *   m-vyvraceno         ověřeně vyvrácené tvrzení nesoucí stav
 *   m-neovereno         tvrzení nesoucí stav, které nešlo ověřit ani v kole 2
 *   m-spor              podle pravidel vlastníka (metodika.md) fakta zakládají jiný stav
 *   m-neovereno-absence změna stavu stojí na neověřeném tvrzení, že něco nenastalo
 *                       (přidává rozhodniBod jen u přechodu — rozhodnutí vlastníka A)
 * VAROVÁNÍ vrstvy D bod nedrží: jde do reportu, rozhodne model a vlastník.
 */
export function problemyBodu(nalezyD = [], m = null) {
  const p = [];
  for (const n of nalezyD) if (n.zavaznost === "CHYBA" && n.nesestav) p.push(`d:${n.pravidlo}`);
  const s = m && m.shrnuti;
  if (!s || s.nezkontrolovano) p.push("m-nezkontrolovano");
  else {
    if (s.vyvraceno > 0) p.push("m-vyvraceno");
    if (s.neovereno > 0) p.push("m-neovereno");
    // Vysvětlení pro vlastníka: kolo 2 by tvrzení možná ověřilo, ale nevešlo se do stropu.
    if (s.neovereno > 0 && m.kolo2_vynechano === "strop") p.push("m-kolo2-strop");
    if (s.spor_o_stav) p.push("m-spor");
  }
  return [...new Set(p)];
}

/**
 * Rozhodnutí o jednom bodu.
 * @param pred       záznam před během (zveřejněný minule)
 * @param po         záznam po běhu (to, co evaluate.js zapsal po bráně)
 * @param nalezyD    nálezy vrstvy D k bodu
 * @param m          výsledek vrstvy M k bodu ({ shrnuti, finalni }), null = neběžela
 * @param neprijaty  návrh, který brána podržela / ověřovatel zamítl (NAVRHY_BEHU), nebo null
 * @param kalibrace  první měsíční běhy: každý přechod stavu schvaluje vlastník
 * @param nemeritelne  body, které vlastník rozhodl jako neměřitelné (nemeritelne.txt)
 * @returns {{ bod, akce: "zverejnit"|"podrzet"|"bez-razitka", zaznam, problemy, prechod, vlastnik }}
 *   zverejnit    na web jde záznam z běhu
 *   podrzet      na web jde CELÝ předchozí záznam (běh ho přepsal, ale neprošel)
 *   bez-razitka  záznam se nezměnil, ale kontrola ho nepotvrdila: zůstane, jak byl,
 *                bez nového „prověřeno beze změny“ — to by bylo nepravdivé
 *   vlastnik     null, nebo { typ, navrh } — co jde do PR a reportu
 */
export function rozhodniBod({ bod, pred: predZBehu, po, nalezyD = [], m = null, neprijaty = null, kalibrace = false, nemeritelne = new Set() }) {
  /* Rozhodnutí vlastníka o neměřitelnosti platí i pro předchozí záznam:
     není to tvrzení modelu ani přechod, který by šlo ověřit citací. Bez
     toho by záznam, který se od minula liší jen jím, šel jako „přechod
     bez nové události“ k vlastníkovi každý měsíc znovu (5.4 a 1.2 v měření
     21. 10. 2026) a podržený bod by na webu zůstal měřitelný. */
  const pred = predZBehu && nemeritelne.has(bod) && !predZBehu.unverifiable ? { ...predZBehu, unverifiable: true } : predZBehu;
  const problemy = problemyBodu(nalezyD, m);
  const zmenen = !pred || obsah(pred) !== obsah(po);
  const prechod = pred && stavZaznamu(pred) !== stavZaznamu(po) ? { z: stavZaznamu(pred), na: stavZaznamu(po) } : null;
  const s = (m && m.shrnuti) || {};
  const navrhKontroly = s.stav_podle_pravidel
    ? { zdroj: "kontrola", stav: s.stav_podle_pravidel, pravidlo: s.pravidlo || null, zduvodneni: (m.finalni && m.finalni.zduvodneni) || "" }
    : null;

  if (zmenen) {
    /* Přechod musí stát na události, kterou kontrola potvrdila citací ze
       zdroje. Nový úsudek o týchž faktech (stejný doklad) událost není —
       je to oprava a o té rozhoduje vlastník, ne program (10.2 v měření
       20. 10. 2026: správně, ale bez události). */
    /* Tvrzení, že něco nenastalo, citací doložit nejde. Bod, jehož stav se
       nemění, kvůli němu nedrží; změna stavu na něm stát nesmí (vlastník,
       21. 10. 2026 — platí do napojení otevřených dat Sněmovny, spec 006). */
    if (prechod && s.neovereno_absence > 0) problemy.push("m-neovereno-absence");
    if (prechod && !problemy.length) {
      if (pred && String(pred.evidence || "") === String(po.evidence || "")) problemy.push("prechod-bez-noveho-dokladu");
      else if (!(s.potvrzeno > 0)) problemy.push("prechod-bez-potvrzene-udalosti");
    }
    if (prechod && kalibrace) problemy.push("kalibrace");
    if (!problemy.length) return { bod, akce: "zverejnit", zaznam: po, problemy, prechod, vlastnik: null };
    /* Stav se nemění a kontrola jen nepotvrdila novou formulaci: na web jde
       minulý záznam bez nového razítka a vlastník nic nerozhoduje — nebylo by
       o čem (vlastník, 22. 10. 2026; v generálce 64 ze 107 bodů k rozhodnutí). */
    if (pred && !prechod && jenNeovereno(problemy)) return { bod, akce: "podrzet", zaznam: pred, problemy, prechod, vlastnik: null };
    // Nový bod nemá co podržet: zveřejní se, ale vlastník ho dostane.
    if (!pred) return { bod, akce: "zverejnit", zaznam: po, problemy, prechod, vlastnik: { typ: "novy-bod-s-nalezem", navrh: null } };
    const typ = problemy.includes("kalibrace") && problemy.length === 1 ? "kalibrace"
      : problemy.some((p) => p.startsWith("prechod-bez")) ? "oprava-bez-udalosti" : "podrzeno";
    return { bod, akce: "podrzet", zaznam: pred, problemy, prechod, vlastnik: { typ, navrh: { zdroj: "hodnotitel", zaznam: po }, kontrola: navrhKontroly } };
  }

  // Záznam se nezměnil (nanejvýš razítko).
  if (!problemy.length) return { bod, akce: "zverejnit", zaznam: po, problemy, prechod: null, vlastnik: null };
  /* Kontrola nepotvrdila to, co už na webu je. Podržet nejde (není co),
     a razítko „prověřeno“ by lhalo. Když hodnotitel navrhl jiný stav a
     brána ho podržela, jde ten návrh vlastníkovi (FR-009) — stav, který
     kontrola zpochybnila, se jinak nikdy nespraví. */
  const zpochybnen = problemy.some((p) => p === "m-vyvraceno" || p === "m-spor" || p.startsWith("d:"));
  let vlastnik;
  if (neprijaty && zpochybnen && (!s.stav_podle_pravidel || s.stav_podle_pravidel === stavZaznamu(neprijaty.navrh) || problemy.includes("m-vyvraceno"))) {
    vlastnik = { typ: "oprava-bez-udalosti", navrh: { zdroj: "hodnotitel", zaznam: neprijaty.navrh, brana: { akce: neprijaty.akce, duvod: neprijaty.duvod } }, kontrola: navrhKontroly };
  } else if (problemy.includes("m-spor")) {
    vlastnik = { typ: "spor", navrh: navrhKontroly };
  } else if (jenNeovereno(problemy)) {
    vlastnik = null; // jako výš: zůstává, jak je, bez razítka; rozhodovat není o čem
  } else {
    vlastnik = { typ: problemy.includes("m-nezkontrolovano") ? "nezkontrolovano" : "uz-zverejneno", navrh: null };
  }
  return { bod, akce: "bez-razitka", zaznam: pred || po, problemy, prechod: null, vlastnik };
}

/**
 * Rozhodne celý běh.
 * @returns { evals (k zveřejnění), body: { id → rozhodnutí bez záznamu }, souhrn }
 */
export function rozhodniBeh({ pred = {}, po = {}, nalezy = [], modelova = null, neprijate = {}, kalibrace = false, nemeritelne = new Set() }) {
  const nalezyPodleBodu = {};
  for (const n of nalezy) (nalezyPodleBodu[n.bod] = nalezyPodleBodu[n.bod] || []).push(n);
  const evals = {};
  const body = {};
  for (const [bod, zaznamPo] of Object.entries(po)) {
    const r = rozhodniBod({
      bod, pred: pred[bod] || null, po: zaznamPo,
      nalezyD: nalezyPodleBodu[bod] || [],
      m: modelova && modelova.body ? modelova.body[bod] || null : null,
      neprijaty: neprijate[bod] || null,
      kalibrace, nemeritelne,
    });
    evals[bod] = r.zaznam;
    const { zaznam, ...bezZaznamu } = r;
    body[bod] = bezZaznamu;
  }
  const podle = (a) => Object.values(body).filter((b) => b.akce === a).map((b) => b.bod);
  const souhrn = {
    bodu: Object.keys(body).length,
    zverejneno: podle("zverejnit").length,
    podrzeno: podle("podrzet"),
    bez_razitka: podle("bez-razitka"),
    k_rozhodnuti: Object.values(body).filter((b) => b.vlastnik).map((b) => `${b.bod}:${b.vlastnik.typ}`),
    // Zůstalo na minulém záznamu bez rozhodování vlastníka (stav beze změny, jen neověřená formulace).
    ponechano: Object.values(body).filter((b) => b.akce !== "zverejnit" && !b.vlastnik).map((b) => b.bod),
    kalibrace,
    vrstva_m: Boolean(modelova),
  };
  return { evals, body, souhrn };
}

/** Body, jejichž záznam z běhu na web nešel (podržené a bez razítka). */
export const nezverejnene = (body) => Object.values(body).filter((b) => b.akce !== "zverejnit");

/**
 * Dnešní řádky auditu bodů, jejichž záznam na web nešel, dostanou zadrzeno
 * a kódy kontroly. Jen řádky tohoto běhu (date === dnes, bez „oprava“) —
 * ještě nejsou zveřejněné; starší se nemění (append-only, test-konzistence [G]).
 * @returns počet označených řádků
 */
export function oznacAudit(entries, dnes, body) {
  const drzene = new Map(nezverejnene(body).map((b) => [b.bod, b]));
  let n = 0;
  for (const r of entries) {
    if (r.date !== dnes || r.oprava || !drzene.has(r.id)) continue;
    r.zadrzeno = true;
    r.faktcheck = drzene.get(r.id).problemy;
    n++;
  }
  return n;
}

/** Dnešní snímek historie nese stav, který je opravdu na webu. @returns byl snímek nalezen */
export function upravSnimek(snapshots, dnes, evals, body) {
  const s = snapshots.find((x) => x.date === dnes);
  if (!s) return false;
  for (const b of nezverejnene(body)) s.statuses[b.bod] = evals[b.bod].status;
  return true;
}
