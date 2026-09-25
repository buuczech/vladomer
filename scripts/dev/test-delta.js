/* scripts/dev/test-delta.js — delta sken offline a zdarma: čtení odpovědi
 * a plán kapitoly.
 *
 *     node scripts/dev/test-delta.js
 *
 * Na tomhle parseru stojí celý týdenní běh: bod bez události se nepřehodnocuje,
 * takže když parser mlčí, běh nic nezmění a v měření stability to vypadá jako
 * dokonalá reprodukovatelnost. Testuje se hlavně to, že se nedá umlčet potichu —
 * a že nečitelný sken vede k přehodnocení celé kapitoly, ne k razítku
 * „prověřeno beze změny" u bodů, na které se nikdo nepodíval — a že přenesený
 * záznam se nehlásí jako „změna tohoto týdne" (src/zmeny.js).
 */
import { parsujDeltaOdpoved, planKapitoly, prenesNeprehodnocene } from "../lib/delta.js";
import { zmenaPoslednihoBehu } from "../../src/zmeny.js";

const ID = new Set(["1.1", "1.2", "1.3"]);
const UD = (id, datum) => `{"id":"${id}","udalost":"Sněmovna schválila.","datum":"${datum}","zdroje":["https://psp.cz/a"]}`;

let spadlo = 0, kontrol = 0;
function over(ok, popis, detail) {
  kontrol++;
  if (!ok) spadlo++;
  console.log(`${ok ? "ok  " : "CHYBA"} ${popis}`);
  if (!ok && detail) console.log(`      ${detail}`);
}
const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const PRIPADY = [
  {
    proc: "čisté JSON pole projde",
    text: `[${UD("1.2", "2026-08-18")}]`,
    ceka: { ids: ["1.2"], chyba: null },
  },
  {
    proc: "pole v ```json bloku projde",
    text: "```json\n[" + UD("1.1", "2026-08-15") + "]\n```",
    ceka: { ids: ["1.1"], chyba: null },
  },
  {
    proc: "próza kolem pole nevadí",
    text: `Na základě vyhledávání:\n[${UD("1.3", "2026-08-20")}]\nDoufám, že pomůže.`,
    ceka: { ids: ["1.3"], chyba: null },
  },
  {
    proc: "klidný týden = prázdné pole, NENÍ chyba",
    text: "[]",
    ceka: { ids: [], chyba: null },
  },
  {
    proc: "odpověď bez pole se hlásí jako chyba, ne jako klid",
    text: "Za uvedené období jsem nenašel žádné relevantní události.",
    ceka: { ids: [], chyba: "bez-json-pole" },
  },
  {
    proc: "rozbitý JSON se hlásí jako chyba, ne jako klid",
    text: '[{"id":"1.1","datum":}]',
    ceka: { ids: [], chyba: "nevalidni-json" },
  },
  {
    proc: "pole zabalené v objektu se přečte (shovívavost, ne chyba)",
    text: `{"udalosti":[${UD("1.1", "2026-08-18")}]}`,
    ceka: { ids: ["1.1"], chyba: null },
  },
  {
    proc: "JEDNA událost jako holý objekt se hlásí — jinak by vyříznuté "
      + "„zdroje“ prošly jako klidný týden",
    text: '{"id":"1.1","udalost":"x","datum":"2026-08-18","zdroje":["https://a"]}',
    ceka: { ids: [], chyba: "pole-neni-seznam-udalosti" },
  },
  /* Skutečný tvar odpovědí z běhů 28. 8., 4. 9. a 11. 9. 2026: úvodní věta
     s odkazy na body v hranatých závorkách, seznam až za ní. Původní hledání
     „od první [ po poslední ]" začalo na „[1.2]" a nepřečetlo nic. */
  {
    proc: "próza s odkazem [1.2] před seznamem (padaly na tom 3 běhy po sobě)",
    text: `Vyhledal jsem události.\n**[1.2] Rozpočet:** vláda 8. 9. schválila návrh.\n[${UD("1.2", "2026-09-08")}]`,
    ceka: { ids: ["1.2"], chyba: null },
  },
  {
    proc: "próza s odkazy [1.1] a [1.3] a prázdný seznam = klidný týden",
    text: "U bodů [1.1] a [1.3] jsem od 4. 9. nic nového nenašel.\n[]",
    ceka: { ids: [], chyba: null },
  },
  {
    proc: "holý objekt s prázdnými zdroji v próze se hlásí — prázdné „zdroje“ nejsou klid",
    text: 'Našel jsem jednu událost:\n{"id":"1.1","udalost":"x","datum":"2026-09-08","zdroje":[]}',
    ceka: { ids: [], chyba: "pole-neni-seznam-udalosti" },
  },
  {
    proc: "useknutý seznam se hlásí, nečte se napůl",
    text: `Výsledek:\n[${UD("1.1", "2026-09-08")},{"id":"1.2","udalost":"Senát`,
    ceka: { ids: [], chyba: "pole-neni-seznam-udalosti" },
  },
  {
    proc: "vymyšlené id se zahodí",
    text: `[${UD("9.9", "2026-08-18")},${UD("1.1", "2026-08-18")}]`,
    ceka: { ids: ["1.1"], chyba: null, ciziId: 1 },
  },
  {
    proc: "událost bez data se zahodí (brána stojí na datovaném dokladu)",
    text: '[{"id":"1.1","udalost":"Něco se chystá.","zdroje":[]}]',
    ceka: { ids: [], chyba: null, bezData: 1 },
  },
  {
    proc: "nesmyslné datum se zahodí",
    text: `[${UD("1.1", "loni v srpnu")}]`,
    ceka: { ids: [], chyba: null, bezData: 1 },
  },
  {
    proc: "zdroje se ořežou na strop",
    text: '[{"id":"1.1","udalost":"x","datum":"2026-08-18",'
      + '"zdroje":["https://a","https://b","https://c","https://d"]}]',
    ceka: { ids: ["1.1"], chyba: null, zdroju: 3 },
  },
  {
    proc: "nestringové zdroje se vyhodí",
    text: '[{"id":"1.1","udalost":"x","datum":"2026-08-18","zdroje":[null,42,"https://a"]}]',
    ceka: { ids: ["1.1"], chyba: null, zdroju: 1 },
  },
  {
    proc: "prázdná odpověď je chyba, ne klid",
    text: "",
    ceka: { ids: [], chyba: "bez-json-pole" },
  },
];

