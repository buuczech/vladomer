/* scripts/lib/korektura.js
 * Jazyková korektura textů, které napsal model hodnotící program vlády.
 *
 * Dvě části, obě samostatně užitečné:
 *   1) ocisti() — mechanická oprava regulárními výrazy. Nic nestojí, běží
 *      vždycky (i při korektura = 0) a je jediná záruka, že se na web nikdy
 *      nedostane <cite> značka ani syrový klíč stavu.
 *   2) opravDavku() — jazyková korektura modelem. Každou vrácenou opravu
 *      prožene zkontrolujOpravu(); co neprojde, se zahodí a publikuje se
 *      původní text. Korektor, který tiše přepíše číslo, je horší než překlep.
 */
import { render, assertFields } from "./nastaveni.js";

export const POLE_KOREKTURY = ["comment_cs", "comment_en", "change_cs", "change_en", "evidence"];

export function jazykPole(pole) { return pole.endsWith("_en") ? "en" : "cs"; }

export function ctiPole(e, pole) {
  if (pole === "evidence") return e.evidence || "";
  const [skupina, jaz] = pole.split("_");
  return (e[skupina] && e[skupina][jaz]) || "";
}
export function zapisPole(e, pole, hodnota) {
  if (pole === "evidence") { e.evidence = hodnota; return; }
  const [skupina, jaz] = pole.split("_");
  if (!e[skupina]) e[skupina] = {};
  e[skupina][jaz] = hodnota;
}

/* --- 1. Mechanická očista ------------------------------------------------ */

/* Jediné HTML, které se kdy v datech objevilo. Obecné <[^>]+> se schválně
   nepoužívá: v textech se běžně píše „>10 000 m²“. */
const CITE = /<\/?cite\b[^>]*>/gi;
/* Klíče s podtržítkem nejsou nikdy běžné slovo — nahrazují se všude. */
const KLIC_PODTRZITKO = /\b(in_progress|not_started)\b/g;
/* V české větě je anglický klíč stavu vždycky chyba — „status partial" se na
   webu objevilo 11× v běhu 21. 8. 2026. V angličtině to naopak jsou běžná
   slova („partial funding"), takže se tam nesahá. */
const KLIC_CESKY = /\b(fulfilled|partial|declared|broken)\b/g;
/* Ostatní klíče jen v uvozovkách nebo závorce: „partial" a „broken" jsou
   v angličtině běžná slova a mimo uvozovky se jich nesmíme dotknout. */
