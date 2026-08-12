/* scripts/instagram/reel.js — Instagram reel z textového zadání.
 *
 *   node scripts/instagram/reel.js --zadani ig-posts/…json              sestaví
 *   node scripts/instagram/reel.js --zadani … --rezim publish           zveřejní
 *   … --bez-publikace                                                   zkouška
 *
 * Reel není animace po snímcích. Každá scéna je jedna obrazovka 1080×1920
 * vykreslená Chromem; pohyb (pomalé najetí, prolínání) dělá ffmpeg. Vypadá to
 * slušně, generuje se to za vteřiny a dá se to donekonečna ladit — což je
 * u obsahu, který se schvaluje, důležitější než dokonalost.
 *
 * Zvuk má dvě vrstvy: mluvený komentář (hlasový modul Windows) a podkresovou
 * hudbu (vlastní smyčka, viz lib/hudba.js). Hudba se pod mluvením sama
 * ztlumí. DÉLKU SCÉN URČUJE KOMENTÁŘ, ne „trvani" v zadání — to je jen dolní
 * mez. Věta useknutá střihem uprostřed je horší než scéna o vteřinu delší.
 *
 * Zveřejňuje se PŘESNĚ to video, které vzniklo a bylo schváleno; nikde se
 * nekóduje znovu.
 *
 * Tvar zadání:
 * {
 *   "typ": "reel",
 *   "popisek": "…",                                povinné
 *   "hudba": "auto",                               volitelné: auto | zadna | jméno souboru
 *   "publikovat_v": "2026-08-14T19:00:00+02:00",   volitelné
 *   "sceny": [
 *     { "typ": "text",  "titulek": "…", "podtitulek": "…",
 *       "komentar": "Co se k tomu řekne.", "trvani": 4 },
 *     { "typ": "cislo", "cislo": "5,6", "jednotka": "%", "nadpis": "…",
 *       "popis": "…", "dovetek": "…", "barva": "ok|bad|neutral",
 *       "komentar": "…", "trvani": 4 },
 *     { "typ": "body",  "nadpis": "…", "styl": "odrazky|kroky", "body": ["…"],
 *       "komentar": "…", "trvani": 6 }
 *   ]
 * }
 */
