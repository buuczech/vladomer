import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { jsonLd } from "./scripts/lib/seo.js";
import { renderPrehled, CESTY } from "./scripts/lib/prehled.js";
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

// base: "./" keeps asset paths relative, so the build works under any
// GitHub Pages project path (https://<user>.github.io/<repo>/) without
// hard-coding the repository name.
export default defineConfig({
  base: "./",
  plugins: [react(), strukturovanaData(), textovyPrehled()],
});
