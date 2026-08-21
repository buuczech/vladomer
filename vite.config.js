import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { jsonLd } from "./scripts/lib/seo.js";
import { renderPrehled, CESTY } from "./scripts/lib/prehled.js";
import { readSettings, readList } from "./scripts/lib/nastaveni.js";
import { promptHodnoceni, promptZpravy, promptDeltaScan, promptOvereniPrechodu } from "./scripts/lib/prompty.js";
import { promptKorektury } from "./scripts/lib/korektura.js";
import { ALL_ITEMS, TOTAL_ITEMS, DATES, CHAPTERS } from "./src/data.js";

/* Strukturovaná data se vkládají při buildu, protože obsahují čísla z
   posledního hodnocení. Natvrdo v index.html by za týden lhala. */
function strukturovanaData() {
  return {
    name: "vladomer-json-ld",
    transformIndexHtml(html) {
      const ld = jsonLd({
        evaluationsPath: new URL("./public/evaluations.json", import.meta.url),
        items: ALL_ITEMS,
        totalItems: TOTAL_ITEMS,
        tookOffice: DATES.tookOffice,
      });
      return html.replace(
        "</head>",
        `  <script type="application/ld+json">${ld}</script>\n  </head>`,
      );
    },
  };
}

/* Textová podoba hodnocení na /prehled/ a /overview/. Emituje se do buildu,
   ne do public/ — vzniká z dat a nemá smysl ji držet v repozitáři. */
function textovyPrehled() {
  return {
    name: "vladomer-prehled",
    apply: "build",
    generateBundle() {
      let evals = {}, lastUpdated = null;
      try {
        const j = JSON.parse(readFileSync(new URL("./public/evaluations.json", import.meta.url), "utf8"));
        evals = j.evals || {};
        lastUpdated = j.lastUpdated || null;
      } catch { /* před prvním během */ }
      for (const [lang, cesta] of Object.entries(CESTY)) {
        this.emitFile({
          type: "asset",
          fileName: `${cesta}/index.html`,
          source: renderPrehled(lang, { chapters: CHAPTERS, evals, lastUpdated, totalItems: TOTAL_ITEMS }),
        });
      }
    },
  };
}

/* Podklady pro sekci „Použité prompty": doslovné znění šablon, model u každé
   a ukázka, jak prompt vypadá po doplnění dat.
   Ukázky se skládají STEJNÝMI funkcemi jako ostrý běh (scripts/lib/prompty.js,
   scripts/lib/korektura.js) — kdyby si je tenhle plugin skládal po svém, první
   změna formátu jinde by z ukázky udělala tiše lež.
   Modely se čtou z nastaveni.txt, nikdy se nepíšou natvrdo. */
function pouzitePrompty() {
  const SOUBOR = "scripts/nastaveni";
  return {
    name: "vladomer-prompty",
    apply: "build",
    generateBundle() {
      const nast = readSettings();
      const cti = (n) => readFileSync(new URL(`./${SOUBOR}/${n}`, import.meta.url), "utf8");

      let evals = {}, snapshots = [];
      try {
        evals = JSON.parse(readFileSync(new URL("./public/evaluations.json", import.meta.url), "utf8")).evals || {};
        snapshots = JSON.parse(readFileSync(new URL("./public/history.json", import.meta.url), "utf8")).snapshots || [];
      } catch { /* před prvním během */ }

      const kap = CHAPTERS[0];
      // Ukázka korektury nad skutečnými komentáři z první oblasti.
      const davka = kap.groups.flatMap((g) => g.items).slice(0, 3)
        .map((it) => ({ klic: `${it.id}|comment_cs`, id: it.id, pole: "comment_cs",
          text: (evals[it.id] && evals[it.id].comment && evals[it.id].comment.cs) || "" }))
        .filter((z) => z.text);

      const prompty = [
        {
          id: "hodnoceni",
          soubor: `${SOUBOR}/prompt-hodnoceni.md`,
          model: nast.model,
          sablona: cti("prompt-hodnoceni.md"),
          ukazka: promptHodnoceni(kap, evals, snapshots),
          ukazkaPopis: `${kap.id}. ${kap.title.cs}`,
        },
        {
          id: "zpravy",
          soubor: `${SOUBOR}/prompt-zpravy.md`,
          model: nast.model,
          sablona: cti("prompt-zpravy.md"),
          // Pevné datum: ukázka se nesmí měnit s každým buildem.
          ukazka: promptZpravy("2026-08-07"),
          ukazkaPopis: null,
        },
        {
          id: "delta",
          soubor: `${SOUBOR}/prompt-delta.md`,
          model: nast.model,
          sablona: cti("prompt-delta.md"),
          // Pevné datum: ukázka se nesmí měnit s každým buildem.
          ukazka: promptDeltaScan(kap, evals, "2026-08-21"),
          ukazkaPopis: `${kap.id}. ${kap.title.cs}`,
        },
        {
          id: "overeni",
          soubor: `${SOUBOR}/prompt-overeni-prechodu.md`,
          model: nast.overovaci_model,
          sablona: cti("prompt-overeni-prechodu.md"),
          ukazka: promptOvereniPrechodu({
            bod: "Zrušit poplatky za veřejnoprávní média",
            minulyStav: "fulfilled", minulyOd: "2026-08-07", novyStav: "in_progress",
            doklad: "Vláda 15. června 2026 schválila návrh zákona; zákon čeká na projednání Poslanecké sněmovny",
            datumDokladu: "2026-06-15",
            zmena: "Zákon postoupil do Sněmovny",
            komentar: "Návrh prošel vládou, legislativní proces běží.",
          }),
          ukazkaPopis: "skutečný přechod z běhu 21. 8. 2026",
        },
        {
          id: "korektura",
          soubor: `${SOUBOR}/prompt-korektura.md`,
          model: nast.korektura_model,
          sablona: cti("prompt-korektura.md"),
          ukazka: davka.length ? promptKorektury(davka) : null,
          ukazkaPopis: davka.length ? `${davka.length} úryvky z oblasti ${kap.id}` : null,
        },
      ];

      this.emitFile({
        type: "asset",
        fileName: "prompty.json",
        source: JSON.stringify({
          prompty,
          zdroje: {
            hodnoceni: readList("weby-hodnoceni.txt"),
            zpravy: readList("weby-zpravy.txt"),
          },
        }, null, 2),
      });
    },
  };
}

// base: "./" keeps asset paths relative, so the build works under any
// GitHub Pages project path (https://<user>.github.io/<repo>/) without
// hard-coding the repository name.
export default defineConfig({
  base: "./",
  plugins: [react(), strukturovanaData(), textovyPrehled(), pouzitePrompty()],
});