const KLIC_V_UVOZOVKACH =
  /(["'„“”(])\s*(fulfilled|partial|in_progress|declared|not_started|broken|stalled)\s*(["'“”’)])/g;

export const STAV_POPIS = {
  fulfilled: { cs: "splněno", en: "fulfilled" },
  partial: { cs: "částečně splněno", en: "partially fulfilled" },
  in_progress: { cs: "probíhá", en: "in progress" },
  declared: { cs: "jen deklarováno", en: "declared only" },
  not_started: { cs: "nezahájeno", en: "not started" },
  broken: { cs: "porušeno", en: "broken" },
  stalled: { cs: "porušeno", en: "broken" }, // stará hodnota škály
};

function vUvozovkach(popis, jazyk) {
  return jazyk === "cs" ? `„${popis}“` : `"${popis}"`;
}

export function ocisti(text, jazyk) {
  let s = String(text || "");
  s = s.replace(CITE, "");
  /* Obalové znaky se zachovají — „(broken)" má zůstat závorkou „(porušeno)",
     ne se změnit v uvozovky. Nahrazuje se jen samotný klíč uvnitř. */
  s = s.replace(KLIC_V_UVOZOVKACH, (_, otvir, klic, zavir) =>
    `${otvir}${STAV_POPIS[klic][jazyk]}${zavir}`);
  // Holý klíč bez obalu naopak uvozovky potřebuje, jinak by věta ztratila
  // vyznačení, že jde o název stavu.
  s = s.replace(KLIC_PODTRZITKO, (klic) => vUvozovkach(STAV_POPIS[klic][jazyk], jazyk));
  if (jazyk === "cs") s = s.replace(KLIC_CESKY, (klic) => vUvozovkach(STAV_POPIS[klic].cs, "cs"));
  // Po odstranění značky zbývají zdvojené mezery a mezera před interpunkcí.
  s = s.replace(/[ \t]{2,}/g, " ").replace(/ ([,.;:!?])/g, "$1").trim();
  return s;
}

/* --- 2. Kontrola, že korektor nezměnil fakt ------------------------------ */

/* „10 000" i „10000" musí dát stejný otisk — jinak by se legitimní úprava
   mezery v tisících vyhodnotila jako změna čísla. */
const MEZERA_V_CISLE = /(\d)[   ](?=\d{3}\b)/g;
const DIAKRITIKA = /[áčďéěíňóřšťúůýž]/i;

function cislice(s) {
  return (String(s).replace(MEZERA_V_CISLE, "$1").match(/\d+/g) || []).sort().join("|");
}
/* Stejný tvar, jaký hlídá evidenceYearMismatch() v evaluate.js. Shoda téhle
   množiny je důkaz, že se ta funkce po korektuře rozhodne úplně stejně. */
function citaceSb(s) {
  return [...String(s).matchAll(/\b(\d{1,4})\s*\/\s*(\d{4})\s*Sb\b/gi)]
    .map((m) => `${m[1]}/${m[2]}`).sort().join("|");
}
function odkazy(s) {
  return (String(s).match(/https?:\/\/\S+/gi) || []).map((u) => u.toLowerCase()).sort().join("|");
}
/* Počet záporů. „nej-" (superlativ), „nebo" a „neboť" vynechány — jsou to
   běžně upravovaná slova, která by dělala plané poplachy. */
const ZAPOR_CS = /\bne(?!j|bo\b|boť\b)[a-záčďéěíňóřšťúůýž]/gi;
const ZAPOR_EN = /\b(?:not|no|never|nor|without|fail|fails|failed|unable|neither)\b|n['’]t\b/gi;
function zapory(s, jazyk) {
  return (String(s).match(jazyk === "en" ? ZAPOR_EN : ZAPOR_CS) || []).length;
}

/**
 * Vrátí null, když je oprava přijatelná, jinak český důvod odmítnutí.
 * Volající při nenulovém výsledku ponechá původní text.
 */
export function zkontrolujOpravu(puvodni, opraveny, { jazyk = "cs", minDelka = 0 } = {}) {
  const p = String(puvodni);
  const o = String(opraveny == null ? "" : opraveny).trim();

  if (!o) return "prázdná oprava";
  if (o === p) return "beze změny";
  if (cislice(p) !== cislice(o)) return "změnila se čísla";
  if (citaceSb(p) !== citaceSb(o)) return "změnily se citace Sb.";
  if ((p.match(/%/g) || []).length !== (o.match(/%/g) || []).length) return "změnil se počet %";
  if (odkazy(p) !== odkazy(o)) return "změnily se odkazy";
  if (zapory(p, jazyk) !== zapory(o, jazyk)) return "změnil se počet záporů";
  if (jazyk === "cs" && DIAKRITIKA.test(p) && !DIAKRITIKA.test(o)) return "zmizela diakritika";
  CITE.lastIndex = 0; KLIC_PODTRZITKO.lastIndex = 0;
  if (CITE.test(o) || KLIC_PODTRZITKO.test(o)) {
    CITE.lastIndex = 0; KLIC_PODTRZITKO.lastIndex = 0;
    return "model vrátil značku nebo klíč stavu";
  }
  CITE.lastIndex = 0; KLIC_PODTRZITKO.lastIndex = 0;
  if (o.length < minDelka) return `kratší než povolené minimum (${minDelka})`;
  const rozdil = Math.abs(o.length - p.length);
  if (rozdil > Math.max(25, p.length * 0.25)) return `délka se změnila o ${rozdil} znaků`;
  return null;
}

/* --- 3. Jedno volání API na jednu dávku ---------------------------------- */

const SEZNAM_STAVU_CS = ["fulfilled", "partial", "in_progress", "declared", "not_started", "broken"]
  .map((k) => `- ${STAV_POPIS[k].cs}`).join("\n");

/* Smluvená odpověď „nemám co opravit“. Musí být zároveň v promptu (hlídá
   zkontrolujPrompt) i v rozkladu odpovědi, jinak se obojí rozejde. Malými
   písmeny — porovnává se zlomený na malá. */
const NIC_RADEK = "[nic]";

/* Kolik oprav musí odpověď nabídnout, než má smysl posuzovat ji jako celek.
   Pod tím je poměr zamítnutých šum: u dvou řádků nic neříká, že je odpověď
   vadná, a zbytečně by se zahodila platná oprava. */
const NEJMENE_POSOUZENYCH = 3;

/* Obdoba assertFields() pro korekturu. Ta kontroluje názvy polí v ukázce
   JSON — jenže korektura schválně JSON nepoužívá: opravované texty jsou plné
   uvozovek („…" i rovných) a model je uvnitř JSON řetězce nedokáže spolehlivě
   escapovat (2 z 5 dávek prvního ostrého běhu skončily na „Expected
   double-quoted property name in JSON", a to i po opakování). Řádkový tvar
   escapování nepotřebuje vůbec.
   Volá se z opravDavku() i z preflight() v evaluate.js — proto je tady, a ne
   dvakrát opsaná; první verze měla kontrolu na obou místech a při změně
   formátu se rozešly. */
export function zkontrolujPrompt(prompt) {
  if (!prompt.includes("[1.1|comment_cs]")) {
    throw new Error("prompt-korektura.md: v ukázce odpovědi chybí řádek "
      + "začínající [1.1|comment_cs] — bez něj model neví, jaký tvar odpovědi se čeká.");
  }
  if (!prompt.includes(NIC_RADEK)) {
    throw new Error(`prompt-korektura.md: chybí smluvený řádek ${NIC_RADEK} pro odpověď `
      + "„nemám co opravit“ — bez něj model odpoví prózou a celá dávka se zahodí.");
  }
}

/**
 * davka: [{ klic, id, pole, text }]
 * Vrací { opravy: [{id, pole, text}], zmeneno, odmitnuto, celkem, duvody }.
 * Chybové hlášky musí obsahovat „API 4xx/5xx" nebo „JSON", jinak je
 * withBackoff() v evaluate.js nezopakuje.
 */
/* Vyčleněno z opravDavku(), aby se týž prompt dal sestavit i bez volání API —
   potřebuje ho build pro ukázku v sekci „Použité prompty". Kdyby si ho stránka
   skládala po svém, rozešel by se s tím, co se opravdu odesílá. */
export function promptKorektury(davka) {
  const seznam = davka
    // Ochrana render(): „{{" kdekoli v datech by vyhodilo výjimku o zbylém
    // zástupném textu. Dnes se to nevyskytuje, ale data píše model.
    .map((z) => `[${z.klic}] ${z.text.replace(/[\r\n]+/g, " ").replace(/\{\{/g, "{ {")}`)
    .join("\n");

  const prompt = render("prompt-korektura.md", {
    SEZNAM_STAVU_CS,
    SEZNAM_TEXTU: seznam,
  });
  zkontrolujPrompt(prompt);
  return prompt;
}

export async function opravDavku(davka, { model, key, maxTokens, stropProcent = 100, minDelkaDokladu = 0 }) {
  const prompt = promptKorektury(davka);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,   // korektura má být opakovatelná — stejný vstup, stejná oprava
      messages: [{ role: "user", content: prompt }],
      // Žádné tools: korektor nesmí nic dohledávat, jen opravovat jazyk.
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
  const clean = text.replace(/```[a-z]*\n?|```/g, "").trim();

  /* Prázdná odpověď je legitimní: model nenašel co opravit. Musí projít i
     přes podstrčený fetch v dump-prompts.js, který vrací "[]".
     Jenže vrátit doopravdy nic model nesvede — 22. 8. 2026 na to doplatily
     dvě dávky z pěti: místo prázdné odpovědi napsal větu („Všechny úryvky
     jsou gramaticky i pravopisně správné…“), rozklad ji neuměl přečíst
     a withBackoff to dvakrát zaplatil znovu. Proto smluvený řádek [nic]:
     model má co napsat a program to pozná. */
  const parsed = [];
  const spatneRadky = [];
  for (const radek of clean.split("\n")) {
    const r = radek.trim();
    if (!r || r === "[]" || r.toLowerCase() === NIC_RADEK) continue;
    const m = r.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!m) { spatneRadky.push(r.slice(0, 60)); continue; }
    parsed.push({ id: m[1].trim(), text: m[2].trim() });
  }
  /* Když nepřišel ani jeden použitelný řádek, ale něco model napsal, je to
     porucha tvaru odpovědi — a musí obsahovat "JSON", aby to withBackoff
     zopakoval (rozhoduje se podle textu hlášky). */
  if (parsed.length === 0 && spatneRadky.length > 0) {
    throw new Error(`odpověď nemá očekávaný tvar [id] text — JSON/řádkový rozklad selhal `
      + `(stop_reason=${data.stop_reason}, out_tokens=${data.usage?.output_tokens}, `
      + `první řádek: ${JSON.stringify(spatneRadky[0])})`);
  }

  /* Páruje se podle identifikátoru, NIKDY podle pořadí. Model má vracet jen
     opravené úryvky, takže vynechaný řádek je normální stav; u pořadového
     párování by se od prvního vynechání porovnával každý opravený úryvek
     s cizím originálem a kontrola faktů by zamítla úplně všechno. */
  const podleKlice = new Map(davka.map((z) => [z.klic, z]));
  const opravy = [];
  const duvody = [];
  const jizVracene = new Set();
  /* Kolik řádků se opravdu tvářilo jako oprava a kolik z nich neprošlo
     kontrolou faktů — podklad pro posouzení odpovědi jako celku níž. */
  let posouzeno = 0;
  let zamitnutoFakty = 0;
  for (const r of parsed) {
    const z = podleKlice.get(r.id);
    if (!z) { duvody.push(`${r.id}: neznámý identifikátor`); continue; } // vymyšlené id
    // Týž identifikátor podruhé: druhý řádek by tiše přepsal první.
    if (jizVracene.has(r.id)) { duvody.push(`${r.id}: identifikátor vrácen podruhé`); continue; }
    jizVracene.add(r.id);
    const duvod = zkontrolujOpravu(z.text, r.text, {
      jazyk: jazykPole(z.pole),
      minDelka: z.pole === "evidence" ? minDelkaDokladu : 0,
    });
    if (duvod === "beze změny") continue; // vrácený originál není pokus o opravu
    posouzeno++;
    if (duvod) { zamitnutoFakty++; duvody.push(`${r.id}: ${duvod}`); continue; }
    opravy.push({ id: z.id, pole: z.pole, text: ocisti(r.text.trim(), jazykPole(z.pole)) });
  }
  if (spatneRadky.length) duvody.push(`${spatneRadky.length} řádků v nečitelném tvaru`);

  /* Odpověď, které kontrola faktů zamítne většinu řádků, není korektura —
     je to jiný druh odpovědi, jen ve správném tvaru. Běh 22. 8. 2026 to
     ukázal: model odpověděl na každý řádek verdiktem o úryvku místo
     opraveného textu. Devatenáct verdiktů se zachytilo o čísla, jenže
     dvacátý padl na krátké pole bez číslic („Beze změny." → „– Vypadá
     správně.") a komentář korektora se zapsal do dat jako popis změny.
     Po jednotlivých úryvcích se to uhlídat nedá — jediné místo, kde je to
     vidět, je celá dávka. Kontrola se tím jen přitvrzuje: zahodí se i ten
     jeden řádek, který by sám o sobě prošel. */
  if (posouzeno >= NEJMENE_POSOUZENYCH && zamitnutoFakty > posouzeno / 2) {
    const ukazka = duvody.slice(0, 3).join("; ") + (duvody.length > 3 ? "; …" : "");
    throw new Error(`kontrola faktů zamítla ${zamitnutoFakty} z ${posouzeno} vrácených oprav `
      + `— odpověď není korektura, dávka zahozena (${ukazka})`);
  }

  /* Pojistka proti pokaženému promptu nebo modelu, který se rozhodne přepsat
     všechno. Raději nepublikovat žádnou opravu než nepozorovaně přepsat
     celou kapitolu. */
  const podil = davka.length ? Math.round((opravy.length / davka.length) * 100) : 0;
  if (podil > stropProcent) {
    throw new Error(`korektura přepsala ${podil} % úryvků (strop ${stropProcent} %) — dávka zahozena`);
  }

  return { opravy, zmeneno: opravy.length, odmitnuto: duvody.length, celkem: davka.length, duvody };
}
