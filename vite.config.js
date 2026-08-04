import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { jsonLd } from "./scripts/lib/seo.js";
import { ALL_ITEMS, TOTAL_ITEMS, DATES } from "./src/data.js";

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

// base: "./" keeps asset paths relative, so the build works under any
// GitHub Pages project path (https://<user>.github.io/<repo>/) without
// hard-coding the repository name.
export default defineConfig({
  base: "./",
  plugins: [react(), strukturovanaData()],
});
