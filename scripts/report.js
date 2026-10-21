/* scripts/report.js — report běhu pro vlastníka: PDF, pro-AI.md, popis PR, e-mail (spec 005).
 *
 *     node scripts/report.js --pred <evaluations.json před během> [--faktcheck faktcheck-vystup]
 *     node scripts/report.js --fixture              # ze skutečných záznamů ve fixturách, bez sítě, zdarma
 *     node scripts/report.js … --poslat [--zkouska] [--pr <odkaz na PR>] [--vetev beh/RRRR-MM]
 *     node scripts/report.js … --bez-pdf --vystup report
 *
 * Běží po scripts/rozhodni.js. Čte public/evaluations.json (to, co šlo na
 * web), <faktcheck>/rozhodnuti.json, deterministicky.json, modelova.json
 * a public/naklady.json. Zapisuje do <vystup>/ (výchozí report/, gitignored):
 *   vladomer-kontrola-RRRR-MM.pdf  (headless Chrome; bez Chromu jen HTML)
 *   report-RRRR-MM.html, pro-AI.md, pr.md
 * --poslat pošle e-mail přes lib/email.js (RESEND_API_KEY, REPORT_EMAIL_TO
 * z prostředí). Chybějící secret běh nezastaví — report zůstane jako
 * artefakt a log řekne, který secret chybí.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ALL_ITEMS } from "../src/data.js";
import { render, readSettings } from "./lib/nastaveni.js";
import { nactiMetodiku } from "./lib/faktcheck/modelova.js";
import { rozhodniBeh } from "./lib/faktcheck/rozhodnuti.js";
import { podkladyReportu, htmlOddily, proAI, popisPR, esc, odkazyBodu, NAZVY } from "./lib/report.js";
import { odkazRozhodnuti, VETEV_BEHU } from "./lib/navrhy.js";
import { chrome } from "./lib/instagram.js";
import { posliEmail } from "./lib/email.js";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (j, v) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : v; };
const ma = (j) => process.argv.includes(`--${j}`);
const cist = (p) => JSON.parse(readFileSync(p, "utf8"));
const cistPokud = (p) => (existsSync(p) ? cist(p) : null);
const VYSTUP = resolve(KOREN, arg("vystup", "report"));
mkdirSync(VYSTUP, { recursive: true });

/* Připomínka: PR s návrhy čeká na rozhodnutí (pripominka.yml). */
if (ma("pripominka")) {
  const odkazy = String(arg("pripominka", "")).split(/\s+/).filter((u) => /^https:\/\/github\.com\//.test(u));
  const dni = String(arg("dni", "")).split(/\s+/)[0] || "?";
  const predmet = `Vládoměr: návrhy čekají na rozhodnutí ${dni} dní`;
  try {
    const r = await posliEmail({
      predmet,
      html: `<p><b>${esc(predmet)}.</b> Dokud nerozhodneš, zůstávají body na minulém záznamu. Příští měsíční běh je posoudí znovu a tenhle PR zavře.</p><ul>${odkazy.map((u) => `<li><a href="${esc(u)}">${esc(u.replace("https://github.com/", ""))}</a></li>`).join("")}</ul>`,
      text: `${predmet}.\n${odkazy.join("\n")}`,
    });
    console.log(`připomínka odeslána (id ${r.id})`);
  } catch (e) { console.log(`E-MAIL NEODEŠEL: ${e.message}`); }
  process.exit(0);
}

/* Běh selhal: krátký e-mail s odkazem na log. Web zůstal na minulém měsíci. */
if (ma("selhani")) {
  const odkaz = arg("selhani");
  const predmet = `${ma("zkouska") ? "[ZKOUŠKA] " : ""}Vládoměr: měsíční běh selhal`;
  try {
    const r = await posliEmail({
      predmet,
      html: `<p><b>${esc(predmet)}.</b> Na webu zůstávají data z minulého měsíce, nic se nezveřejnilo.</p><p><a href="${esc(odkaz)}">Otevřít log běhu</a> — zaplacené výstupy jsou u běhu jako artefakty.</p>`,
      text: `${predmet}. Na webu zůstávají data z minulého měsíce.\n${odkaz}`,
    });
    console.log(`e-mail o selhání odeslán (id ${r.id})`);
  } catch (e) { console.log(`E-MAIL NEODEŠEL: ${e.message}`); }
  process.exit(0);
}

/* --- vstupy ------------------------------------------------------------------ */
let pred, po, rozhodnuti, D, M, naklady;
if (ma("fixture")) {
  /* Skutečné záznamy (fixtury/rozhodnuti.json: web k 16. 10. 2026 a návrhy
     Sonnetu 5.5 z měření 20. 10.) složené do běhu přes skutečnou vrstvu R.
     Výsledky vrstvy M jsou ve fixtuře; bez sítě a bez placení. */
  const fx = cist(join(KOREN, "scripts", "dev", "fixtury", "rozhodnuti.json"));
  const fxr = cist(join(KOREN, "scripts", "dev", "fixtury", "report.json"));
  pred = cist(join(KOREN, "public", "evaluations.json"));
  pred = { ...pred, evals: { ...pred.evals, ...fx.pred } };
  const poEvals = { ...pred.evals };
  for (const [id, e] of Object.entries(pred.evals)) poEvals[id] = { ...e, overeno: fxr.beh_razitko };
  Object.assign(poEvals, fx.po);
  M = fxr.modelova;
  D = { nalezy: fx.nalezy_d, souhrn: { CHYBA: 1, VAROVANI: 2 }, rejstrik: { predpisu: 412 }, zdroje: { celkem: 231, citelne: 199, mrtve: 4 } };
  // Body mimo fixturu vrstva M „zkontrolovala“ čistě — fixtura ukazuje jen sporné.
  for (const id of Object.keys(poEvals)) if (!M.body[id]) M.body[id] = { shrnuti: { vyvraceno: 0, neovereno: 0, potvrzeno: 1, spor_o_stav: false }, finalni: { tvrzeni: [] } };
  const r = rozhodniBeh({ pred: pred.evals, po: poEvals, nalezy: D.nalezy, modelova: M, neprijate: fx.neprijate, kalibrace: true });
  po = { ...pred, lastUpdated: fxr.beh_razitko, evals: r.evals };
  rozhodnuti = { beh: fxr.beh_razitko.slice(0, 10), kalibrace: true, souhrn: r.souhrn, body: r.body };
  naklady = { behy: [{ datum: fxr.beh_razitko, celkem_usd: fxr.cena_hodnoceni_usd }] };
} else {
  const cestaPred = arg("pred");
  if (!cestaPred || !existsSync(cestaPred)) { console.error("--pred <evaluations.json před během> je povinné (nebo --fixture)"); process.exit(1); }
  const FC = resolve(KOREN, arg("faktcheck", "faktcheck-vystup"));
  pred = cist(cestaPred);
  po = cist(join(KOREN, "public", "evaluations.json"));
  rozhodnuti = cistPokud(join(FC, "rozhodnuti.json"));
  if (!rozhodnuti) { console.error(`${FC}/rozhodnuti.json chybí — report běží po scripts/rozhodni.js`); process.exit(1); }
  D = cistPokud(join(FC, "deterministicky.json"));
  M = cistPokud(join(FC, "modelova.json"));
  naklady = cistPokud(join(KOREN, "public", "naklady.json"));
}
const NAST = readSettings();
const modely = {
  hodnoceni: process.env.EVAL_MODEL || NAST.model,
  overeni: process.env.OVEROVACI_MODEL || NAST.overovaci_model,
  korektura: process.env.KOREKTURA_MODEL || NAST.korektura_model,
  kontrola: (M && M.model) || process.env.FAKTCHECK_MODEL || NAST.faktcheck_model,
};

/* --- report ------------------------------------------------------------------ */
const p = podkladyReportu({ pred, po, rozhodnuti, D, M, naklady, polozky: ALL_ITEMS, modely });
const odkazPR = arg("pr", null);
/* Větev PR s návrhy (beh/RRRR-MM): s ní dostane e-mail i PDF u každého bodu
   odkazy Přijmout / Nechat a na konci Zveřejnit (lib/navrhy.js). */
const vetev = VETEV_BEHU.test(arg("vetev", "")) ? arg("vetev") : null;
const repo = process.env.GITHUB_REPOSITORY || "buuczech/vladomer";
const html = render("report-behu.html", {
  MESIC: esc(p.mesic),
  VERDIKT: esc(`Zveřejněno${p.verdikt.slice("zveřejněno".length)}`),
  ...htmlOddily(p, { odkazPR, repo, vetev }),
  VYTVORENO: esc(new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"),
});
const stem = `${p.beh.slice(0, 7)}`;
const cestaHtml = join(VYSTUP, `report-${stem}.html`);
writeFileSync(cestaHtml, html);
writeFileSync(join(VYSTUP, "pro-AI.md"), proAI(p, { metodika: nactiMetodiku() }));
writeFileSync(join(VYSTUP, "pr.md"), popisPR(p));

let cestaPdf = null;
if (!ma("bez-pdf")) {
  try {
    cestaPdf = join(VYSTUP, `vladomer-kontrola-${stem}.pdf`);
    execFileSync(chrome(), [
      "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", "--print-to-pdf-no-header",
      `--print-to-pdf=${cestaPdf}`, pathToFileURL(cestaHtml).href,
    ], { stdio: "ignore", timeout: 120000 });
    if (!existsSync(cestaPdf) || readFileSync(cestaPdf).subarray(0, 4).toString() !== "%PDF") throw new Error("Chrome PDF nevytvořil");
  } catch (e) {
    console.log(`PDF nevzniklo (${e.message.slice(0, 120)}) — report je jako HTML`);
    cestaPdf = null;
  }
}
console.log(`Report ${p.mesic}: ${p.verdikt}; k rozhodnutí ${p.kRozhodnuti.map((k) => k.bod).join(", ") || "nic"}; změn na webu ${p.zmeny.length}`);
console.log(`  ${cestaPdf || cestaHtml}\n  ${join(VYSTUP, "pro-AI.md")}\n  ${join(VYSTUP, "pr.md")}`);

/* --- e-mail ------------------------------------------------------------------ */
// Text e-mailu se skládá vždy a ukládá do <vystup>/email.html — jde si ho prohlédnout bez odeslání.
{
  const predmet = `${ma("zkouska") ? "[ZKOUŠKA] " : ""}Vládoměr ${p.mesic}: ${p.verdikt}`;
  /* Tlačítka jsou obyčejné odkazy se styly v řádku — e-mailoví klienti CSS
     ve <style> často zahazují. Klepnutí otevře na GitHubu předvyplněný
     soubor s rozhodnutím ve větvi PR; potvrzením (Commit changes) ho provede
     rozhodnuti-vetev.yml. */
  const tlacitko = (href, text, barva) => `<a href="${esc(href)}" style="display:inline-block;padding:8px 14px;margin:4px 6px 4px 0;border-radius:6px;background:${barva};color:#fff;text-decoration:none;font-weight:700">${esc(text)}</a>`;
  const zverejnit = vetev ? odkazRozhodnuti(repo, vetev, "/zverejnit") : null;
  const body = p.kRozhodnuti.map((k) => {
    const o = odkazyBodu(k, { repo, vetev });
    const navrh = k.navrh ? NAZVY[k.navrh.unverifiable ? "unverifiable" : k.navrh.status] : k.kontrola ? NAZVY[k.kontrola.stav] : null;
    const web = k.dosavadni ? NAZVY[k.dosavadni.unverifiable ? "unverifiable" : k.dosavadni.status] : "—";
    return `<div style="border:1px solid #E2E7EF;border-radius:8px;padding:10px;margin:0 0 10px">
<b>${esc(k.bod)}</b> <span style="color:#5B6577">${esc(k.slib.slice(0, 120))}</span><br>
${esc(k.popisTypu)}<br>na webu: <b>${esc(web)}</b>${k.navrh ? ` → hodnotitel navrhuje: <b>${esc(navrh)}</b> (to přijme tlačítko Přijmout)` : ""}${k.kontrola && (!k.navrh || k.kontrola.stav !== (k.navrh.unverifiable ? "unverifiable" : k.navrh.status)) ? `<br>kontrola faktů podle tvých pravidel: <b>${esc(NAZVY[k.kontrola.stav] || k.kontrola.stav)}</b>` : ""}<br>
${o ? `${tlacitko(o.prijmout, o.sDuvodem ? "Přijmout (s důvodem)" : "Přijmout", "#047857")}${tlacitko(o.podrzet, "Nechat", "#64748B")}` : `<span style="color:#5B6577">${k.prikaz ? `v PR: ${esc(k.prikaz)}` : "bez návrhu — zůstává, jak byl"}</span>`}
</div>`;
  }).join("");
  /* Odkaz na GitHub je v e-mailu vždy: PR s návrhy, a když PR není (zkouška,
     nic k rozhodnutí), věta proč — prázdné místo vypadalo jako chyba (vlastník,
     21. 10. 2026). Log běhu je odkaz navíc pro případ, že něco nesedí. */
  const odkazBehu = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  const bezPR = body ? "PR se nepodařilo založit — návrhy jsou jen v PDF; dej vědět, ať se oprava dohledá v logu běhu." : "Nic k rozhodnutí, PR se nezakládá.";
  /* Generálka zakládá PR proti zahazovací větvi zkouska/RRRR-MM: rozhodování
     jde vyzkoušet celé, jen Zveřejnit sloučí PR tam a web s příspěvkem
     sestaví jako artefakt — na vladomer.cz ani na Instagram nejde nic. */
  const zkouska = ma("zkouska")
    ? `<p style="background:#FEF3C7;padding:8px;border-radius:6px"><b>Zkouška.</b> Všechno funguje jako naostro, jen ${vetev ? "PR míří do zahazovací větve a Zveřejnit ji sloučí tam, sestaví web a příspěvek na Instagram jako artefakt běhu" : "se PR nezakládá"} — na vladomer.cz ani na Instagram nejde nic.</p>`
    : "";
  const htmlMail = `<p><b>${esc(predmet)}</b></p>${zkouska}
<p>Splněno ${p.metrikaPred.procent.toFixed(1).replace(".", ",")} % → ${p.metrikaPo.procent.toFixed(1).replace(".", ",")} %. Cena běhu ${p.cena.celkem.toFixed(2).replace(".", ",")} $.</p>
<p>${odkazPR ? tlacitko(odkazPR, "Otevřít PR na GitHubu", "#0F172A") : `<span style="color:#B45309">${esc(bezPR)}</span>`}</p>
${body ? `<p><b>K rozhodnutí</b>${vetev ? " — klepni u každého bodu na Přijmout, nebo Nechat. GitHub otevře předvyplněný soubor s rozhodnutím, stačí ho potvrdit (Commit changes). Do minuty se provede a v PR se objeví odpověď." : ""}</p>${body}` : "<p>Nic k rozhodnutí.</p>"}
${zverejnit ? `<p>Až budeš hotový: ${tlacitko(zverejnit, "Zveřejnit rozhodnutí", "#3B5BDB")}<br><span style="color:#5B6577">${ma("zkouska") ? "Sloučí PR do zahazovací větve a sestaví web jako artefakt — nic se nezveřejní." : "Sloučí PR a nasadí web."} Bod, o kterém nerozhodneš, se zveřejní podle výchozího návrhu; vyvrácené jen s tvým důvodem.</span></p>` : ""}
<p>${odkazPR ? `<a href="${esc(odkazPR)}">PR na GitHubu</a> · ` : ""}${odkazBehu ? `<a href="${esc(odkazBehu)}">Log běhu</a> · ` : ""}<a href="https://vladomer.cz">Web</a></p>
<p style="color:#5B6577">Podrobnosti s citacemi jsou v přiloženém PDF. Soubor pro-AI.md můžeš nahrát do aplikace Claude a nechat si doporučit, co s body udělat.</p>`;
  const text = `${predmet}\n\n${ma("zkouska") ? "ZKOUŠKA — na vladomer.cz ani na Instagram nejde nic.\n\n" : ""}${odkazPR ? `PR na GitHubu: ${odkazPR}` : bezPR}\n\n${p.kRozhodnuti.map((k) => {
    const o = odkazyBodu(k, { repo, vetev });
    return `${k.bod}: ${k.popisTypu}${o ? `\n  Přijmout: ${o.prijmout}\n  Nechat: ${o.podrzet}` : k.prikaz ? ` — ${k.prikaz}` : ""}`;
  }).join("\n") || "Nic k rozhodnutí."}${zverejnit ? `\n\nZveřejnit rozhodnutí: ${zverejnit}` : ""}${odkazBehu ? `\n\nLog běhu: ${odkazBehu}` : ""}`;
  writeFileSync(join(VYSTUP, "email.html"), `<!doctype html><meta charset="utf-8"><title>${esc(predmet)}</title><body style="font-family:sans-serif;max-width:640px;margin:16px">${htmlMail}</body>`);
  if (!ma("poslat")) process.exit(process.exitCode || 0);
  const prilohy = [{ nazev: "pro-AI.md", obsah: readFileSync(join(VYSTUP, "pro-AI.md")) }];
  if (cestaPdf) prilohy.unshift({ nazev: `vladomer-kontrola-${stem}.pdf`, obsah: readFileSync(cestaPdf) });
  else prilohy.unshift({ nazev: `report-${stem}.html`, obsah: readFileSync(cestaHtml) });
  try {
    const r = await posliEmail({ predmet, html: htmlMail, text, prilohy });
    console.log(`e-mail odeslán (id ${r.id})`);
  } catch (e) {
    // Běh kvůli e-mailu nepadá: report je artefakt. Zpráva z lib/email.js adresu nikdy neobsahuje.
    console.log(`E-MAIL NEODEŠEL: ${e.message}`);
    process.exitCode = 4;
  }
}
