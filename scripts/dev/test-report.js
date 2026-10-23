/* scripts/dev/test-report.js — report běhu pro vlastníka (spec 005), offline a zdarma.
 *
 *     node scripts/dev/test-report.js
 *
 * Spustí scripts/report.js --fixture (skutečné záznamy: web k 16. 10. 2026,
 * návrhy Sonnetu 5.5 z 20. 10. a odpovědi kontroly faktů z prvního placeného
 * běhu) a ověří, že:
 *   - šablona report-behu.html se vyplnila celá (render je přísný),
 *   - každý bod k rozhodnutí je v PDF/HTML i v popisu PR, s příkazem, kde jde přijmout,
 *   - pro-AI.md nese pravidla vlastníka a závěrečný dotaz,
 *   - ve výstupech není žádná e-mailová adresa (adresa vlastníka patří jen
 *     do GitHub secrets; report ji nikdy nečte),
 *   - příkazy z komentářů PR se čtou přísně (test-rozhodnuti.js to zkouší zvlášť),
 *   - srovnání generálky s main (lib/srovnani.js) počítá metriku, shodu se sadami
 *     a „kdo má pravdu“ správně a dostane se do e-mailu i do přílohy.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { rozdilSlov, metrika, esc } from "../lib/report.js";
import { srovnani } from "../lib/srovnani.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};

console.log("Pomocné funkce");
const r = rozdilSlov("zákon č. 91/2026 Sb. vyhlášen", "zákon č. 90/2026 Sb. vyhlášen");
over(r.a.includes("<del>91/2026</del>") && r.b.includes("<ins>90/2026</ins>") && !r.a.includes("<del>zákon"), "rozdíl po slovech označí jen změněné slovo", r);
over(esc("<b>„x“ & y</b>") === "&lt;b&gt;„x“ &amp; y&lt;/b&gt;", "escapování HTML");
const m = metrika({ a: { status: "fulfilled" }, b: { status: "partial" }, c: { status: "fulfilled", unverifiable: true } }, [{ id: "a" }, { id: "b" }, { id: "c" }]);
over(m.splneno === 1 && m.hodnoceno === 2 && m.stavy.unverifiable === 1, "metrika: neměřitelné mimo jmenovatel (pravidlo pěti míst)", m);

console.log("\nSrovnání generálky s main (lib/srovnani.js)");
{
  const polozky = [{ id: "1.1", cs: "a" }, { id: "1.2", cs: "b" }, { id: "1.3", cs: "c" }, { id: "1.4", cs: "d" }];
  const main = { lastUpdated: "2026-10-30T09:00:00Z", evals: { "1.1": { status: "fulfilled" }, "1.2": { status: "broken" }, "1.3": { status: "partial" }, "1.4": { status: "in_progress" } } };
  const dev2 = { lastUpdated: "2026-11-01T06:00:00Z", evals: { "1.1": { status: "fulfilled" }, "1.2": { status: "declared" }, "1.3": { status: "in_progress" }, "1.4": { status: "in_progress", unverifiable: true } } };
  const sady = [{ nazev: "zlatá sada", body: [{ id: "1.1", stav: "fulfilled" }, { id: "1.2", stav: "declared" }, { id: "1.3", stav: "fulfilled" }] }];
  const s = srovnani({ dev2, main, polozky, sady });
  over(s.souhrn.main.procent === 25 && Math.abs(s.souhrn.dev2.procent - 100 / 3) < 1e-9, "metrika obou stran podle pravidla pěti míst (neměřitelné mimo jmenovatel)", s.souhrn);
  over(s.souhrn.sady["zlatá sada"].main === 1 && s.souhrn.sady["zlatá sada"].dev2 === 2, "shoda se sadou: main 1/3, DEV2 2/3", s.souhrn.sady);
  over(s.souhrn.lisi === 3 && s.souhrn.pravdu.dev2 === 1 && s.souhrn.pravdu.nikdo === 1 && s.souhrn.pravdu.main === 0, "jiný stav u 3 bodů; 1.2 pravdu má DEV2, 1.3 ani jeden, 1.4 mimo sady", s.souhrn.pravdu);
  over(/\*\*1\.2\*\* b: main porušeno → DEV2 jen deklarováno — pravdu má DEV2/.test(s.md) && /\*\*1\.4\*\* d: main probíhá → DEV2 neměřitelné\n/.test(s.md), "seznam bodů s jiným stavem", s.md);
  over(s.html.includes("data k 2026-10-30") && s.text.includes("Jiný stav u 3 bodů"), "krátké shrnutí do e-mailu");
}

console.log("\nReport z fixtury (scripts/report.js --fixture)");
const dir = mkdtempSync(join(tmpdir(), "vm-report-"));
try {
  const log = execFileSync(process.execPath, [join("scripts", "report.js"), "--fixture", "--bez-pdf", "--vystup", dir], { cwd: KOREN, encoding: "utf8", env: { ...process.env, RESEND_API_KEY: "", REPORT_EMAIL_TO: "" } });
  const soubor = (n) => readFileSync(join(dir, n), "utf8");
  const html = soubor("report-2026-11.html"), ai = soubor("pro-AI.md"), pr = soubor("pr.md");
  const adresa = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  over(/Report 11\/2026/.test(log), "report vznikl", log.slice(0, 200));
  over(!html.includes("{{") && html.includes("Vládoměr — kontrola běhu 11/2026"), "šablona vyplněná celá");
  const kRozhodnuti = (log.match(/k rozhodnutí ([^;]+);/) || [])[1].split(", ");
  over(kRozhodnuti.includes("10.2") && kRozhodnuti.includes("7.2") && kRozhodnuti.includes("12.2"), "k rozhodnutí: oprava bez události (10.2), FR-009 (7.2), spor (12.2)", kRozhodnuti);
  for (const b of ["10.2", "7.2", "12.2"]) {
    over(html.includes(`id="bod-${b}"`) && html.includes(`/prijmout ${b}`) && pr.includes(`\`/prijmout ${b}`), `${b}: v reportu i v popisu PR s příkazem`);
  }
  over(html.includes("<del>") && html.includes("<ins>"), "dosavadní a navržený text vedle sebe se zvýrazněným rozdílem");
  over(ai.includes("## Pravidla vlastníka") && ai.includes("M1") && ai.includes("## Dotaz") && ai.includes("přijmout"), "pro-AI.md: pravidla vlastníka a závěrečný dotaz");
  over(pr.includes("Vyjde jen to, co přijmeš") && pr.includes("Merge = zveřejnit přijaté"), "popis PR říká, že vyjde jen přijaté, a co dělá Merge a Close");
  over(!html.includes("/new/beh/"), "bez větve PR žádné odkazy na rozhodnutí");
  execFileSync(process.execPath, [join("scripts", "report.js"), "--fixture", "--bez-pdf", "--vetev", "beh/2026-11", "--vystup", dir], { cwd: KOREN, encoding: "utf8", env: { ...process.env, RESEND_API_KEY: "", REPORT_EMAIL_TO: "", GITHUB_REPOSITORY: "buuczech/vladomer" } });
  const html2 = soubor("report-2026-11.html");
  over(html2.includes(encodeURIComponent("/prijmout 10.2")) && html2.includes(encodeURIComponent("/podrzet 10.2")) && html2.includes(encodeURIComponent("/zverejnit")),
    "s větví PR má PDF u bodu odkazy Přijmout / Nechat a na konci Zveřejnit");
  over(!adresa.test(html2), "ani odkazy nenesou e-mailovou adresu");
  // E-mail má vždy odkaz na GitHub, nebo větu, proč PR není (vlastník 21. 10. 2026).
  const posledniEmail = (args) => {
    execFileSync(process.execPath, [join("scripts", "report.js"), "--fixture", "--bez-pdf", ...args, "--vystup", dir], { cwd: KOREN, encoding: "utf8", env: { ...process.env, RESEND_API_KEY: "", REPORT_EMAIL_TO: "", GITHUB_REPOSITORY: "buuczech/vladomer" } });
    return soubor("email.html");
  };
  const ostry = posledniEmail(["--pr", "https://github.com/buuczech/vladomer/pull/123", "--vetev", "beh/2026-11"]);
  over(ostry.includes("Otevřít PR na GitHubu") && ostry.includes("https://github.com/buuczech/vladomer/pull/123") && ostry.includes("Zveřejnit rozhodnutí"), "ostrý e-mail: tlačítko na PR, rozhodnutí u bodů a Zveřejnit");
  over(ostry.includes("/new/beh/2026-11?filename=rozhodnuti/") && !ostry.includes("Zkouška."), "ostrý e-mail: odkazy zakládají soubor s rozhodnutím ve větvi PR");
  const zkouska = posledniEmail(["--zkouska", "--pr", "https://github.com/buuczech/vladomer/pull/124", "--vetev", "beh/2026-11-zkouska"]);
  over(zkouska.includes("Zkouška.") && zkouska.includes("zahazovací větve") && zkouska.includes("/new/beh/2026-11-zkouska?filename=rozhodnuti/10.2-prijmout.txt"),
    "zkušební e-mail: rozhodování jde vyzkoušet celé, s upozorněním, že nic nejde na web ani na Instagram");
  const bezVetve = posledniEmail(["--zkouska"]);
  over(bezVetve.includes("Nic k rozhodnutí") || bezVetve.includes("PR se nepodařilo založit"), "bez PR e-mail řekne proč");
  // Generálka: srovnání s main v e-mailu a jako soubor (příloha a artefakt).
  const cestaMain = join(dir, "main-evaluations.json");
  writeFileSync(cestaMain, readFileSync(join(KOREN, "public", "evaluations.json")));
  const sSrovnanim = posledniEmail(["--zkouska", "--srovnani-main", cestaMain]);
  over(sSrovnanim.includes("Srovnání s main") && sSrovnanim.includes("srovnani-s-main.md") && soubor("srovnani-s-main.md").includes("## Shoda s pravdou"),
    "zkušební e-mail se srovnáním s main a srovnani-s-main.md vedle reportu");
  over(![ostry, zkouska, bezVetve, sSrovnanim].some((t) => adresa.test(t)), "e-maily nenesou žádnou e-mailovou adresu");
  over(![html, ai, pr, log].some((t) => adresa.test(t)), "žádná e-mailová adresa ve výstupech");
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
