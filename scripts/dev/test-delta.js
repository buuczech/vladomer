/* scripts/dev/test-delta.js — čtení odpovědi delta skenu, offline a zdarma.
 *
 *     node scripts/dev/test-delta.js
 *
 * Na tomhle parseru stojí celý týdenní běh: bod bez události se nepřehodnocuje,
 * takže když parser mlčí, běh nic nezmění a v měření stability to vypadá jako
 * dokonalá reprodukovatelnost. Testuje se hlavně to, že se nedá umlčet potichu.
 */
import { parsujDeltaOdpoved } from "../lib/delta.js";

const ID = new Set(["1.1", "1.2", "1.3"]);
const UD = (id, datum) => `{"id":"${id}","udalost":"Sněmovna schválila.","datum":"${datum}","zdroje":["https://psp.cz/a"]}`;

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

let spadlo = 0;
for (const p of PRIPADY) {
  const r = parsujDeltaOdpoved(p.text, ID, 3);
  const ids = Object.keys(r.udalosti).sort();
  const potize = [];
  if (JSON.stringify(ids) !== JSON.stringify(p.ceka.ids)) {
    potize.push(`id: čekáno [${p.ceka.ids}], vyšlo [${ids}]`);
  }
  if ((r.chyba || null) !== (p.ceka.chyba || null)) {
    potize.push(`chyba: čekáno ${p.ceka.chyba}, vyšlo ${r.chyba}`);
  }
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
  if (potize.length) spadlo++;
  console.log(`${potize.length ? "CHYBA" : "ok  "} ${p.proc}`);
  potize.forEach((t) => console.log(`      ${t}`));
}

/* Nejdůležitější rozdíl celého souboru: klid a porucha se NESMÍ projevit
   stejně. Obojí vrátí nula událostí — poznat je jde jen podle „chyba". */
{
  const klid = parsujDeltaOdpoved("[]", ID, 3);
  const porucha = parsujDeltaOdpoved("Nenašel jsem nic.", ID, 3);
  const stejne = Object.keys(klid.udalosti).length === Object.keys(porucha.udalosti).length;
  if (!stejne || klid.chyba !== null || !porucha.chyba) {
    spadlo++;
    console.log("CHYBA klidný týden a nečitelná odpověď nejdou rozlišit");
  } else {
    console.log("ok   klidný týden a nečitelná odpověď jdou rozlišit");
  }
}

console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${PRIPADY.length + 1} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