import {
  writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, mkdtempSync, readdirSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../lib/nastaveni.js";
import {
  REEL_SIRKA, REEL_VYSKA, vykresli, publikujReel, surovaAdresa,
} from "../lib/instagram.js";
import { PROLNUTI, MAX_DELKA, zkontrolujReel } from "../lib/zadani.js";
import { namluv } from "../lib/hlas.js";
import { dostupny, zbyvaKreditu } from "../lib/hlas-elevenlabs.js";
import { argySmycky, vlastniSkladba, HUDBA_DIR } from "../lib/hudba.js";

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const ARCHIV = join(KOREN, "ig-archive", "reels");
const FPS = 30;
const ZOOM = 0.06;            // najetí přes celou scénu; víc už je znát jako pohyb

/* Komentář nezačíná ve chvíli střihu — divák potřebuje okamžik obrázek
   zaregistrovat. A po poslední slabice musí zbýt víc než prolnutí, jinak věta
   dozní až přes další scénu. */
const PRODLEVA_PRED = 0.35;
const PRODLEVA_PO = 0.7;

/* Podkres se srovnává na pevnou hlasitost, ne na pevné zesílení. Vygenerovaná
   smyčka je tichá, hotová skladba bývá vymastrovaná nahlas — se společným
   zesílením by jedno bylo neslyšet a druhé by přehlušilo řeč. */
const HUDBA_LUFS = -26;

const BARVY = { ok: "#10B981", bad: "#EF4444", neutral: "#E8EDF7" };

const arg = (jm, vych) => {
  const i = process.argv.indexOf(`--${jm}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : vych;
};
const ZADANI = arg("zadani", "");
const REZIM = arg("rezim", "build");
const BEZ_PUBLIKACE = process.argv.includes("--bez-publikace");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* --- ffmpeg -------------------------------------------------------------- */

const ffCache = new Map();

/* Na Ubuntu runneru je ffmpeg předinstalovaný v PATH. Na Windows ho winget
   nainstaluje do svého adresáře a do PATH se to promítne až v novém terminálu,
   takže se prohledá i tam — jinak by build fungoval jen po restartu shellu. */
function ffNastroj(jmeno) {
  if (ffCache.has(jmeno)) return ffCache.get(jmeno);

  const kandidati = [jmeno];
  const balicky = join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
  if (process.env.LOCALAPPDATA && existsSync(balicky)) {
    for (const d of readdirSync(balicky).filter((x) => x.startsWith("Gyan.FFmpeg"))) {
      for (const v of readdirSync(join(balicky, d)).filter((x) => x.startsWith("ffmpeg-"))) {
        kandidati.push(join(balicky, d, v, "bin", `${jmeno}.exe`));
      }
    }
  }

  for (const c of kandidati) {
    if (c.includes("\\") && !existsSync(c)) continue;
    try {
      execFileSync(c, ["-version"], { stdio: "ignore", timeout: 20000 });
      ffCache.set(jmeno, c);
      return c;
    } catch { /* další */ }
  }
  throw new Error(`${jmeno} nenalezen — nainstaluj ho příkazem „winget install Gyan.FFmpeg“`);
}

const ff = (args, timeout = 300000) =>
  execFileSync(ffNastroj("ffmpeg"), args, { stdio: ["ignore", "ignore", "inherit"], timeout });

/* Integrovaná hlasitost souboru v LUFS. Nic nepřekóduje, jen měří.
   ffmpeg píše měření na stderr, ne na stdout — proto spawnSync a ne
   execFileSync, který vrací jen stdout (a tedy nic). */
function hlasitostSouboru(cesta) {
  const v = spawnSync(ffNastroj("ffmpeg"), [
    "-hide_banner", "-nostats", "-i", cesta, "-map", "0:a",
    "-af", "ebur128", "-f", "null", "-",
  ], { encoding: "utf8", timeout: 120000 });
  if (v.error) throw v.error;
  // Poslední „I: … LUFS" je souhrn za celý soubor; předchozí jsou průběžné.
  const m = (v.stderr || "").match(/I:\s*(-?[\d.]+)\s*LUFS/g);
  if (!m) throw new Error(`nepodařilo se změřit hlasitost ${basename(cesta)}`);
  const posledni = Number(m[m.length - 1].match(/(-?[\d.]+)/)[1]);
  if (!Number.isFinite(posledni)) throw new Error(`nesmyslná hlasitost ${basename(cesta)}`);
  return posledni;
}

function delkaZvuku(cesta) {
  const out = execFileSync(ffNastroj("ffprobe"), [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", cesta,
  ], { encoding: "utf8", timeout: 60000 });
  const d = Number(out.trim());
  if (!Number.isFinite(d)) throw new Error(`nepodařilo se změřit délku ${basename(cesta)}`);
  return d;
}

/* --- scény --------------------------------------------------------------- */

const velikostTitulku = (t) => (t.length <= 26 ? 104 : t.length <= 46 ? 84 : t.length <= 70 ? 68 : 56);
const velikostNadpisu = (t) => (t.length <= 24 ? 82 : t.length <= 42 ? 68 : 56);
function velikostCisla(t) {
  if (t.length <= 2) return 340;
  if (t.length === 3) return 280;
  if (t.length === 4) return 240;
  return 200;
}

function scenaHtml(s) {
  if (s.typ === "text") {
    return render("reel-text.html", {
      TITULEK: esc(s.titulek),
      VELIKOST_TITULKU: velikostTitulku(s.titulek),
      PODTITULEK: esc(s.podtitulek || ""),
    });
  }
  if (s.typ === "cislo") {
    const cislo = String(s.cislo);
    return render("reel-cislo.html", {
      NADPIS: esc(s.nadpis || ""),
      CISLO: esc(cislo),
      JEDNOTKA: esc(s.jednotka ?? "%"),
      VELIKOST_CISLA: velikostCisla(cislo),
      VELIKOST_JEDNOTKY: Math.round(velikostCisla(cislo) * 0.4),
      BARVA: BARVY[s.barva] || BARVY.neutral,
      POPIS: esc(s.popis || ""),
      DOVETEK: esc(s.dovetek || ""),
    });
  }
  if (s.typ === "body") {
    const kroky = s.styl === "kroky";
    const radky = s.body.map((t, i) => {
      const znacka = kroky
        ? `<div class="cislo">${String(i + 1).padStart(2, "0")}</div>`
        : `<div class="tecka"></div>`;
      return `<div class="radek">${znacka}<div style="font-size:38px;line-height:1.34;font-weight:560">${esc(t)}</div></div>`;
    }).join("\n");
    return render("reel-body.html", {
      NADPIS: esc(s.nadpis),
      VELIKOST_NADPISU: velikostNadpisu(s.nadpis),
      RADKY: radky,
    });
  }
  throw new Error(`neznámý typ scény „${s.typ}“`);
}

/* --- obraz --------------------------------------------------------------- */

/* Zdrojem jsou JPEGy z Chromu, tedy plný barevný rozsah. Bez převodu na
   omezený rozsah se video otaguje jako yuvj420p a na některých přehrávačích
   vypadá přepáleně — ověřeno, proto in_range/out_range i -color_range.

   Statická obrazovka po několik vteřin vypadá jako zaseknuté video, proto se
   přes ni pomalu najíždí. zoompan počítá výřez v celých pixelech, takže na
   pomalém pohybu poskakuje; vstup se proto nejdřív zvětší na dvojnásobek
   a krok se tím rozpůlí. Sudé scény najíždějí dovnitř, liché ven — jinak
   celý reel působí jako jeden dlouhý přejezd. */
function obrazoveFiltry(delky) {
  const f = delky.map((delka, i) => {
    const snimku = Math.max(2, Math.round(delka * FPS));
    const postup = `on/${snimku - 1}`;
    const zoom = i % 2 === 0 ? `1+${ZOOM}*${postup}` : `${1 + ZOOM}-${ZOOM}*${postup}`;
    return `[${i}:v]scale=${REEL_SIRKA * 2}:${REEL_VYSKA * 2}:in_range=full:out_range=tv:flags=lanczos,`
      + `fps=${FPS},`
      + `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':`
      + `d=1:s=${REEL_SIRKA}x${REEL_VYSKA}:fps=${FPS},`
      + `format=yuv420p,setsar=1[v${i}]`;
  });

  // Postupné prolínání: v0+v1 → x1, x1+v2 → x2, …
  let posledni = "[v0]";
  let offset = delky[0] - PROLNUTI;
  for (let i = 1; i < delky.length; i++) {
    const vystup = i === delky.length - 1 ? "[v]" : `[x${i}]`;
    f.push(`${posledni}[v${i}]xfade=transition=fade:duration=${PROLNUTI}:offset=${offset.toFixed(3)}${vystup}`);
    posledni = vystup;
    offset += delky[i] - PROLNUTI;
  }
  return f;
}

