/* scripts/dev/test-email.js — odesílání reportu (lib/email.js), offline a zdarma.
 *
 *     node scripts/dev/test-email.js
 *
 * Hlavní slib: adresa příjemce se nikdy neobjeví ve výstupu — ani při
 * úspěchu, ani v chybové hlášce, ani když ji API vrátí v těle odpovědi.
 * Adresa v testu je vymyšlená (doména .invalid podle RFC 2606).
 */
import { posliEmail } from "../lib/email.js";

const ADRESA = "prijemce.testu@priklad.invalid";
let chyb = 0;
const over = (ok, popis, detail) => {
  if (ok) console.log(`  ok  ${popis}`);
  else { chyb++; console.log(`  CHYBA ${popis}${detail !== undefined ? ` — ${detail}` : ""}`); }
};

/* Zachytí všechno, co by modul vypsal. */
const vypsano = [];
const puvodniLog = console.log;
const zachyt = async (fn) => {
  console.log = (...a) => vypsano.push(a.join(" "));
  try { return await fn(); } finally { console.log = puvodniLog; }
};

const puvodniFetch = globalThis.fetch;
let posledni = null;
let odpoved = null;
globalThis.fetch = async (url, opt) => { posledni = { url, opt, telo: JSON.parse(opt.body) }; return odpoved(); };

// 1 — úspěch
odpoved = () => ({ ok: true, status: 200, json: async () => ({ id: "a1b2c3d4-0000-4000-8000-000000000000" }) });
const r = await zachyt(() => posliEmail({ predmet: "Vládoměr 11/2026: zveřejněno", html: "<p>ok</p>", text: "ok",
  prilohy: [{ nazev: "report.pdf", obsah: Buffer.from("%PDF-1.4 x") }, { nazev: "pro-AI.md", obsah: "# Kontext\n" }] },
{ klic: "re_test_klic", komu: ADRESA }));
over(r.id.startsWith("a1b2c3d4"), "vrací id odeslaného e-mailu");
over(posledni.url === "https://api.resend.com/emails" && posledni.opt.headers.authorization === "Bearer re_test_klic", "volá Resend s klíčem v hlavičce");
over(posledni.telo.to.length === 1 && posledni.telo.to[0] === ADRESA && posledni.telo.from.includes("onboarding@resend.dev"), "příjemce jen z parametru/secrets, odesílatel onboarding@resend.dev");
over(Buffer.from(posledni.telo.attachments[0].content, "base64").toString() === "%PDF-1.4 x" && posledni.telo.attachments[1].filename === "pro-AI.md", "přílohy v base64 s názvy");
over(!vypsano.join("\n").includes(ADRESA), "log při úspěchu adresu neobsahuje", vypsano.join(" | "));

// 2 — chyba API, která adresu vrací v těle
odpoved = () => ({ ok: false, status: 422, json: async () => ({ name: "validation_error", message: `Invalid \`to\` field: ${ADRESA}` }) });
try {
  await zachyt(() => posliEmail({ predmet: "x", html: "x", text: "x" }, { klic: "re_test_klic", komu: ADRESA }));
  over(false, "chyba API musí vyhodit výjimku");
} catch (e) {
  over(/HTTP 422 \(validation_error\)/.test(e.message), "chyba API: jen kód a název", e.message);
  over(!e.message.includes(ADRESA), "chybová hláška adresu neobsahuje, ač ji API vrátilo");
}

// 3 — síťová chyba
odpoved = () => { const e = new Error(`connect ECONNREFUSED for ${ADRESA}`); e.cause = { code: "ECONNREFUSED" }; throw e; };
try {
  await zachyt(() => posliEmail({ predmet: "x", html: "x", text: "x" }, { klic: "re_test_klic", komu: ADRESA }));
  over(false, "síťová chyba musí vyhodit výjimku");
} catch (e) { over(e.message === "e-mail neodešel: síť (ECONNREFUSED)" && !e.message.includes(ADRESA), "síťová chyba: bez textu původní výjimky", e.message); }

// 4 — chybějící secrets
for (const [popis, nast] of [["klíč", { komu: ADRESA, klic: "" }], ["příjemce", { klic: "re_x", komu: "" }]]) {
  try { await posliEmail({ predmet: "x", html: "x", text: "x" }, nast); over(false, `chybějící ${popis} musí zastavit odeslání`); }
  catch (e) { over(/chybí (RESEND_API_KEY|REPORT_EMAIL_TO)/.test(e.message) && !e.message.includes(ADRESA), `chybějící ${popis} → srozumitelná chyba bez adresy`, e.message); }
}

globalThis.fetch = puvodniFetch;
console.log(chyb ? `\nSELHALO: ${chyb} chyb.` : "\nVše prošlo.");
process.exit(chyb ? 1 : 0);
