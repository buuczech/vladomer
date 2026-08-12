/* scripts/lib/hudba.js — podkresová smyčka pro reel.
 *
 * Hudbu z katalogu Instagramu přes API přidat nejde a stahovat cizí skladby
 * kvůli licencím taky ne, takže si ji projekt vyrobí sám: čtyři akordy, basa
 * a rozložený arpeggio, poskládané z čistých sinusovek ve ffmpegu. Zní to jako
 * levný syntezátor, protože to levný syntezátor je — na podkres pod mluveným
 * slovem to ale stačí a nikomu to nepatří.
 *
 * Kdo chce lepší zvuk, položí si vlastní skladbu (royalty-free) do
 * scripts/nastaveni/hudba/ a uvede její jméno v zadání. Tenhle generátor je
 * výchozí varianta, ne jediná.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const HUDBA_DIR = fileURLToPath(new URL("../nastaveni/hudba/", import.meta.url));

const VZOREK = 44100;
const DOBA = 0.5;          // čtvrťová nota ve vteřinách → 120 BPM
const TAKT = DOBA * 4;     // jeden akord na takt

/* Tóny. Rovnoměrně temperované ladění, a=440 Hz. */
const T = {
  F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81,
  E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25,
};

/* Cmaj7 – Am7 – Fmaj7 – G7. Nejotřepanější postup, jaký existuje, a přesně
   proto se poslouchá samo a nikoho nerozčílí. */
const POSTUP = [
  { pad: [T.E4, T.G4, T.B4], basa: T.C3, arp: [T.C5, T.E5, T.G4, T.E5] },
  { pad: [T.E4, T.G4, T.C5], basa: T.A2, arp: [T.A4, T.C5, T.E5, T.C5] },
  { pad: [T.F4, T.A4, T.C5], basa: T.F2, arp: [T.F4, T.A4, T.C5, T.A4] },
  { pad: [T.F4, T.G4, T.B4], basa: T.G2, arp: [T.G4, T.B4, T.D5, T.B4] },
];

export const DELKA_SMYCKY = POSTUP.length * TAKT;   // 8 s

/** Jedna nota: sinusovka s náběhem a doběhem, posunutá na svoje místo. */
function nota(index, frekvence, start, delka, hlasitost, doběh) {
  const nabeh = 0.015;
  return `sine=f=${frekvence.toFixed(2)}:d=${delka.toFixed(3)}:r=${VZOREK},`
    + `afade=t=in:st=0:d=${nabeh},`
    + `afade=t=out:st=${Math.max(0, delka - doběh).toFixed(3)}:d=${doběh},`
    + `volume=${hlasitost},`
    + `adelay=${Math.round(start * 1000)}:all=1[n${index}]`;
}

/**
 * Vrátí argumenty ffmpegu, které vyrobí smyčku do zadaného souboru.
 * Sinusovka sama o sobě zní ostře a plechově; dolní propust jí sebere ostří
 * a krátká ozvěna dodá dojem prostoru, takže to nepůsobí jako testovací tón.
 */
export function argySmycky(cil) {
  const casti = [];
  let i = 0;

  POSTUP.forEach((akord, takt) => {
    const zacatek = takt * TAKT;
    akord.pad.forEach((f) => casti.push(nota(i++, f, zacatek, TAKT, 0.16, 0.45)));
    casti.push(nota(i++, akord.basa, zacatek, TAKT, 0.30, 0.35));
    akord.arp.forEach((f, j) => casti.push(nota(i++, f, zacatek + j * DOBA, DOBA * 0.9, 0.22, 0.18)));
  });

  const vstupy = Array.from({ length: i }, (_, k) => `[n${k}]`).join("");
  casti.push(`${vstupy}amix=inputs=${i}:normalize=0[smes]`);
  casti.push("[smes]lowpass=f=3000,aecho=0.8:0.7:70:0.28,"
    + `alimiter=level_in=1:level_out=0.85,aformat=sample_rates=${VZOREK}:channel_layouts=stereo[hudba]`);

  return [
    "-y", "-loglevel", "error",
    "-filter_complex", casti.join(";"),
    "-map", "[hudba]", "-t", String(DELKA_SMYCKY),
    "-c:a", "pcm_s16le", cil,
  ];
}

/** Skladby, které si uživatel položil do scripts/nastaveni/hudba/. */
export function vlastniSkladby() {
  if (!existsSync(HUDBA_DIR)) return [];
  return readdirSync(HUDBA_DIR).filter((f) => /\.(mp3|m4a|wav|ogg|flac)$/i.test(f)).sort();
}

/** Přeloží hodnotu „hudba" ze zadání na cestu k souboru, nebo na null. */
export function vlastniSkladba(jmeno) {
  const cesta = join(HUDBA_DIR, jmeno);
  if (!existsSync(cesta)) {
    const k = vlastniSkladby();
    throw new Error(`hudba „${jmeno}“ ve scripts/nastaveni/hudba/ není`
      + (k.length ? `. Je tam: ${k.join(", ")}` : " (složka je prázdná)"));
  }
  return cesta;
}
