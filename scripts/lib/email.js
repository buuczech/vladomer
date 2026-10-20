/* scripts/lib/email.js — jediné místo, které posílá e-mail (spec 005).
 *
 * Report každého měsíčního běhu jde e-mailem vlastníkovi. Posílá se přes HTTP
 * API služby Resend (fetch, žádná npm závislost), z odesílatele
 * onboarding@resend.dev. Ten smí psát jen na adresu, se kterou je účet
 * Resend založený — účet je založený s adresou vlastníka, takže report ani
 * nemůže odejít nikomu jinému.
 *
 * SOUKROMÍ ADRESY (repozitář i web jsou veřejné):
 *   - adresa příjemce je jen v GitHub secrets (REPORT_EMAIL_TO), stejně jako
 *     klíč (RESEND_API_KEY); GitHub je v logu sám maskuje,
 *   - tenhle modul adresu NIKDY nevypisuje: log říká jen „odesláno (id …)“,
 *   - při chybě se vypíše jen HTTP kód a název chyby, NIKDY tělo odpovědi —
 *     Resend v něm adresu vrací,
 *   - adresa se nedostane do PDF, popisu PR, faktcheck.json ani na web.
 * Hlídá to scripts/dev/test-email.js; pre-commit hook a test-soukromi.js
 * hlídají, že adresa nebude v žádném veřejném souboru.
 */

const API = "https://api.resend.com/emails";
const ODESILATEL = "Vládoměr <onboarding@resend.dev>";

/**
 * @param predmet  předmět
 * @param html     HTML tělo
 * @param text     textové tělo (pro klienty bez HTML)
 * @param prilohy  [{ nazev, obsah: Buffer|string }]
 * @param klic, komu  výchozí z prostředí (RESEND_API_KEY, REPORT_EMAIL_TO)
 * @returns { id }
 */
export async function posliEmail({ predmet, html, text, prilohy = [] }, { klic = process.env.RESEND_API_KEY, komu = process.env.REPORT_EMAIL_TO } = {}) {
  if (!klic) throw new Error("e-mail neodešel: chybí RESEND_API_KEY (GitHub → Settings → Secrets → Actions)");
  if (!komu) throw new Error("e-mail neodešel: chybí REPORT_EMAIL_TO (GitHub → Settings → Secrets → Actions)");
  const telo = {
    from: ODESILATEL,
    to: [komu],
    subject: predmet,
    html,
    text,
    attachments: prilohy.map((p) => ({
      filename: p.nazev,
      content: Buffer.isBuffer(p.obsah) ? p.obsah.toString("base64") : Buffer.from(String(p.obsah), "utf8").toString("base64"),
    })),
  };
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${klic}` },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new Error(`e-mail neodešel: síť (${e && (e.cause?.code || e.name) || "chyba"})`);
  }
  if (!res.ok) {
    // Jen kód a název chyby — tělo odpovědi může obsahovat adresu příjemce.
    let nazev = "";
    try { const j = await res.json(); nazev = typeof j.name === "string" ? j.name.replace(/[^a-z_]/gi, "").slice(0, 40) : ""; } catch { /* nic */ }
    throw new Error(`e-mail neodešel: HTTP ${res.status}${nazev ? ` (${nazev})` : ""}`);
  }
  const j = await res.json().catch(() => ({}));
  const id = typeof j.id === "string" ? j.id.replace(/[^a-z0-9-]/gi, "").slice(0, 64) : "?";
  console.log(`e-mail odeslán (id ${id})`);
  return { id };
}
