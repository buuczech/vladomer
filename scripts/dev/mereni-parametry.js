/* scripts/dev/mereni-parametry.js — parametry a souhlas placeného měření.
 *
 * Volá ho .github/workflows/dev2-eval.yml. Čte scripts/dev/mereni.json a:
 *   - bez vyplněného „schvaleno“ zapíše spustit=false (měření se neprovede,
 *     nic se nezaplatí) a skončí s kódem 0,
 *   - jinak zapíše parametry do GITHUB_OUTPUT a modely/effort do GITHUB_ENV.
 * Mimo GitHub Actions jen vypíše, co by se spustilo (suchá zkouška).
 */
import { readFileSync, appendFileSync } from "node:fs";

const m = JSON.parse(readFileSync(new URL("./mereni.json", import.meta.url), "utf8"));
const out = (k, v) => (process.env.GITHUB_OUTPUT ? appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v ?? ""}\n`) : console.log(`  výstup ${k}=${v ?? ""}`));
const env = (k, v) => v && (process.env.GITHUB_ENV ? appendFileSync(process.env.GITHUB_ENV, `${k}=${v}\n`) : console.log(`  env ${k}=${v}`));

if (!m.schvaleno || !String(m.schvaleno).trim()) {
  console.log("mereni.json nemá vyplněné „schvaleno“ — placené měření se nespustí.");
  out("spustit", "false");
  process.exit(0);
}
const REZIMY = ["zlata-sada", "stabilita", "beh"];
if (!REZIMY.includes(m.rezim)) {
  console.error(`mereni.json: neznámý rezim „${m.rezim}“ — povoleno ${REZIMY.join(", ")}`);
  process.exit(1);
}
console.log(`Schváleno: ${m.schvaleno}`);
console.log(`Režim: ${m.rezim}; modely: hodnocení=${m.model || "nastavení"}, ověření=${m.overovaci_model || "nastavení"}, `
  + `korektura=${m.korektura_model || "nastavení"}; odhad ${m.odhad_usd ?? "?"} $`);
out("spustit", "true");
out("rezim", m.rezim);
out("kazeta", m.nahrat_kazetu ? "true" : "false");
env("EVAL_MODEL", m.model);
env("OVEROVACI_MODEL", m.overovaci_model);
env("KOREKTURA_MODEL", m.korektura_model);
env("EFFORT_HODNOCENI", m.effort_hodnoceni);
env("EFFORT_KONTROLY", m.effort_kontroly);
env("POJISTKA_CENY_USD", m.pojistka_usd);