/* --- zvuk ---------------------------------------------------------------- */

/**
 * Sestaví zvukovou stopu z podkresu a namluvených vět.
 * `hlasy` jsou dvojice index vstupu a čas, kdy má věta začít.
 */
function zvukoveFiltry({ hudbaIndex, hudbaZesileni, hlasy, celkem }) {
  const f = [];

  /* Hlasový modul dává 16kHz mono s dost temným zvukem. Horní propust sundá
     dunění, zdvih kolem 2,8 kHz vytáhne srozumitelnost a komprese srovná
     hlasitost, aby tišší slabiky nezapadly pod hudbu. */
  hlasy.forEach(({ index, start }, k) => {
    const ms = Math.round(start * 1000);
    f.push(`[${index}:a]aformat=sample_rates=44100:channel_layouts=stereo,`
      + "highpass=f=90,equalizer=f=2800:width_type=h:width=1600:g=3,"
      + "acompressor=threshold=0.1:ratio=3:attack=10:release=180,"
      + `volume=1.5,adelay=${ms}|${ms}[m${k}]`);
  });

  /* Mluva se dopředu natáhne tichem na celou délku reelu. Bez toho skončí
     sidechaincompress níž s poslední větou — bere kratší ze svých dvou vstupů —
     a hudba se utne dřív než obraz. */
  const dopln = `apad=whole_dur=${celkem.toFixed(3)}[mluva]`;
  let mluva = null;
  if (hlasy.length === 1) { f.push(`[m0]${dopln}`); mluva = "[mluva]"; }
  else if (hlasy.length > 1) {
    const vstupy = hlasy.map((_, k) => `[m${k}]`).join("");
    f.push(`${vstupy}amix=inputs=${hlasy.length}:normalize=0:dropout_transition=0,${dopln}`);
    mluva = "[mluva]";
  }

  let hudba = null;
  if (hudbaIndex !== null) {
    f.push(`[${hudbaIndex}:a]aformat=sample_rates=44100:channel_layouts=stereo,`
      + `volume=${hudbaZesileni.toFixed(2)}dB,`
      + `afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, celkem - 1.5).toFixed(2)}:d=1.5[hud]`);
    hudba = "[hud]";
  }

  /* Srovnání hlasitosti na -14 LUFS, což je zhruba to, na co si Instagram
     stejně všechno přepočítá. Bez toho vyjde reel o osm decibelů tišší než
     okolní videa ve feedu a působí to jako vada. */
  const konec = "loudnorm=I=-14:TP=-1.5:LRA=11,"
    + "aformat=sample_rates=44100:channel_layouts=stereo[a]";

  if (hudba && mluva) {
    /* Podkres se pod mluvením sám stáhne dolů a po větě zase nastoupí. Bez
       toho by se hlas s hudbou pral a na mobilním reproduktoru by zanikl.

       Mírně: první verze měla práh 0,02 (tedy −34 dB) a poměr 8:1, což hudbu
       pod řečí rozdrtilo na −45 dB a mezi větami ji kvůli dlouhému návratu
       nestihlo pustit zpátky. Ubrat ji má být slyšet, ne ji vypnout. */
    f.push(`${mluva}asplit=2[rec1][rec2]`);
    f.push(`${hudba}[rec1]sidechaincompress=threshold=0.08:ratio=4:attack=20:release=250[hudd]`);
    f.push(`[hudd][rec2]amix=inputs=2:normalize=0,${konec}`);
  } else if (hudba) {
    f.push(`${hudba}${konec}`);
  } else if (mluva) {
    f.push(`${mluva}${konec}`);
  } else {
    // Reel úplně bez zvuku část přehrávačů i nástrojů řeší hůř než tichou stopu.
    f.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${celkem.toFixed(2)},${konec}`);
  }
  return f;
}

function sestavVideo({ snimky, delky, hudbaSoubor, namluveno, zacatky, celkem, cil }) {
  const vstupy = [];
  snimky.forEach((f, i) => vstupy.push("-loop", "1", "-t", String(delky[i]), "-i", f));

  let hudbaIndex = null;
  let hudbaZesileni = 0;
  if (hudbaSoubor) {
    hudbaIndex = snimky.length;
    hudbaZesileni = HUDBA_LUFS - hlasitostSouboru(hudbaSoubor);
    // Smyčka je kratší než reel, takže se přehraje dokola; -shortest ji utne.
    vstupy.push("-stream_loop", "-1", "-i", hudbaSoubor);
  }

  const hlasy = [];
  namluveno.forEach((n, i) => {
    if (!n) return;
    hlasy.push({ index: snimky.length + (hudbaIndex === null ? 0 : 1) + hlasy.length, start: zacatky[i] + PRODLEVA_PRED });
    vstupy.push("-i", n.soubor);
  });

  const filtry = [...obrazoveFiltry(delky),
    ...zvukoveFiltry({ hudbaIndex, hudbaZesileni, hlasy, celkem })];

  ff([
    "-y", "-loglevel", "error",
    ...vstupy,
    "-filter_complex", filtry.join(";"),
    "-map", "[v]", "-map", "[a]", "-shortest",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21",
    "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-movflags", "+faststart",
    cil,
  ]);
}

/** Ověří, co vzniklo — ať se vada pozná tady, ne až na Instagramu. */
function zkontrolujVideo(cesta, ocekavanaDelka) {
  // Obojí v jednom -show_entries: druhý přepínač by ten první v některých
  // verzích ffprobe přebil a délka by se pak tiše nekontrolovala.
  const out = execFileSync(ffNastroj("ffprobe"), [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_name,width,height,pix_fmt",
    "-of", "default=noprint_wrappers=1", cesta,
  ], { encoding: "utf8", timeout: 60000 });

  const hod = (k) => (out.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1];
  const delka = Number(hod("duration"));
  const potize = [];
  if (!out.includes("codec_name=h264")) potize.push("chybí video stopa H.264");
  if (!out.includes("codec_name=aac")) potize.push("chybí zvuková stopa AAC");
  if (hod("width") !== String(REEL_SIRKA) || hod("height") !== String(REEL_VYSKA)) {
    potize.push(`rozměr ${hod("width")}×${hod("height")} místo ${REEL_SIRKA}×${REEL_VYSKA}`);
  }
  if (!out.includes("pix_fmt=yuv420p")) potize.push(`pix_fmt ${hod("pix_fmt")} místo yuv420p`);
  if (!Number.isFinite(delka)) potize.push("ffprobe neřekl délku");
  else if (Math.abs(delka - ocekavanaDelka) > 0.6) potize.push(`délka ${delka} s místo ${ocekavanaDelka} s`);
  if (potize.length) throw new Error(`video nevyšlo správně: ${potize.join("; ")}`);
  return delka;
}

/* --- režimy -------------------------------------------------------------- */

function nactiZadani() {
  if (!ZADANI) throw new Error("chybí --zadani cesta/k/zadani.json");
  if (!existsSync(ZADANI)) throw new Error(`zadání ${ZADANI} neexistuje`);
  let z;
  try { z = JSON.parse(readFileSync(ZADANI, "utf8")); }
  catch (e) { throw new Error(`zadání není platný JSON: ${e.message}`); }
  if (z.typ !== "reel") throw new Error(`zadání není reel (typ = „${z.typ ?? "chybí"}“)`);
  zkontrolujReel(z);
  return z;
}

const zakladJmena = () => basename(ZADANI).replace(/\.json$/i, "");

async function build() {
  const z = nactiZadani();
  const zaklad = zakladJmena();
  mkdirSync(ARCHIV, { recursive: true });

  const dir = mkdtempSync(join(tmpdir(), "vm-reel-"));
  try {
    /* Nejdřív hlas: jeho délka určuje, jak dlouho scéna vydrží na plátně. */
    const namluveno = [];
    let znakuCelkem = 0;
    let zPameti = 0;
    let kde = null;
    for (const [i, s] of z.sceny.entries()) {
      if (!s.komentar) { namluveno.push(null); continue; }
      const v = await namluv(s.komentar, join(dir, `hlas-${String(i + 1).padStart(2, "0")}`));
      znakuCelkem += v.znaku;
      if (v.zPameti) zPameti++;
      kde = v.kde;
      namluveno.push({ soubor: v.cesta, delka: delkaZvuku(v.cesta) });
    }
    if (kde) {
      console.log(`Hlas: ${kde === "elevenlabs" ? "ElevenLabs" : "systémový (Microsoft Jakub)"}`
        + (kde === "elevenlabs"
          ? ` — ${znakuCelkem} znaků nově, ${zPameti}× z paměti`
          : "") + "\n");
    }

    const delky = z.sceny.map((s, i) => {
      const potreba = namluveno[i] ? PRODLEVA_PRED + namluveno[i].delka + PRODLEVA_PO : 0;
      return Math.max(s.trvani, Math.ceil(potreba * 10) / 10);
    });

    const zacatky = [];
    delky.reduce((t, d, i) => { zacatky[i] = t; return t + d - PROLNUTI; }, 0);
    const celkem = Math.round((delky.reduce((a, b) => a + b, 0) - PROLNUTI * (delky.length - 1)) * 100) / 100;

    if (celkem > MAX_DELKA) {
      throw new Error(`s namluveným komentářem by reel měl ${celkem} s, což je přes ${MAX_DELKA} s — `
        + "zkrať komentáře nebo uber scénu");
    }

    /* Podkres. „auto" znamená výchozí stopu ze scripts/nastaveni/hudba/;
       teprve když tam žádná není, složí se nouzová smyčka ze sinusovek. Ta
       je tu pro případ, že by sada chyběla — sama o sobě zní lacině. */
    const volba = z.hudba ?? "auto";
    let hudbaSoubor = null;
    let hudbaPopis = "bez hudby";
    if (volba === "auto") {
      const vychozi = join(HUDBA_DIR, "vychozi.mp3");
      if (existsSync(vychozi)) { hudbaSoubor = vychozi; hudbaPopis = "vychozi.mp3"; }
      else {
        hudbaSoubor = join(dir, "hudba.wav");
        ff(argySmycky(hudbaSoubor), 120000);
        hudbaPopis = "nouzová smyčka (ve scripts/nastaveni/hudba/ nic není)";
      }
    } else if (volba !== "zadna") {
      hudbaSoubor = vlastniSkladba(volba);
      hudbaPopis = volba;
    }

    const snimky = z.sceny.map((s, i) => {
      const f = join(dir, `scena-${String(i + 1).padStart(2, "0")}.jpg`);
      vykresli(scenaHtml(s), f, REEL_SIRKA, REEL_VYSKA);
      const natazeno = delky[i] > s.trvani ? ` — nataženo z ${s.trvani} s kvůli komentáři` : "";
      console.log(`Scéna ${i + 1}/${z.sceny.length} (${s.typ}, ${delky[i]} s${natazeno})`);
      return f;
    });

    const cil = join(ARCHIV, `${zaklad}.mp4`);
    sestavVideo({ snimky, delky, hudbaSoubor, namluveno, zacatky, celkem, cil });
    const delka = zkontrolujVideo(cil, celkem);
    const mb = (readFileSync(cil).length / 1048576).toFixed(1);
    const zvuk = `${hudbaPopis}, ${namluveno.filter(Boolean).length}× komentář`;
    console.log(`\nVideo: ig-archive/reels/${zaklad}.mp4 (${mb} MB, ${delka} s, `
      + `${REEL_SIRKA}×${REEL_VYSKA}, H.264 + AAC — ${zvuk})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  writeFileSync(join(ARCHIV, `${zaklad}.txt`), z.popisek, "utf8");

  /* Měsíční příděl je malý, takže má smysl ho mít na očích hned po sestavení,
     ne až ve chvíli, kdy dojde uprostřed práce. */
  const kredity = dostupny() ? await zbyvaKreditu() : null;
  if (kredity?.potize) {
    console.log(`Kredity ElevenLabs se zjistit nedaly: ${kredity.potize}`);
  } else if (kredity) {
    const zbyva = kredity.limit - kredity.spotrebovano;
    console.log(`Kredity ElevenLabs: zbývá ${zbyva} z ${kredity.limit} znaků na tento měsíc`
      + `${kredity.tarif ? ` (tarif ${kredity.tarif})` : ""}.`);
  }

  console.log("--- popisek ---\n" + z.popisek + "\n--- konec popisku ---");
}

/** Po úspěšném zveřejnění doplní do zadání ID příspěvku. */
function zaznamenej(id) {
  const z = JSON.parse(readFileSync(ZADANI, "utf8"));
  if (!z.publikovano) return;
  z.publikovano = { ...z.publikovano, id, kdy: new Date().toISOString() };
  writeFileSync(ZADANI, `${JSON.stringify(z, null, 2)}\n`, "utf8");
}

async function publish() {
  nactiZadani();
  const zaklad = zakladJmena();
  const video = join(ARCHIV, `${zaklad}.mp4`);
  const popis = join(ARCHIV, `${zaklad}.txt`);
  if (!existsSync(video) || !existsSync(popis)) {
    throw new Error(`v ig-archive/reels/ chybí ${zaklad}.mp4 nebo ${zaklad}.txt`
      + " — nejdřív musí proběhnout build a commit");
  }
  const id = await publikujReel(
    surovaAdresa(`ig-archive/reels/${zaklad}.mp4`),
    readFileSync(popis, "utf8"),
    { bezPublikace: BEZ_PUBLIKACE },
  );
  if (id) zaznamenej(id);
}

async function main() {
  if (!["build", "publish"].includes(REZIM)) {
    throw new Error(`neznámý režim „${REZIM}“. Použij build nebo publish.`);
  }
  if (REZIM === "publish" && (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID)) {
    throw new Error("chybí IG_ACCESS_TOKEN nebo IG_USER_ID — publikuje se z GitHub Actions, ne lokálně");
  }
  return REZIM === "build" ? build() : publish();
}

/* Nastavuje se exitCode místo process.exit(): ukončit běh natvrdo ve chvíli,
   kdy je otevřené spojení na ElevenLabs, shodí na Windows libuv aserci a přes
   ni není vidět vlastní chybová hláška. Takhle Node doběhne sám. */
main().catch((e) => { console.error(`\nCHYBA: ${e.message}\n`); process.exitCode = 1; });
