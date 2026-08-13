/* scripts/lib/hlas-elevenlabs.js — mluvené slovo přes ElevenLabs.
 *
 * Lepší hlas než systémový Jakub, ale za kredity. Proto tady je vyrovnávací
 * paměť: klíčem je text i nastavení hlasu, takže překreslení obrázků, změna
 * časování nebo oprava překlepu v jiné scéně už nic nestojí. Zaplatí se jen
 * věta, která se opravdu změnila.
 *
 * Vedlejší efekt téhle paměti je důležitější než úspora: schválený reel se
 * dá přesestavit a zní úplně stejně. ElevenLabs vrací pokaždé o kousek jiné
 * podání, takže bez paměti by se po schválení mohlo vyjet něco jiného.
 *
 * KLÍČ SE NIKDY NEUKLÁDÁ DO REPOZITÁŘE. Čte se z prostředí, nebo z .env.local,
 * který .gitignore vylučuje. Do .env nepatří — ten je commitnutý.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const PAMET = join(KOREN, "ig-archive", "hlas-cache");
const API = "https://api.elevenlabs.io/v1";

/* Multilingual v2 zní na češtině nejlíp; flash je levnější a rychlejší, ale
   na krátkých větách s čísly dělá víc chyb v přízvuku. */
const VYCHOZI_MODEL = "eleven_multilingual_v2";

/* Vyrovnaný přednes: dost stability, aby hlas nekolísal mezi větami, ale ne
   tolik, aby zněl plochně. Součást klíče do paměti — změna sem sáhne na cenu. */
const NASTAVENI_HLASU = {
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

/* Proměnné z .env.local. Vite jimi krmí frontend, tady jde o klíč a volbu
   hlasu — soubor je v .gitignore přes „*.local", takže se nemá jak dostat ven. */
let envLocal = null;
function zProstredi(jmeno) {
  if (process.env[jmeno]) return process.env[jmeno];
  if (envLocal === null) {
    envLocal = {};
    const f = join(KOREN, ".env.local");
    if (existsSync(f)) {
      for (const puvodni of readFileSync(f, "utf8").split("\n")) {
        /* Uvozovky se sundávají kolem celého řádku i kolem samotné hodnoty.
           Zápis přes „echo "NAZEV=hodnota"" je na Windows běžný a uvozovky
           v souboru nechá — bez tohohle by se klíč tiše nenačetl a vypadalo
           by to, že chybí. */
        let radek = puvodni.trim();
        if (/^(".*"|'.*')$/.test(radek)) radek = radek.slice(1, -1);
        const m = radek.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) envLocal[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return envLocal[jmeno] || "";
}

export const klic = () => zProstredi("ELEVENLABS_API_KEY");
export const dostupny = () => Boolean(klic());

async function zavolej(cesta, volby = {}) {
  const res = await fetch(`${API}/${cesta}`, {
    ...volby,
    headers: { "xi-api-key": klic(), ...(volby.headers || {}) },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j);
    } catch { /* tělo nemuselo být JSON */ }
    if (res.status === 401) throw new Error(`ElevenLabs odmítl klíč (${detail})`);
    if (res.status === 429) throw new Error(`ElevenLabs: vyčerpané kredity nebo příliš mnoho dotazů (${detail})`);
    throw new Error(`ElevenLabs ${cesta}: ${detail}`);
  }
  return res;
}

/* Když není hlas nastavený, vypíše nabídku a vezme první. Hádat ID natvrdo
   nemá smysl — stockové hlasy se v čase mění a špatné ID by se projevilo až
   nesrozumitelnou chybou. */
let hlasId = null;
async function vyberHlas() {
  if (hlasId) return hlasId;
  const zvolený = zProstredi("ELEVENLABS_VOICE_ID");
  if (zvolený) { hlasId = zvolený; return hlasId; }

  const res = await zavolej("voices");
  const { voices = [] } = await res.json();
  if (!voices.length) throw new Error("ElevenLabs nevrátil žádný hlas");
  console.log("ELEVENLABS_VOICE_ID není nastavené. Dostupné hlasy:");
  for (const v of voices.slice(0, 12)) {
    console.log(`  ${v.voice_id}  ${v.name}${v.labels?.description ? ` — ${v.labels.description}` : ""}`);
  }
  hlasId = voices[0].voice_id;
  console.log(`Použije se první (${voices[0].name}). Vyber si a zapiš do .env.local.\n`);
  return hlasId;
}

/**
 * Kolik znaků z měsíčního přídělu je snědeno.
 * Vrací buď čísla, nebo důvod, proč je nevíme — mlčet by znamenalo, že se
 * příděl nedá hlídat a nikdo se nedozví proč. Sestavení to nikdy neshodí.
 */
export async function zbyvaKreditu() {
  try {
    const res = await zavolej("user/subscription");
    const s = await res.json();
    if (typeof s.character_count !== "number") return { potize: "API nevrátilo stav kreditů" };
    return { spotrebovano: s.character_count, limit: s.character_limit, tarif: s.tier };
  } catch (e) {
    if (/user_read/.test(e.message)) {
      return { potize: "klíč nemá oprávnění user_read — stav kreditů hlídej na elevenlabs.io, "
        + "nebo klíči to oprávnění přidej" };
    }
    return { potize: e.message };
  }
}

/**
 * Namluví text do MP3. Vrací { cesta, zPameti, znaku }.
 * Stejný text se stejným nastavením se podruhé nekupuje.
 */
export async function namluvOnline(text, cil) {
  const model = zProstredi("ELEVENLABS_MODEL") || VYCHOZI_MODEL;
  const hlas = await vyberHlas();
  const otisk = createHash("sha256")
    .update(JSON.stringify({ text, model, hlas, NASTAVENI_HLASU }))
    .digest("hex").slice(0, 16);

  mkdirSync(PAMET, { recursive: true });
  const ulozene = join(PAMET, `${otisk}.mp3`);

  if (existsSync(ulozene)) {
    writeFileSync(cil, readFileSync(ulozene));
    return { cesta: cil, zPameti: true, znaku: 0 };
  }

  const res = await zavolej(`text-to-speech/${hlas}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: NASTAVENI_HLASU }),
  });

  const zvuk = Buffer.from(await res.arrayBuffer());
  if (zvuk.length < 1000) throw new Error(`ElevenLabs vrátil ${zvuk.length} bajtů — to není nahrávka`);
  writeFileSync(ulozene, zvuk);
  writeFileSync(cil, zvuk);
  return { cesta: cil, zPameti: false, znaku: text.length };
}