for (const p of PRIPADY) {
  const r = parsujDeltaOdpoved(p.text, ID, 3);
  const ids = Object.keys(r.udalosti).sort();
  const potize = [];
  if (!stejne(ids, p.ceka.ids)) potize.push(`id: čekáno [${p.ceka.ids}], vyšlo [${ids}]`);
  if ((r.chyba || null) !== (p.ceka.chyba || null)) potize.push(`chyba: čekáno ${p.ceka.chyba}, vyšlo ${r.chyba}`);
  if (p.ceka.ciziId && r.zahozeno.ciziId !== p.ceka.ciziId) {
    potize.push(`cizí id: čekáno ${p.ceka.ciziId}, vyšlo ${r.zahozeno.ciziId}`);
  }
  if (p.ceka.bezData && r.zahozeno.bezData !== p.ceka.bezData) {
    potize.push(`bez data: čekáno ${p.ceka.bezData}, vyšlo ${r.zahozeno.bezData}`);
  }
  if (p.ceka.zdroju !== undefined) {
    const n = (r.udalosti[p.ceka.ids[0]] || {}).zdroje.length;
    if (n !== p.ceka.zdroju) potize.push(`zdrojů: čekáno ${p.ceka.zdroju}, vyšlo ${n}`);
  }
  over(!potize.length, p.proc, potize.join("; "));
}

/* Nejdůležitější rozdíl celého souboru: klid a porucha se NESMÍ projevit
   stejně. Obojí vrátí nula událostí — poznat je jde jen podle „chyba". */
{
  const klid = parsujDeltaOdpoved("[]", ID, 3);
  const porucha = parsujDeltaOdpoved("Nenašel jsem nic.", ID, 3);
  const nula = !Object.keys(klid.udalosti).length && !Object.keys(porucha.udalosti).length;
  over(nula && klid.chyba === null && Boolean(porucha.chyba), "klidný týden a nečitelná odpověď jdou rozlišit");
}

// Bez ukázky zbude v logu jen kód chyby a skutečnou odpověď už nikdo neuvidí.
{
  const r = parsujDeltaOdpoved("Za uvedené období jsem nenašel nic nového.", ID, 3);
  over(Boolean(r.ukazka) && r.ukazka.includes("nenašel"), "nečitelná odpověď nese ukázku textu pro log",
    `ukazka: ${r.ukazka}`);
}

