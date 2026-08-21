/* scripts/lib/seo.js — strukturovaná data (JSON-LD) vkládaná do index.html
   při buildu.
 *
 * Proč při buildu a ne natvrdo do index.html: čísla i datum se mění každý
 * pátek. Zapsané ručně by byla druhý den nepravdivá — stejný důvod, proč se
 * překresluje og.png a proč v sitemap.xml není <lastmod>.
 *
 * Co to řeší: web je jednostránková aplikace, obsah dotahuje JavaScript.
 * V surovém HTML není ani slovo o tom, co se hodnotí. Schema.org je jediné,
 * co stroj bez spuštění JavaScriptu z téhle stránky přečte — a proto tu je
 * i odkaz na syrová data, aby si je mohl stáhnout přímo.
 */
import { readFileSync } from "node:fs";

const ORIGIN = "https://vladomer.cz";
/* Táž množina jako v App.jsx (score: 1), og-image.js, prehled.js a
   instagram/post.js. "stalled" je stará hodnota škály z doby před 7/2026 —
   drží se tu, aby všech pět míst počítalo jmenovatel ze stejných stavů. */
const SCORED = new Set(["fulfilled", "partial", "in_progress", "declared", "not_started", "broken", "stalled"]);

export function jsonLd({ evaluationsPath, items, totalItems, tookOffice }) {
  let evals = {}, lastUpdated = null;
  try {
    const j = JSON.parse(readFileSync(evaluationsPath, "utf8"));
    evals = j.evals || {};
    lastUpdated = j.lastUpdated || null;
  } catch { /* před prvním během ještě data nejsou */ }

  let done = 0, n = 0;
  for (const it of items) {
    const v = evals[it.id];
    if (!v || !SCORED.has(v.status) || v.unverifiable) continue;
    n++;
    if (v.status === "fulfilled") done++;
  }

  const popis = n
    ? `Nezávislé sledování plnění programového prohlášení vlády Andreje Babiše. `
      + `Z ${totalItems} závazků je ${n} hodnoceno, splněno ${done}. `
      + `Hodnocení se obnovuje každý pátek.`
    : `Nezávislé sledování plnění programového prohlášení vlády Andreje Babiše `
      + `(${totalItems} závazků). Hodnocení se obnovuje každý pátek.`;

  const soubor = (jmeno, popisSouboru) => ({
    "@type": "DataDownload",
    name: popisSouboru,
    encodingFormat: "application/json",
    contentUrl: `${ORIGIN}/${jmeno}`,
  });

  const graf = [
    {
      "@type": "WebSite",
      "@id": `${ORIGIN}/#web`,
      url: `${ORIGIN}/`,
      name: "Vládoměr",
      alternateName: "Vladomer",
      description: popis,
      inLanguage: ["cs", "en"],
    },
    {
      "@type": "Dataset",
      "@id": `${ORIGIN}/#dataset`,
      name: "Plnění programového prohlášení vlády Andreje Babiše",
      description: popis,
      url: `${ORIGIN}/`,
      isAccessibleForFree: true,
      /* CC BY 4.0 — volné použití včetně komerčního, ale s uvedením zdroje.
         Atribuce je tu ta podstatná část: je to jediný nástroj, kterým se dá
         chtít, aby převzatá čísla nesla, odkud jsou. Kryje výběr závazků a
         texty hodnocení, ne samotná fakta a ne odkazované články. */
      license: "https://creativecommons.org/licenses/by/4.0/",
      inLanguage: ["cs", "en"],
      /* Hodnotí jazykový model podle veřejné metodiky, ne redakce. Uvádět to
         ve strukturovaných datech je poctivé — kdo data přebírá, má vědět,
         jak vznikla. */
      creator: { "@type": "Organization", "@id": `${ORIGIN}/#org`, name: "Vládoměr", url: `${ORIGIN}/` },
      // Jen datum, ne ISO s časem — schema.org tu čeká interval kalendářních dat.
      temporalCoverage: `${String(tookOffice).slice(0, 10)}/..`,
      measurementTechnique: "Automatické hodnocení jazykovým modelem podle zveřejněné metodiky, s doložením zdrojů",
      variableMeasured: [
        { "@type": "PropertyValue", name: "Stav plnění závazku",
          description: "splněno / částečně splněno / probíhá / jen deklarováno / nezahájeno / porušeno" },
        { "@type": "PropertyValue", name: "Podíl splněných závazků", unitText: "%",
          ...(n ? { value: Math.round((done / n) * 1000) / 10 } : {}) },
      ],
      keywords: [
        "programové prohlášení vlády", "vláda Andreje Babiše", "plnění slibů",
        "politické závazky", "Česká republika", "transparentnost", "sledování vlády",
      ],
      distribution: [
        soubor("evaluations.json", "Aktuální hodnocení všech závazků"),
        soubor("history.json", "Týdenní snímky stavů pro graf vývoje"),
        soubor("audit.json", "Auditní stopa — každé hodnocení s datem a odůvodněním"),
      ],
      ...(lastUpdated ? { dateModified: lastUpdated.slice(0, 10) } : {}),
      ...(n ? { size: `${n} hodnocených závazků z ${totalItems}` } : {}),
    },
  ];

  /* Výstup se vkládá do <script> v index.html nahrazením řetězce, takže
     sekvence "</script>" uvnitř dat by z bloku vystoupila. Dnes sem jdou jen
     číselné souhrny a pevné texty, ale escapovat "<" je jednořádková pojistka
     a JSON s < je pořád platný JSON. */
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graf })
    .replace(/</g, "\u003c");
}
