/* scripts/dev/test-soukromi.js — žádná e-mailová adresa ani klíč ve veřejných souborech.
 *
 *     node scripts/dev/test-soukromi.js          # sledované soubory + public/
 *     node scripts/dev/test-soukromi.js --dist   # navíc dist/ (po npm run build)
 *
 * Repozitář je veřejný a web taky. Adresa vlastníka, na kterou chodí reporty,
 * patří jen do GitHub secrets (REPORT_EMAIL_TO), klíče taktéž. Pre-commit hook
 * (scripts/dev/hooks/pre-commit) to hlídá při commitu, ale hook se v čerstvém
 * klonu musí zapnout ručně a dist/ se necommituje vůbec — proto ta samá
 * kontrola ještě v CI.
 *
 * Hlásí JEN soubor a číslo řádku, nikdy nalezený text: výstup CI je veřejný
 * a vypsaná adresa by se tím jen přestěhovala jinam.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VZORY = [
  ["e-mailová adresa", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["klíč Anthropic", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["klíč Resend", /re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["klíč v přiřazení", /(IG_ACCESS_TOKEN|ELEVENLABS_API_KEY|ANTHROPIC_API_KEY|RESEND_API_KEY)\s*=\s*[A-Za-z0-9_-]{20,}/],
];
/* Soubory, kde vzor sedí na něco, co adresa ani klíč není. Každá výjimka
   se zdůvodněním — prázdný seznam je cíl. */
const VYJIMKY = new Map([
  ["scripts/dev/hooks/pre-commit", "obsahuje samotné vzory"],
  ["scripts/dev/test-soukromi.js", "obsahuje samotné vzory"],
]);
/* Povolené tvary adres: veřejný odesílatel služby Resend a vymyšlené adresy
   v rezervované doméně .invalid (RFC 2606) v testech. Stejné pravidlo má
   pre-commit hook. Skutečná adresa (třeba @gmail.com) projde všude jen přes
   secrets. */
const POVOLENA_ADRESA = /(@resend\.dev|\.invalid)$/i;
function nalez(co, re, radek) {
  if (co !== "e-mailová adresa") return re.test(radek);
  const g = new RegExp(re.source, "g");
  return [...radek.matchAll(g)].some((m) => !POVOLENA_ADRESA.test(m[0]));
}
const BINARNI = /\.(png|jpe?g|gif|webp|ico|mp3|mp4|wav|pdf|zip|woff2?|ttf)$/i;

function soubory() {
  const sledovane = execFileSync("git", ["ls-files", "-z"], { cwd: KOREN, encoding: "utf8" }).split("\0").filter(Boolean);
  const out = new Set(sledovane);
  const projdi = (adr) => {
    if (!existsSync(join(KOREN, adr))) return;
    for (const j of readdirSync(join(KOREN, adr))) {
      const rel = `${adr}/${j}`;
      if (statSync(join(KOREN, rel)).isDirectory()) projdi(rel); else out.add(rel);
    }
  };
  projdi("public");
  if (process.argv.includes("--dist")) projdi("dist");
  return [...out].sort();
}

let nalezu = 0;
for (const rel of soubory()) {
  if (VYJIMKY.has(rel) || BINARNI.test(rel) || !existsSync(join(KOREN, rel))) continue;
  const radky = readFileSync(join(KOREN, rel), "utf8").split("\n");
  for (const [co, re] of VZORY) {
    const cisla = radky.map((r, i) => (nalez(co, re, r) ? i + 1 : 0)).filter(Boolean);
    if (cisla.length) { nalezu++; console.log(`CHYBA   ${rel}: ${co} na řádku ${cisla.slice(0, 10).join(", ")}${cisla.length > 10 ? " …" : ""}`); }
  }
}
console.log(nalezu ? `\n${nalezu} nálezů — adresy a klíče patří jen do GitHub secrets.` : "ok      žádná e-mailová adresa ani klíč ve veřejných souborech");
process.exit(nalezu ? 1 : 0);