/* Plán kapitoly a razítko „prověřeno". Kapitola 4 nesla 11. 9. 2026 na webu
   „prověřeno beze změny", přestože její sken nešel přečíst a od 28. 8. se na ni
   nikdo nepodíval — a totéž razítko vypnulo upozornění na zastaralou kapitolu. */
{
  const body = [{ id: "4.1" }, { id: "4.2" }, { id: "4.3" }];
  const prev = { "4.1": { status: "declared" }, "4.2": { status: "partial" }, "4.3": { status: "in_progress" } };
  const ted = "2026-09-18T09:00:00.000Z";
  const ids = (b) => b.map((x) => x.id);

  const precteny = planKapitoly({
    rezim: "delta", sken: { udalosti: { "4.2": { datum: "2026-09-10" } }, chyba: null },
    vsechnyBody: body, prevEvals: prev,
  });
  over(stejne(ids(precteny.bodyKHodnoceni), ["4.2"]) && !precteny.plnyAudit && precteny.skenPokryl,
    "přečtený sken: přehodnotí se jen bod s událostí", JSON.stringify(precteny));
  const p1 = prenesNeprehodnocene({ vsechnyBody: body, pridat: { "4.2": { status: "in_progress" } },
    dosavadni: prev, plan: precteny, ted });
  over(stejne(Object.keys(p1.doplnit), ["4.1", "4.3"]) && p1.doplnit["4.1"].overeno === ted
      && p1.doplnit["4.1"].change.cs === "beze změny" && !p1.vynechane.length,
    "přečtený sken: body bez události dostanou „prověřeno beze změny“", JSON.stringify(p1));

  const necitelny = planKapitoly({
    rezim: "delta", sken: { udalosti: {}, chyba: "nevalidni-json" }, vsechnyBody: body, prevEvals: prev,
  });
  over(stejne(ids(necitelny.bodyKHodnoceni), ["4.1", "4.2", "4.3"]) && necitelny.plnyAudit
      && necitelny.nahradni && !necitelny.skenPokryl,
    "nečitelný sken: přehodnotí se celá kapitola, přechody jako v plném auditu", JSON.stringify(necitelny));
  const p2 = prenesNeprehodnocene({ vsechnyBody: body, pridat: { "4.1": {}, "4.3": {} },
    dosavadni: prev, plan: necitelny, ted });
  over(!Object.keys(p2.doplnit).length && stejne(p2.vynechane, ["4.2"]),
    "bod, který model vynechal, zůstane jak byl a BEZ razítka", JSON.stringify(p2));

  const plny = planKapitoly({ rezim: "plny", sken: null, vsechnyBody: body, prevEvals: prev });
  const p3 = prenesNeprehodnocene({ vsechnyBody: body, pridat: { "4.1": {}, "4.2": {} },
    dosavadni: prev, plan: plny, ted });
  over(plny.plnyAudit && !Object.keys(p3.doplnit).length && stejne(p3.vynechane, ["4.3"]),
    "plný audit: vynechaný bod razítko nedostane", JSON.stringify(p3));

  const novy = planKapitoly({
    rezim: "delta", sken: { udalosti: {}, chyba: null }, vsechnyBody: [...body, { id: "4.4" }], prevEvals: prev,
  });
  over(stejne(ids(novy.bodyKHodnoceni), ["4.4"]), "nový bod bez hodnocení se přehodnotí i v klidném týdnu",
    JSON.stringify(novy));
}

/* Co je „změna tohoto týdne" (src/zmeny.js). Přenesený záznam nese minulé
   previousStatus beze změny, takže bod 12.6, změněný 28. 8. 2026, se jako
   čerstvá změna hlásil na webu i v příspěvcích ještě 4., 11. a 18. 9. */
{
  const beh = "2026-09-18T12:34:09.194Z";
  const z = (prev, st, upd) => ({ previousStatus: prev, status: st, updatedAt: upd });
  over(zmenaPoslednihoBehu(z("partial", "declared", "2026-09-18T12:12:40.000Z"), beh),
    "přechod zapsaný tímhle během je změna tohoto týdne");
  over(!zmenaPoslednihoBehu(z("not_started", "partial", "2026-08-28T20:53:47.622Z"), beh),
    "přenesený přechod z 28. 8. (bod 12.6) změna tohoto týdne NENÍ");
  over(!zmenaPoslednihoBehu({ ...z("in_progress", "in_progress", "2026-09-11T12:00:00.000Z"), overeno: beh }, beh),
    "bod bez přechodu se nehlásí, ani když ho běh prověřil");
  over(!zmenaPoslednihoBehu({ ...z("in_progress", "partial", "2026-09-11T12:10:00.000Z"), overeno: beh }, beh),
    "podržený nebo ručně vrácený záznam (updatedAt z minula) se nehlásí");
  over(zmenaPoslednihoBehu(z("declared", "in_progress", "2026-08-28T18:10:00.000Z"), "2026-08-28T21:05:00.000Z"),
    "druhý běh téhož dne: přechod prvního běhu je pořád tohoto týdne");
  over(!zmenaPoslednihoBehu(z("declared", "in_progress", "2026-09-18T12:00:00.000Z"), null)
      && !zmenaPoslednihoBehu(null, beh) && !zmenaPoslednihoBehu(z(null, "partial", beh), beh),
    "chybějící lastUpdated, záznam nebo previousStatus = žádná změna");
}

console.log(spadlo ? `\n${spadlo} selhání z ${kontrol} kontrol.` : `\nVšech ${kontrol} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
