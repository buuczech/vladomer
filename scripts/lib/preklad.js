/* scripts/lib/preklad.js — anglická verze komentáře, který napsal vlastník (/opravit, spec 005).
 *
 * Web je dvojjazyčný a každý komentář potřebuje anglickou verzi. Obsah je
 * vlastníkův, model jen překládá (prompt-preklad.md). Překlad projde týmž
 * pravidlem, jakým kontrola faktů porovnává českou a anglickou verzi — data,
 * čísla předpisů a procenta (rozdilyCsEn, vrstva D3). Když nesedí, zkusí se
 * jednou znovu (modely 5.x nemají temperature 0, druhá odpověď bývá jiná);
 * pak volající příkaz neprovede a vlastníkovi to řekne.
 */
import { render } from "./nastaveni.js";
import { STAV_POPIS } from "./korektura.js";
import { vyrezy } from "./odpoved.js";
import { rozdilyCsEn } from "./faktcheck/deterministicky.js";
import { teloPozadavku, zavolejApi } from "./modely.js";

export function promptPrekladu(text) {
  return render("prompt-preklad.md", {
    STAVY: Object.entries(STAV_POPIS).filter(([k]) => k !== "stalled").map(([, s]) => `„${s.cs}“ → "${s.en}"`).join(", "),
    TEXT: text,
  });
}

/** Překlad z odpovědi modelu: první {"en": "…"}, které se dá přečíst. */
export function ctiPreklad(text) {
  for (const kus of vyrezy(String(text || ""), "{", "}")) {
    try {
      const j = JSON.parse(kus);
      if (j && typeof j.en === "string" && j.en.trim()) return j.en.replace(/\s+/g, " ").trim();
    } catch { /* další kandidát */ }
  }
  return null;
}

/**
 * @param cs     komentář vlastníka
 * @param volej  zavolejApi (testy dosadí zástupce)
 * @returns anglický text; vyhodí Error s důvodem, když se překlad nepovede
 */
export async function prelozKomentar(cs, { model, klic, effort = "medium", volej = zavolejApi }) {
  let duvod = "";
  for (let pokus = 1; pokus <= 2; pokus++) {
    const telo = teloPozadavku({ model, maxTokens: 2000, effort, messages: [{ role: "user", content: promptPrekladu(cs) }] });
    const data = await volej(telo, { klic, role: "preklad" });
    const en = ctiPreklad((data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""));
    if (!en) { duvod = "odpověď bez překladu"; continue; }
    const rozdily = rozdilyCsEn(cs, en);
    if (!rozdily.length) return en;
    duvod = `v překladu se liší ${rozdily.join("; ")}`;
  }
  throw new Error(`překlad se nepodařil (${duvod})`);
}
