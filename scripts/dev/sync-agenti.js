/* scripts/dev/sync-agenti.js — AGENTS.md a .agents/skills/ se generují, needitují.
 *
 *     node scripts/dev/sync-agenti.js             # přegeneruje
 *     node scripts/dev/sync-agenti.js --kontrola  # jen ověří; nesoulad = exit 1 (CI)
 *
 * Codex čte AGENTS.md a skills z .agents/skills/, Claude Code CLAUDE.md
 * a .claude/skills/. Dřív to byly ručně udržované kopie a rozjely se: AGENTS.md
 * mluvil o „šesti kontrolách“, chyběly mu odstavce a cesta ke skillu zněla
 * „.Codex/skills/“ (slepé nahrazení slova Claude). Zdrojem pravdy je proto
 * jen CLAUDE.md a .claude/skills/; tenhle skript z nich kopie vyrobí.
 *
 * Skills speckit-* sem nepatří — ty pro obě integrace generuje Spec Kit sám
 * (každé s jinou hlavičkou) a hlídá si je vlastním manifestem v .specify/.
 *
 * Nahrazuje se jen „.claude/skills/“ → „.agents/skills/“, nic obecnějšího:
 * „.claude/launch.json“ v kontrole UI je konfigurace náhledu Claude Desktopu
 * a v kopii pro Codex má zůstat, jak je.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KONTROLA = process.argv.includes("--kontrola");

const HLAVICKA = `# AGENTS.md

<!-- GENEROVÁNO z CLAUDE.md skriptem \`node scripts/dev/sync-agenti.js\`.
     Needituj ručně — změna se při příštím generování ztratí. Uprav CLAUDE.md
     a skript spusť znovu; CI kontroluje, že kopie sedí. -->

This file provides guidance to Codex and other agents that read AGENTS.md when working with code in this repository. It is generated from CLAUDE.md; skills live in \`.agents/skills/\`.
`;

const PUVODNI_UVOD = "This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.";

/* Konce řádků se porovnávají normalizované: na Windows je pracovní kopie
   s core.autocrlf v CRLF, v repozitáři (text=auto) v LF. */
const lf = (s) => s.replace(/\r\n/g, "\n");
const prepisCesty = (s) => s.split(".claude/skills/").join(".agents/skills/");

function agentsMd() {
  const claude = lf(readFileSync(join(KOREN, "CLAUDE.md"), "utf8"));
  if (!claude.includes(PUVODNI_UVOD)) {
    throw new Error("CLAUDE.md nemá očekávanou úvodní větu — uprav PUVODNI_UVOD v sync-agenti.js.");
  }
  const telo = claude
    .replace(/^# CLAUDE\.md\n+/, "")
    .replace(PUVODNI_UVOD + "\n", "");
  return HLAVICKA + prepisCesty(telo);
}

function souboryVe(adresar) {
  const out = [];
  for (const jmeno of readdirSync(adresar)) {
    const cesta = join(adresar, jmeno);
    if (statSync(cesta).isDirectory()) out.push(...souboryVe(cesta));
    else out.push(cesta);
  }
  return out;
}

/* Očekávaný obsah: mapa relativní cesta → text. */
function ocekavane() {
  const mapa = new Map([["AGENTS.md", agentsMd()]]);
  const zdroj = join(KOREN, ".claude", "skills");
  for (const skill of readdirSync(zdroj)) {
    if (skill.startsWith("speckit-")) continue;
    for (const soubor of souboryVe(join(zdroj, skill))) {
      const rel = relative(zdroj, soubor).split("\\").join("/");
      mapa.set(`.agents/skills/${rel}`, prepisCesty(lf(readFileSync(soubor, "utf8"))));
    }
  }
  return mapa;
}

/* Soubory v .agents/skills/<skill>/, které ve zdroji nejsou — pozůstatky. */
function pozustatky(mapa) {
  const cil = join(KOREN, ".agents", "skills");
  if (!existsSync(cil)) return [];
  const out = [];
  for (const skill of readdirSync(cil)) {
    if (skill.startsWith("speckit-")) continue;
    for (const soubor of souboryVe(join(cil, skill))) {
      const rel = ".agents/skills/" + relative(cil, soubor).split("\\").join("/");
      if (!mapa.has(rel)) out.push(rel);
    }
  }
  return out;
}

const mapa = ocekavane();
const rozdily = [];
for (const [rel, text] of mapa) {
  const cesta = join(KOREN, rel);
  const ted = existsSync(cesta) ? lf(readFileSync(cesta, "utf8")) : null;
  if (ted !== text) rozdily.push(rel);
}
const navic = pozustatky(mapa);

if (KONTROLA) {
  if (!rozdily.length && !navic.length) {
    console.log(`ok   AGENTS.md a .agents/skills/ odpovídají CLAUDE.md a .claude/skills/ (${mapa.size} souborů)`);
    process.exit(0);
  }
  for (const r of rozdily) console.log(`CHYBA nesedí s předlohou: ${r}`);
  for (const r of navic) console.log(`CHYBA navíc (ve zdroji není): ${r}`);
  console.log("Oprava: node scripts/dev/sync-agenti.js");
  process.exit(1);
}

for (const rel of rozdily) {
  const cesta = join(KOREN, rel);
  mkdirSync(dirname(cesta), { recursive: true });
  writeFileSync(cesta, mapa.get(rel), "utf8");
  console.log(`zapsáno  ${rel}`);
}
for (const rel of navic) {
  rmSync(join(KOREN, rel));
  console.log(`smazáno  ${rel}`);
}
console.log(rozdily.length || navic.length ? "Hotovo." : "Vše už sedí, nic se nezměnilo.");
