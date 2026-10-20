/* scripts/lib/faktcheck/zdroje.js — stahování zdrojů pro kontrolu faktů.
 *
 * Vrstva D (živost odkazů) i vrstva M (citace se hledá v textu, který stáhl
 * program, ne model) potřebují totéž: stáhnout stránku, poznat přesměrování
 * na titulku a dostat z HTML čitelný text.
 */
const UA = "Mozilla/5.0 (compatible; VladomerFaktcheck/1.0; +https://vladomer.cz)";
const ENTITY = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

export function textZHtml(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, x) => (x[0] === "#" ? String.fromCodePoint(x[1] === "x" ? parseInt(x.slice(2), 16) : Number(x.slice(1))) : ENTITY[x.toLowerCase()] ?? m))
    .replace(/\s+/g, " ")
    .trim();
}

/** Stáhne zdroj. Nikdy nevyhazuje výjimku. @returns { url, status, cil, titulka, text, typ, chyba } */
export async function stahniZdroj(url, { maxZnaku = 60000, timeoutMs = 20000 } = {}) {
  const z = { url };
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs) });
    z.status = res.status;
    z.cil = res.url;
    z.titulka = new URL(url).pathname.length > 1 && new URL(res.url).pathname.length <= 1;
    const typ = res.headers.get("content-type") || "";
    if (res.ok && /html|text/.test(typ)) z.text = textZHtml(await res.text()).slice(0, maxZnaku);
    else if (res.ok) z.typ = typ; // PDF a jiné — text se zatím neextrahuje
  } catch (e) {
    z.chyba = String(e && (e.cause?.code || e.name || e.message) || e).slice(0, 80);
  }
  return z;
}

/** Stáhne seznam URL souběžně (výchozí 6 najednou). @returns Map(url → záznam) */
export async function stahniVse(urls, { soubezne = 6 } = {}) {
  const out = new Map();
  let i = 0;
  await Promise.all(Array.from({ length: soubezne }, async () => {
    while (i < urls.length) { const u = urls[i++]; out.set(u, await stahniZdroj(u)); }
  }));
  return out;
}
