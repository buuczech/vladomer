/* scripts/lib/nastaveni.js
 * Načítá prompty a nastavení ze scripts/nastaveni/.
 *
 * Všechno tady selhává tvrdě a hned: tiše špatně vyrenderovaný prompt by
 * pokazil celý týden hodnocení na veřejném webu, což je mnohem horší než běh,
 * který se zastaví chybou a nechá na webu data z minulého týdne.
 */
import { readFileSync } from "node:fs";

const DIR = new URL("../nastaveni/", import.meta.url);

/* Jediná úprava, která se na soubor aplikuje: odstranění UTF-8 BOM (píše ho
   Poznámkový blok), převod CRLF na LF (Git na Windows checkoutuje CRLF, v CI
   LF — text promptu nesmí záviset na tom, kde běžel; šablonové řetězce v JS
   se chovaly stejně) a useknutí koncových prázdných znaků. */
function readText(name) {
  const raw = readFileSync(new URL(name, DIR), "utf8");
  // Soubor uložený jako ANSI/CP1250 se dekóduje s U+FFFD místo diakritiky.
  if (raw.includes("�")) {
    throw new Error(`${name}: soubor není uložen v kódování UTF-8 — diakritika je rozbitá. Ulož ho znovu jako UTF-8.`);
  }
  return raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

/* Dosadí {{ZASTUPNY_TEXT}}. Selže, když šablona žádá hodnotu, kterou nikdo
   nedodal; když dodaná hodnota nemá kam jít; nebo když v textu zbude jakékoli
   "{{" (chytí "{{ NAZEV }}" s mezerami i malá písmena, kterých by si regex
   níže nevšiml). */
export function render(name, vars) {
  const used = new Set();
  const out = readText(name).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`${name}: neznámý zástupný text {{${key}}} — program pro něj nemá hodnotu.`);
    used.add(key);
    return String(vars[key]);
  });
  const unused = Object.keys(vars).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`${name}: v souboru chybí {{${unused.join("}} a {{")}}} — hodnotu není kam doplnit.`);
  if (out.includes("{{")) throw new Error(`${name}: zbyl neplatný zástupný text. Povoleno je jen {{VELKA_PISMENA_BEZ_MEZER}}.`);
  return out;
}

/* Parser čte z odpovědi modelu přesně tyhle názvy polí. Kdyby je editace
   v promptu přejmenovala, běh by „uspěl" a publikoval 143 prázdných
   komentářů — proto se to ověří dřív, než se za dotaz zaplatí. */
export function assertFields(prompt, fields, name) {
  const missing = fields.filter((f) => !prompt.includes(`"${f}"`));
  if (missing.length) {
    throw new Error(`${name}: v ukázce JSON na konci souboru chybí povinná pole: ${missing.join(", ")}. Názvy polí v uvozovkách se nesmí měnit.`);
  }
}

/* Jedna hodnota na řádek, "#" uvozuje poznámku, prázdné řádky se ignorují. */
export function readList(name) {
  const items = readText(name).split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  if (!items.length) throw new Error(`${name}: seznam je prázdný.`);
  return items;
}

/* Každé nastavení musí být deklarované i s rozsahem, mimo který se hodnota
   odmítne. Překlep v názvu, chybějící řádek i nesmyslná hodnota běh zastaví —
   žádné nastavení nikdy tiše nespadne na výchozí hodnotu, kterou nikdo nevidí. */
const SCHEMA = {
  model: { type: "text" },
  maximalne_zdroju: { type: "int", min: 1, max: 5 },
  minimalni_delka_dokladu: { type: "int", min: 0, max: 200 },
  latka_poruseno: { type: "int", min: 0, max: 1 },
  delka_predchoziho_komentare: { type: "int", min: 40, max: 1000 },
  historie_tydnu: { type: "int", min: 4, max: 520 },
  historie_v_promptu: { type: "int", min: 0, max: 20 },
  vyhledavani_hodnoceni: { type: "int", min: 1, max: 10 },
  vyhledavani_zpravy: { type: "int", min: 1, max: 15 },
  pocet_zprav: { type: "int", min: 1, max: 12 },
  zprav_navic_k_vyberu: { type: "int", min: 0, max: 10 },
  zpravy_pocet_dni: { type: "int", min: 1, max: 30 },
  zpravy_tolerance_dni: { type: "int", min: 0, max: 14 },
  // Logická hodnota se zapisuje jako 0/1 — jiný typ tenhle soubor nezná.
  korektura: { type: "int", min: 0, max: 1 },
  korektura_model: { type: "text" },
  korektura_nejvic_zmen_procent: { type: "int", min: 0, max: 100 },
  // Stabilizace hodnocení (od 08/2026): plný audit všech bodů jednou za
  // tolik dní; mezitím se přehodnocují jen body s nalezenou událostí.
  plny_audit_dni: { type: "int", min: 7, max: 90 },
  overovat_prechody: { type: "int", min: 0, max: 1 },
  overovat_prostredni: { type: "int", min: 0, max: 1 },
  overovaci_model: { type: "text" },
  vyhledavani_overeni: { type: "int", min: 0, max: 10 },
  vyhledavani_delta: { type: "int", min: 1, max: 10 },
};

export function readSettings(name = "nastaveni.txt") {
  const out = {};
  readText(name).split("\n").forEach((line, i) => {
    const l = line.replace(/#.*$/, "").trim();
    if (!l) return;
    const m = l.match(/^([a-z_]+)\s*=\s*(.+)$/);
    if (!m) throw new Error(`${name}, řádek ${i + 1}: očekáván tvar "nazev = hodnota", je tam: ${line}`);
    const [, key, raw] = m;
    const def = SCHEMA[key];
    if (!def) throw new Error(`${name}, řádek ${i + 1}: neznámé nastavení "${key}". Povolená jsou: ${Object.keys(SCHEMA).join(", ")}`);
    if (key in out) throw new Error(`${name}, řádek ${i + 1}: "${key}" je v souboru dvakrát.`);
    if (def.type === "int") {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < def.min || n > def.max) {
        throw new Error(`${name}, řádek ${i + 1}: "${key}" musí být celé číslo ${def.min}–${def.max}, je tam "${raw}".`);
      }
      out[key] = n;
    } else out[key] = raw;
  });
  const missing = Object.keys(SCHEMA).filter((k) => !(k in out));
  if (missing.length) throw new Error(`${name}: chybí nastavení: ${missing.join(", ")}.`);
  return out;
}
