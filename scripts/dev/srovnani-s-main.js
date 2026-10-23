/* scripts/dev/srovnani-s-main.js — srovnání generálky DEV2 se současným main.
 *
 *     git show origin/main:public/evaluations.json > main.json
 *     node scripts/dev/srovnani-s-main.js --dev2 public/evaluations.json --main main.json [--vystup report/srovnani-s-main.md]
 *
 * Pravidla v lib/srovnani.js. Zdarma, offline. Generálka (mesicni-beh.yml)
 * totéž počítá v scripts/report.js --srovnani-main a posílá v e-mailu.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_ITEMS } from "../../src/data.js";
import { srovnani, nactiSady } from "../lib/srovnani.js";

const arg = (j) => { const i = process.argv.indexOf(`--${j}`); return i >= 0 ? process.argv[i + 1] : null; };
const cist = (p) => JSON.parse(readFileSync(p, "utf8"));
if (!arg("dev2") || !arg("main")) { console.error("použití: srovnani-s-main.js --dev2 <evaluations.json> --main <evaluations.json> [--vystup <md>]"); process.exit(1); }
const { md, souhrn } = srovnani({ dev2: cist(arg("dev2")), main: cist(arg("main")), polozky: ALL_ITEMS, sady: nactiSady() });
if (arg("vystup")) { mkdirSync(dirname(arg("vystup")), { recursive: true }); writeFileSync(arg("vystup"), md); }
console.log(md);
console.log(`SROVNANI ${JSON.stringify(souhrn)}`);
