/* scripts/dev/test-odpoved.js — čtení odpovědi hodnoticího modelu, offline.
 *
 *     node scripts/dev/test-odpoved.js
 *
 * Fixtury odpovídají tomu, co se stalo v prvním delta páru: kapitola s jediným
 * bodem selhala ve všech čtyřech případech, kapitola s víc body ani jednou.
 * Když se kapitola nepřečte, její body zůstanou týden staré — proto se tu
 * zkouší každý tvar, který ještě nese hodnocení.
 */
import { parsujHodnoceni } from "../lib/odpoved.js";

const Z = (id) => ({ id, status: "partial", comment_cs: "x", sources: ["https://psp.cz/a"] });
const J = (v) => JSON.stringify(v);

const PRIPADY = [
  { proc: "{items:[…]} — smluvený tvar", text: J({ items: [Z("1.1"), Z("1.2")] }), ceka: ["1.1", "1.2"] },
  { proc: "holé pole", text: J([Z("1.1")]), ceka: ["1.1"] },
  { proc: "pole v ```json bloku", text: "```json\n" + J([Z("1.1")]) + "\n```", ceka: ["1.1"] },
  { proc: "próza kolem pole", text: "Zde je hodnocení:\n" + J([Z("1.1")]) + "\nDoufám, že pomůže.", ceka: ["1.1"] },

  /* Jádro věci: jeden bod vrácený jako holý objekt. Původní čtení hledalo
     první „[", což je u takové odpovědi pole „sources" — vyšel z toho seznam
     řetězců bez jediného hodnocení. */
  { proc: "JEDEN bod jako holý objekt (padaly na tom všechny 1bodové kapitoly)",
    text: J(Z("8.3")), ceka: ["8.3"] },
  { proc: "jeden bod jako holý objekt s prózou okolo",
    text: "Pro tento bod jsem zjistil:\n" + J(Z("8.3")), ceka: ["8.3"] },
  { proc: "mapa id → záznam", text: J({ "1.1": Z("1.1"), "1.2": Z("1.2") }), ceka: ["1.1", "1.2"] },
  { proc: "mapa id → záznam, kde vnitřek id nemá (platí klíč)",
    text: '{"9.4":{"status":"partial","comment_cs":"x"}}', ceka: ["9.4"] },
  { proc: "obálka pojmenovaná po svém", text: J({ hodnoceni: [Z("2.2")] }), ceka: ["2.2"] },

  /* Skutečné odpovědi z generálky 22. 8. 2026. Model uvozuje odpověď prózou
     a odkazuje v ní na body zápisem [2.3] — hledání „od první [ po poslední ]“
     tedy začínalo uprostřed věty a shodilo sedm kapitol z osmnácti. */
  { proc: "próza s odkazy [2.3] před polem, JEDEN bod",
    text: `Vyhledám informace.
**[2.3] EET:** Sněmovna schválila.
${J([Z("2.3")])}`,
    ceka: ["2.3"] },
  { proc: "próza s odkazy [2.3] před polem, VÍC bodů (padalo na tom)",
    text: `Zde je hodnocení:
**[2.3] EET:** ano.
**[2.5] Daně:** ne.
${J([Z("2.3"), Z("2.5")])}`,
    ceka: ["2.3", "2.5"] },
  { proc: "próza s odkazy i ZA polem",
    text: `Úvod [1.1] a [1.2]:
${J([Z("1.1"), Z("1.2")])}
Doufám, že [1.3] doplním příště.`,
    ceka: ["1.1", "1.2"] },
  { proc: "závorka uvnitř komentáře nerozhodí hloubku",
    text: `Úvod [2.1]:
${J([{ id: "2.1", status: "partial", comment_cs: "Zákon (č. 5] Sb.) plyne." }])}`,
    ceka: ["2.1"] },
  { proc: "prázdná odpověď se hlásí", text: "", chyba: true },
  { proc: "próza bez JSON se hlásí", text: "Nepodařilo se mi nic zjistit.", chyba: true },
  { proc: "pole řetězců není hodnocení", text: J(["https://a", "https://b"]), chyba: true },
];

let spadlo = 0;
for (const p of PRIPADY) {
  let vysledek = null, chyba = null;
  try { vysledek = parsujHodnoceni(p.text); } catch (e) { chyba = e; }

  if (p.chyba) {
    if (!chyba) { spadlo++; console.log(`CHYBA ${p.proc} — čekáno selhání, prošlo`); continue; }
    // Hlášení musí nést ukázku odpovědi, jinak se příště zase nic nedozvíme.
    const maUkazku = p.text.trim() === "" || chyba.message.includes(p.text.trim().slice(0, 20));
    if (!maUkazku) { spadlo++; console.log(`CHYBA ${p.proc} — hlášení neukazuje odpověď: ${chyba.message}`); continue; }
    console.log(`ok   ${p.proc}`);
    continue;
  }

  if (chyba) { spadlo++; console.log(`CHYBA ${p.proc} — ${chyba.message}`); continue; }
  const ids = vysledek.map((r) => r.id);
  if (J(ids) !== J(p.ceka)) {
    spadlo++;
    console.log(`CHYBA ${p.proc} — čekáno [${p.ceka}], vyšlo [${ids}]`);
    continue;
  }
  console.log(`ok   ${p.proc}`);
}

console.log(spadlo ? `\n${spadlo} selhání.` : `\nVšech ${PRIPADY.length} kontrol prošlo.`);
process.exitCode = spadlo ? 1 : 0;
