/* scripts/lib/hlas.js — mluvené slovo pro reel.
 *
 * Dvě možnosti, vybírá se podle toho, jestli je po ruce klíč:
 *
 *   ElevenLabs   když je nastavené ELEVENLABS_API_KEY (viz hlas-elevenlabs.js).
 *                Zní to jako člověk, stojí to kredity.
 *   Windows      jinak. Hlasový modul systému (Microsoft Jakub, cs-CZ) přes
 *                hlas.ps1. Syntetický a je to slyšet — úzké pásmo 16 kHz,
 *                rovná intonace — zato zdarma, offline a text nikam neodchází.
 *
 * Záloha není nouzové řešení, ale plnohodnotná varianta: když dojdou kredity
 * nebo vypadne síť, reel se pořád dá vyrobit. Skript vždycky vypíše, kterým
 * hlasem mluvil, aby se schválená a vydaná verze nemohly lišit potichu.
 *
 * Reely se sestavují jen lokálně na Windows, takže tahle závislost nikde jinde
 * nevadí; runner video jen zveřejňuje, nikdy ho nekóduje.
 */
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dostupny, namluvOnline } from "./hlas-elevenlabs.js";

const SKRIPT = fileURLToPath(new URL("./hlas.ps1", import.meta.url));

/* Výchozí hlas mluví pomalu; o pětinu rychleji zní na reelu přirozeněji, výš
   už začíná drmolit. */
export const TEMPO = 1.2;

/**
 * Namluví text. Vrací { cesta, kde, znaku, zPameti }.
 * `cil` je cesta bez přípony — tu určí až zvolený hlas (mp3 vs. wav).
 * Text má být hotová věta včetně interpunkce — čárky a tečky řídí pauzy.
 */
export async function namluv(text, cilBezPripony) {
  if (dostupny()) {
    const { cesta, zPameti, znaku } = await namluvOnline(text, `${cilBezPripony}.mp3`);
    return { cesta, kde: "elevenlabs", zPameti, znaku };
  }
  return { cesta: namluvWindows(text, `${cilBezPripony}.wav`), kde: "windows", zPameti: false, znaku: 0 };
}

/** Systémový hlas Windows. Vrací cestu k WAV. */
export function namluvWindows(text, cil, tempo = TEMPO) {
  if (process.platform !== "win32") {
    throw new Error("bez ELEVENLABS_API_KEY umí mluvené slovo jen Windows "
      + "(hlasový modul systému) — reel se sestavuje lokálně, ne na runneru");
  }
  const dir = mkdtempSync(join(tmpdir(), "vm-hlas-"));
  try {
    const txt = join(dir, "text.txt");
    writeFileSync(txt, text, "utf8");
    execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", SKRIPT, "-TextFile", txt, "-Out", cil, "-Rate", String(tempo),
    ], { stdio: ["ignore", "ignore", "pipe"], timeout: 120000, encoding: "utf8" });
  } catch (e) {
    const detail = (e.stderr || "").toString().trim().split("\n")[0] || e.message;
    throw new Error(`namluvení selhalo: ${detail}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  if (!existsSync(cil)) throw new Error("namluvení neprodukovalo soubor");
  return cil;
}
