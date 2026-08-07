import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DATES, CHAPTERS, ALL_ITEMS, TOTAL_ITEMS } from "./data.js";
import {
  GOVERNMENTS, CURRENT_GOV, CURRENT_EXTERNAL_Q1,
  QUARTER_COUNT, quarterOf, quarterLabel,
} from "./governments.js";
import CookieBar, { CookieSettingsLink } from "./CookieBar.jsx";

/* =========================================================================
   VLÁDOMĚR — production build.
   Weekly AI evaluation runs server-side (GitHub Actions) and writes:
     - public/evaluations.json  (statuses, comments, change notes, sources)
     - public/history.json      (weekly status snapshots, last 52 weeks)
   The browser only reads these files — no API key is ever shipped to clients.
   ========================================================================= */

const T = {
  appTitle: { cs: "Vládoměr", en: "Govern-o-meter" },
  appSubtitle: { cs: "Sledování plnění programového prohlášení vlády", en: "Tracking delivery of the government's programme statement" },
  govLabel: { cs: "Vláda Andreje Babiše · ANO + SPD + Motoristé sobě", en: "Babiš cabinet · ANO + SPD + Motoristé sobě" },
  daysInPower: { cs: "Ve funkci", en: "In office" },
  daysToElection: { cs: "Do voleb (odhad)", en: "To election (est.)" },
  overall: { cs: "Plnění programu", en: "Programme delivery" },
  statDone: { cs: "splněno", en: "fulfilled" },
  statPartial: { cs: "částečně", en: "partial" },
  statProg: { cs: "probíhá", en: "in progress" },
  statBroken: { cs: "porušeno", en: "broken" },
  statUnver: { cs: "neměřitelných", en: "unmeasurable" },
  evidenceLabel: { cs: "Doloženo", en: "Evidence" },
  unverBadge: { cs: "neměřitelné", en: "unmeasurable" },
  days: { cs: "dní", en: "days" },
  evaluated: { cs: "hodnoceno", en: "evaluated" },
  ofItems: { cs: "z", en: "of" },
  notRatedYet: { cs: "první hodnocení zatím neproběhlo", en: "the first assessment has not run yet" },
  textVersion: { cs: "Textový výpis všech bodů", en: "Plain-text listing of every commitment" },
  promptsIntro: {
    cs: "Každý pátek ráno spustí server program, který za vás položí jazykovému modelu několik otázek a z odpovědí sestaví to, co vidíte na webu. Otázky nejsou pokaždé jiné — jsou to tři pevné texty, které tu jsou celé a doslova. Nic dalšího model nedostane.",
    en: "Every Friday morning a program runs on the server, puts a handful of questions to a language model and assembles what you see on the site from the answers. The questions are not improvised — they are three fixed texts, reproduced here in full and verbatim. The model receives nothing else.",
  },
  promptsSablona: {
    cs: "Prompty jsou šablony. Značka jako {{SEZNAM_BODU}} se před odesláním nahradí skutečnými daty — konkrétními body programu, jejich minulotýdenním stavem, dnešním datem. Proto je u každého i ukázka, jak text vypadá ve chvíli, kdy se odesílá. Ukázky se skládají stejným kódem jako ostrý běh, takže se nemohou rozejít.",
    en: "The prompts are templates. A marker such as {{SEZNAM_BODU}} is replaced with real data before sending — the actual commitments, their status a week ago, today's date. That is why each one is shown as it looks at the moment it is sent, too. The examples are assembled by the same code as the live run, so they cannot drift apart.",
  },
  promptModel: { cs: "Použitý model", en: "Model used" },
  promptSablona: { cs: "Doslovné znění", en: "Verbatim text" },
  promptUkazka: { cs: "Ukázka po doplnění dat", en: "Example with data filled in" },
  promptSoubor: { cs: "Soubor na GitHubu", en: "File on GitHub" },
  promptZdroje: { cs: "Weby, ze kterých model smí čerpat", en: "Sites the model may draw on" },
  promptZdrojeP: {
    cs: "Model nehledá po celém internetu. Vyhledávání je technicky omezeno na tyhle domény — na nic jiného se nedostane, i kdyby chtěl.",
    en: "The model does not search the whole internet. Its search is technically restricted to these domains — it cannot reach anything else, even if it tried.",
  },
  promptZdrojeH: { cs: "Pro hodnocení", en: "For assessments" },
  promptZdrojeZ: { cs: "Pro zprávy týdne", en: "For the weekly headlines" },
  promptLoading: { cs: "Načítám prompty…", en: "Loading prompts…" },
  promptError: { cs: "Prompty se nepodařilo načíst.", en: "The prompts could not be loaded." },
  promptShow: { cs: "Zobrazit", en: "Show" },
  promptHide: { cs: "Skrýt", en: "Hide" },
  openOnGithub: { cs: "Zdrojový kód a data na GitHubu", en: "Source code and data on GitHub" },
  seePrompts: { cs: "Zobrazit použité prompty", en: "See the prompts used" },
  licenceLine: {
    cs: "Data a hodnocení jsou k volnému použití s uvedením zdroje:",
    en: "The data and assessments are free to reuse with attribution:",
  },
  lastUpdated: { cs: "Naposledy aktualizováno", en: "Last updated" },
  nextUpdate: { cs: "Další hodnocení", en: "Next evaluation" },
  never: { cs: "zatím neproběhlo", en: "not yet run" },
  expandAll: { cs: "Rozbalit vše", en: "Expand all" },
  collapseAll: { cs: "Sbalit vše", en: "Collapse all" },
  searchPlaceholder: { cs: "Hledat v bodech programu…", en: "Search the programme…" },
  filterAll: { cs: "Vše", en: "All" },
  source: { cs: "Zdroj: programové prohlášení vlády", en: "Source: government programme statement" },
  items: { cs: "bodů", en: "items" },
  noResults: { cs: "Žádné body neodpovídají hledání.", en: "No items match your search." },
  scope: { cs: "Oblastí", en: "Areas" },
  changesTitle: { cs: "Změny od minulého týdne", en: "Changes since last week" },
  changeLabel: { cs: "Co se změnilo", en: "What changed" },
  historyLabel: { cs: "Historie stavu", en: "Status history" },
  sourcesLabel: { cs: "Zdroje hodnocení", en: "Sources for this rating" },
  methodologyBtn: { cs: "Metodika a vyloučení odpovědnosti", en: "Methodology & disclaimer" },
  close: { cs: "Zavřít", en: "Close" },
  disclaimerShort: {
    cs: "Hodnocení generuje AI, je orientační a neoficiální. Může obsahovat chyby.",
    en: "Ratings are AI-generated, indicative and unofficial. They may contain errors.",
  },
  newsTitle: { cs: "Hlavní zprávy týdne", en: "This week's headlines" },
  chartsTitle: { cs: "Grafy", en: "Charts" },
  chartAxisY: { cs: "Splněno (% bodů)", en: "Fulfilled (% of items)" },
  chartAxisX: { cs: "Kvartál volebního období", en: "Quarter of term" },
  chartCompare: { cs: "Srovnání s předchozími vládami", en: "Compare with previous cabinets" },
  chartNoData: { cs: "Zatím není dost týdenních snímků pro křivku. Graf se doplňuje každý pátek.", en: "Not enough weekly snapshots for a curve yet. The chart fills in every Friday." },
};

/* Six-point scale, ordered by how far a commitment has actually got.
   "rank" drives the ▲/▼ change arrows; "score" is kept only to mark which
   statuses count as rated at all (null = excluded from every percentage). */
const STATUS = {
  fulfilled:   { cs: "Splněno", en: "Fulfilled", color: "var(--ok)", score: 1, glyph: "✓", rank: 5 },
  partial:     { cs: "Částečně splněno", en: "Partially fulfilled", color: "var(--partial)", score: 1, glyph: "◕", rank: 4 },
  in_progress: { cs: "Probíhá", en: "In progress", color: "var(--prog)", score: 1, glyph: "◐", rank: 3 },
  declared:    { cs: "Jen deklarováno", en: "Declared only", color: "var(--declared)", score: 1, glyph: "◌", rank: 2 },
  not_started: { cs: "Nezahájeno", en: "Not started", color: "var(--muted)", score: 1, glyph: "○", rank: 1 },
  broken:      { cs: "Porušeno / opuštěno", en: "Broken / dropped", color: "var(--bad)", score: 1, glyph: "✕", rank: 0 },
  // Legacy value from the pre-2026-07 scale; kept so old snapshots still render.
  stalled:     { cs: "Porušeno / opuštěno", en: "Broken / dropped", color: "var(--bad)", score: 1, glyph: "✕", rank: 0 },
  pending:     { cs: "Nehodnoceno", en: "Unrated", color: "var(--pending)", score: null, glyph: "–", rank: 1 },
};

const METHOD = {
  title: { cs: "Metodika a vyloučení odpovědnosti", en: "Methodology & disclaimer" },
  sections: [
    /* Co Vládoměr je a kdo za ním stojí, patří na stránku O projektu — tady
       je jen tolik, aby metodika dávala smysl i tomu, kdo přišel rovnou sem
       z odkazu pod ukazatelem. */
    {
      h: { cs: "Zdroj dat", en: "Data source" },
      p: {
        cs: "Body vycházejí z programového prohlášení vlády (schváleno 5. 1. 2026). Znění je pro přehlednost zkráceno do sledovatelných položek; úplný text najdete na vlada.gov.cz.",
        en: "Items are based on the government's programme statement (approved 5 Jan 2026). The wording is condensed into trackable items for clarity; the full text is on vlada.gov.cz.",
      },
    },
    {
      h: { cs: "Jak hodnocení vzniká", en: "How ratings are produced" },
      p: {
        cs: "Každý pátek projde každý bod jazykovým modelem, který vyhledává aktuální zprávy a posuzuje důkazy z více úhlů – „ano, ale…“ a „ne, ale…“. Rozlišuje mezi pouhým ohlášením a skutečným zavedením, mezi částečným či formálním splněním a reálným dopadem, a zohledňuje kritiku opozice i odborníků. Bez doložitelného důkazu volí konzervativně stav „nezahájeno“. U každého bodu jsou uvedeny zdroje (odkazy z vyhledávání), o které se hodnocení opírá, abyste si je mohli sami ověřit.",
        en: "Every Friday each item is processed by a language model that searches current news and weighs evidence from multiple angles — \"yes, but…\" and \"no, but…\". It distinguishes mere announcements from actual implementation, partial or formal delivery from real impact, and takes opposition and expert criticism into account. Without verifiable evidence it conservatively defaults to \"not started\". Each item lists the sources (links from the search) the rating relied on, so you can verify them yourself.",
      },
    },
    {
      h: { cs: "Povolené zdroje", en: "Allowed sources" },
      /* Výčet konkrétních domén tu dřív byl taky — a rozcházel se se seznamem,
         který se opravdu používá. Teď je pravda na jednom místě: v souborech
         weby-*.txt, které sekce Použité prompty vypisuje celé. Tady zůstává
         jen pravidlo, podle kterého se do nich zdroje vybírají. */
      p: {
        cs: "Vyhledávání je technicky omezeno na uzavřený seznam zdrojů: oficiální weby státu (gov.cz — vláda, ministerstva a úřady), fact-checkingový Demagog.cz a zpravodajské weby hodnocené v ratingu NFNŽ MediaRating ve stupních A, A− a B+. Bulvární tituly zařazené nejsou. Weby, které technicky blokují přístup vyhledávání (např. iDNES.cz a Lidovky.cz), zahrnout nelze, i kdybychom chtěli. Odkazy z jiných webů se v hodnocení nemohou objevit.\n\nÚplný výpis obou seznamů — zvlášť pro hodnocení a zvlášť pro zprávy týdne — najdete v sekci Použité prompty.",
        en: "The search is technically restricted to a closed list of sources: official state websites (gov.cz — the government, ministries and agencies), the fact-checking outlet Demagog.cz, and news sites rated A, A− or B+ in the NFNŽ MediaRating. Tabloids are not included. Sites that technically block search access (e.g. iDNES.cz and Lidovky.cz) cannot be included even if we wanted to. Links from other sites cannot appear in the ratings.\n\nBoth lists — one for the assessments, one for the weekly headlines — are reproduced in full under Prompts used.",
      },
    },
    {
      h: { cs: "Stavy a výpočet plnění", en: "Statuses & how the percentage works" },
      list: {
        cs: [
          "Splněno – norma prošla celým legislativním procesem (Sněmovna, Senát, prezident) a byla vyhlášena ve Sbírce zákonů, případně je nelegislativní opatření prokazatelně zavedené a účinné.",
          "Částečně splněno – závazek naplněn jen zčásti: osekaná podoba, jen část slibu, výrazné zpoždění nebo změněné parametry.",
          "Probíhá – běží reálný legislativní proces, ale není dokončen.",
          "Jen deklarováno – vláda se vyjádřila, přijala usnesení či ustavila pracovní skupinu, ale nezahájila legislativní ani exekutivní krok.",
          "Nezahájeno – žádný doložitelný krok.",
          "Porušeno / opuštěno – vláda jednala v rozporu se slibem nebo od něj ustoupila.",
          "Neměřitelné – závazek je formulován tak obecně, že jej nelze objektivně změřit. Vyřazuje se z procent.",
          "Nehodnoceno – zatím neposouzeno (do procent se nepočítá).",
        ],
        en: [
          "Fulfilled – the law completed the entire legislative process (Chamber, Senate, President) and was published in the Collection of Laws, or a non-legislative measure is verifiably in force.",
          "Partially fulfilled – only part of the commitment was delivered: scaled back, partial coverage, major delay, or altered parameters.",
          "In progress – a real legislative process is under way but not finished.",
          "Declared only – the government stated a position, passed a resolution or set up a working group, but took no legislative or executive step.",
          "Not started – no verifiable step taken.",
          "Broken / dropped – the government acted against the commitment or abandoned it.",
          "Unmeasurable – worded too vaguely to assess objectively. Excluded from the percentages.",
          "Unrated – not yet assessed (excluded from the percentages).",
        ],
      },
      p: {
        cs: "Uvádíme samostatná čísla, ne jedno souhrnné skóre. „Splněno“ je podíl prokazatelně dotažených bodů – hodnotíme striktně stejně jako Demagog.cz i vládní odpočty, takže je číslo srovnatelné. „Částečně“ a „probíhá“ se uvádějí zvlášť a ke splnění se nepřičítají, protože rozdělaná práce není výsledek. Dřívější verze webu používala vážené skóre, kde „probíhá“ mělo poloviční kredit – od toho jsme ustoupili, protože takové číslo bylo z valné většiny tvořeno pouhou rozpracovaností a působilo výrazně příznivěji, než odpovídalo skutečnosti.\n\nStav „splněno“ navíc nelze udělit bez konkrétního dokladu: model musí uvést číslo a datum vyhlášení ve Sbírce zákonů, případně datum účinnosti opatření. Pokud doklad chybí, systém stav automaticky sníží na „částečně splněno“ – tvrzení o dokončení tak nikdy nestojí jen na slově modelu. Doklad je vidět u každého splněného bodu pod jeho hodnocením.\n\nStrojově kontrolujeme i datum: uznáváme pouze kroky učiněné od 15. 12. 2025, kdy vláda nastoupila. Zákon vyhlášený dříve je dílem předchozí vlády, i když tématicky odpovídá slibu, a hodnocení se automaticky sníží. Tuto kontrolu jsme doplnili poté, co si model v prvním běhu připsal ve prospěch vlády normy vyhlášené v srpnu 2025.",
        en: "We report separate figures rather than one combined score. \"Fulfilled\" is the share of verifiably delivered items — scored strictly, the same way Demagog.cz and government reviews score promises, so the number is comparable. \"Partial\" and \"in progress\" are reported separately and never added to delivery, because work started is not a result. An earlier version of this site used a weighted score giving \"in progress\" half credit — we dropped it, because such a figure was overwhelmingly made up of mere activity and read far more favourably than the facts warranted.\n\nThe \"fulfilled\" status additionally cannot be awarded without concrete proof: the model must cite the number and publication date in the Collection of Laws, or the date a measure took effect. If that proof is missing, the system automatically downgrades the status to \"partially fulfilled\" — so a claim of completion never rests on the model's word alone. The proof is shown under each fulfilled item's rating.\n\nThe date is checked automatically too: only steps taken since 15 Dec 2025, when the cabinet took office, are credited. A law published earlier is the previous government's work even if it matches the promise thematically, and the rating is downgraded automatically. We added this check after the model's first run credited this cabinet with laws published in August 2025.",
      },
    },
    {
      h: { cs: "Historie a změny", en: "History & changes" },
      p: {
        cs: "Každý týden se ukládá snímek stavů. U každého bodu vidíte, co se změnilo oproti minulému týdnu, a barevnou časovou osu vývoje za poslední týdny.",
        en: "A snapshot of all statuses is saved each week. For every item you can see what changed since last week and a coloured timeline of its development over recent weeks.",
      },
    },
    {
      h: { cs: "Auditní záznam", en: "Audit trail" },
      p: {
        cs: "Každé jednotlivé hodnocení se trvale ukládá do veřejného auditního souboru: číslo bodu, datum, stav k tomu datu, celý text hodnocení, použité zdroje a model, který ho vytvořil. Záznamy se nikdy nepřepisují, takže lze dohledat i hodnocení, které se později změnilo. Soubor je ke stažení jako audit.json v datech webu.",
        en: "Every individual rating is permanently recorded in a public audit file: item number, date, the status as of that date, the full rating text, the sources used, and the model that produced it. Records are never rewritten, so a rating that later changed can still be traced. The file is downloadable as audit.json in the site's data.",
      },
    },
    {
      h: { cs: "Omezení a vyloučení odpovědnosti", en: "Limitations & disclaimer" },
      p: {
        cs: "Hodnocení je orientační a generované umělou inteligencí – může obsahovat chyby, zastaralé informace nebo nesprávné posouzení, zejména u sporných témat. Neslouží jako oficiální, právní ani úplný zdroj. Informace si prosím ověřujte v primárních zdrojích. Stav i komentáře se při každém týdenním běhu přepisují.",
        en: "Ratings are indicative and AI-generated — they may contain errors, outdated information, or misjudgements, especially on contested topics. They are not an official, legal, or complete source. Please verify against primary sources. Statuses and comments are overwritten on each weekly run.",
      },
    },
  ],
};

/* Per-environment menu visibility. Set in the branch's committed .env file —
   dev has everything on, main only what's ready to ship. Flags must be written
   out statically: Vite substitutes import.meta.env.VITE_* at build time, so a
   computed key like import.meta.env[`VITE_MENU_${k}`] would silently be undefined.
   Default is OFF, so a missing .env hides unfinished pages rather than leaking them. */
const MENU_FLAGS = {
  about: import.meta.env.VITE_MENU_ABOUT === "true",
  faq: import.meta.env.VITE_MENU_FAQ === "true",
  prompts: import.meta.env.VITE_MENU_PROMPTS === "true",
  charts: import.meta.env.VITE_MENU_CHARTS === "true",
  support: import.meta.env.VITE_MENU_SUPPORT === "true",
  ideas: import.meta.env.VITE_MENU_IDEAS === "true",
};
/* Pořadí odpovídá tomu, jak se čtenář ptá: co to je → na co se lidi ptají →
   jak přesně to funguje → čísla v čase → podpora → zpětná vazba. */
const MENU_ORDER = ["about", "faq", "prompts", "charts", "support", "ideas"];

// Hamburger-menu pages. Support links are null until a payment channel is
// set up — the page then shows a "coming soon" note instead of dead buttons.
const SUPPORT_LINKS = {
  buymeacoffee: "https://www.buymeacoffee.com/buuczech",
  githubSponsors: null, // e.g. "https://github.com/sponsors/buuczech"
};
/* Oficiální tlačítko Buy Me a Coffee, ale servírované z našeho webu, ne
   z img.buymeacoffee.com. Načítání odtamtud by při otevření sekce poslalo
   IP adresu návštěvníka na cizí server bez jeho souhlasu — přesně to, čemu
   se web vyhýbá u Analytics, kde se kvůli tomu ptáme.
   Jejich SVG má font Bree Serif vložený jako base64, takže vypadá stejně
   jako originál a nedotahuje si nic. */
const BMC = {
  cs: { src: "./bmc-cs.svg", w: 280, alt: "Podpořte Vládoměr přes Buy Me a Coffee" },
  en: { src: "./bmc-en.svg", w: 262, alt: "Support Vládoměr via Buy Me a Coffee" },
};
const GITHUB_REPO_URL = "https://github.com/buuczech/vladomer";
const GITHUB_ISSUES_URL = "https://github.com/buuczech/vladomer/issues/new";

/* Popisky k promptům. Psané pro člověka, který o jazykových modelech neví nic:
   žádný žargon, žádné tokeny, žádná teplota. Samotné znění promptů a použitý
   model se načítají z prompty.json, který vzniká při buildu — tady je jen to,
   co je potřeba dovysvětlit. */
const PROMPT_POPIS = {
  hodnoceni: {
    nadpis: { cs: "Hodnocení jedné oblasti", en: "Assessing one area" },
    p: {
      cs: "Tenhle prompt se odešle osmnáctkrát za běh, pokaždé pro jednu oblast programu. Model dostane body té oblasti, u každého minulotýdenní stav a komentář, a smí si k nim vyhledat informace — ale jen na pevném seznamu webů níže. Odpoví jednotně strukturovaným výpisem, který program hned kontroluje: odkaz, který se ve výsledcích vyhledávání nikdy neobjevil, se zahazuje jako vymyšlený, a stav „splněno“ bez konkrétního dokladu (číslo ve Sbírce zákonů, datum účinnosti) se automaticky snižuje na „částečně splněno“.",
      en: "This prompt is sent eighteen times per run, once for each area of the programme. The model receives that area's commitments, each with last week's status and comment, and may look things up — but only across the fixed list of sites below. It answers in a uniform structured form that the program checks immediately: a link that never appeared in the search results is discarded as invented, and a \"fulfilled\" status without concrete evidence (a Collection of Laws number, a date of effect) is automatically downgraded to \"partially fulfilled\".",
    },
  },
  zpravy: {
    nadpis: { cs: "Zprávy týdne", en: "This week's headlines" },
    p: {
      cs: "Jednou za běh se model zeptá na nejdůležitější zprávy z domácí politiky. Vybírá jen z novinářských webů — vládní ani ověřovací servery v tomhle seznamu schválně nejsou, aby týden nevedla tisková zpráva úřadu. Z každé redakce se bere nejvýš jedna zpráva. Program pak vyřadí vymyšlené odkazy, rozcestníky místo článků a zprávy starší než dvanáct dní, a zbytek zkrátí na pět.",
      en: "Once per run the model is asked for the most important domestic-politics stories. It picks only from journalistic outlets — government and fact-checking sites are deliberately absent from this list, so the week is not led by an official press release. At most one story is taken per outlet. The program then drops invented links, section fronts instead of articles, and anything older than twelve days, and trims the rest to five.",
    },
  },
  korektura: {
    nadpis: { cs: "Jazyková korektura", en: "Language proofreading" },
    p: {
      cs: "Hotové texty nakonec projde druhý model — a schválně jiný a silnější než ten, který je psal, protože model své vlastní chyby nevidí. Smí opravovat jenom jazyk. Než se oprava přijme, program porovná původní a opravený text: když se změnilo číslo, citace zákona, odkaz nebo počet záporů, oprava se zahodí a zůstane původní znění. Zrovna ten zápor je to podstatné — přidané nebo ubrané „ne“ obrací tvrzení o vládě naruby a model nemá jak ověřit, které je správně.",
      en: "Finished texts are finally passed through a second model — deliberately a different, stronger one than wrote them, because a model cannot see its own mistakes. It may correct language only. Before a correction is accepted, the program compares the original and the revision: if a number, a law citation, a link or the count of negations changed, the correction is discarded and the original text stands. The negation check is the important one — an added or removed \"not\" reverses a claim about the government, and the model has no way to verify which reading is right.",
    },
  },
};
// Form route for people without a GitHub account — most visitors won't have one.
const SUGGESTION_FORM_URL = "https://forms.gle/G3nQ8hDWfViWJxrn8";

const PAGES = {
  about: {
    title: { cs: "O projektu", en: "About the project" },
    sections: [
      {
        h: { cs: "Co je Vládoměr", en: "What Vládoměr is" },
        p: {
          cs: "Vládoměr je nezávislý občanský projekt, který týden po týdnu sleduje, jak vláda plní vlastní programové prohlášení. Není nijak spojen s vládou ani s žádnou politickou stranou.\n\nVšech 143 bodů hodnotí jazykový model a u každého uvádí zdroje, ze kterých vycházel — smyslem není říct vám, co si máte myslet, ale dát vám dohledatelný odrazový můstek. Jak přesně hodnocení vzniká a co jednotlivé stavy znamenají, popisuje Metodika; doslovné instrukce pro model jsou v sekci Použité prompty.",
          en: "Vládoměr is an independent civic project that tracks, week by week, how the government is delivering on its own programme statement. It is not affiliated with the government or any political party.\n\nAll 143 items are assessed by a language model, each with the sources it drew on — the point is not to tell you what to think, but to give you a traceable starting point. How the ratings are produced and what each status means is set out in the Methodology; the literal instructions given to the model are under Prompts used.",
        },
      },
      {
        h: { cs: "Kdo za tím stojí", en: "Who is behind it" },
        p: {
          cs: "Projekt vytváří a provozuje jediný autor ve volném čase, s využitím AI nástrojů pro vývoj i hodnocení. Kompletní kód i data jsou otevřené na GitHubu (github.com/buuczech/vladomer) — kdokoli může zkontrolovat, jak hodnocení vzniká.",
          en: "The project is built and run by a single author in their spare time, using AI tools for both development and evaluation. The full code and data are open on GitHub (github.com/buuczech/vladomer) — anyone can inspect how the ratings are produced.",
        },
      },
      {
        h: { cs: "Deklarace nestrannosti", en: "Impartiality declaration" },
        list: {
          cs: [
            "Tvůrce není členem žádné politické strany ani hnutí.",
            "Projekt si nevyžádá a vědomě nepřijme finanční ani jinou podporu od politických stran, hnutí ani subjektů na ně napojených.",
            "Hodnocení generuje jazykový model podle veřejné metodiky; tvůrce do jednotlivých hodnocení ručně nezasahuje.",
            "Zdroje jsou technicky omezeny na transparentní seznam důvěryhodných webů (viz Metodika).",
            "Kritika i uznání vlády vyplývají výhradně z dat, nikoli z postojů tvůrce.",
          ],
          en: [
            "The author is not a member of any political party or movement.",
            "The project will not solicit, and will not knowingly accept, financial or other support from political parties, movements, or entities connected to them.",
            "Ratings are generated by a language model following a public methodology; the author does not manually alter individual ratings.",
            "Sources are technically restricted to a transparent list of trusted sites (see Methodology).",
            "Criticism and credit alike follow from the data, not from the author's views.",
          ],
        },
        /* Druhá odrážka byla dřív tvrzení „projekt nepřijímá podporu od stran“.
           To ale nikdo s otevřenou platební bránou nemůže zaručit — stačí, aby
           někdo poslal stovku pod jménem strany. Slíbit jde jen chování, ne
           výsledek, a přiznaný limit unese víc než absolutní věta, kterou lze
           vyvrátit jedním převodem. */
        p: {
          cs: "Příspěvky přicházejí přes veřejnou platební bránu, kde odesílatele nelze předem prověřit — nikdo tedy nemůže zaručit, kdo se o příspěvek pokusí. Příspěvek, u kterého vyjde najevo, že pochází od politické strany, hnutí nebo napojeného subjektu, se proto vrací; není-li vrácení technicky možné, bude zveřejněn a odeslán na charitu. Na obsah hodnocení to vliv mít nemůže: generuje ho jazykový model podle veřejné metodiky a autor do jednotlivých hodnocení ručně nezasahuje.",
          en: "Contributions arrive through a public payment page where the sender cannot be vetted in advance, so no one can guarantee who will attempt one. A contribution found to come from a political party, movement or connected entity is therefore refunded; where a refund is not technically possible it will be published and passed on to charity. None of it can affect the ratings themselves: they are produced by a language model following a public methodology, and the author does not manually alter individual assessments.",
        },
      },
    ],
  },
  support: {
    title: { cs: "Podpořte Vládoměr", en: "Support Vládoměr" },
    sections: [
      {
        h: { cs: "Proč podpora", en: "Why support" },
        p: {
          cs: "Vládoměr je zdarma, bez reklam a bez sledování. Provoz ale není nulový: každé týdenní AI hodnocení všech 143 bodů stojí peníze (tokeny jazykového modelu s vyhledáváním) a k tomu doména. Vše zatím platí autor z vlastní kapsy.",
          en: "Vládoměr is free, ad-free and tracker-free. Running it isn't free though: each weekly AI evaluation of all 143 items costs money (language-model tokens with web search), plus the domain. So far the author covers it all out of pocket.",
        },
      },
      {
        h: { cs: "Jak přispět", en: "How to contribute" },
        p: {
          cs: "Přispět můžete přes Buy Me a Coffee — jednorázově, bez registrace a v libovolné výši. Příspěvky jdou na týdenní hodnocení a provoz domény, nic víc. Podpora není podmínkou ničeho: web zůstane celý zdarma, bez reklam a bez placených částí.\n\nPříspěvky od politických stran, hnutí a napojených subjektů se vracejí — pravidlo i jeho meze najdete v Deklaraci nestrannosti v sekci O projektu.",
          en: "You can contribute through Buy Me a Coffee — one-off, no account needed, any amount. Contributions go towards the weekly assessment and the domain, nothing else. Supporting is not a condition of anything: the site stays entirely free, ad-free, with no paid sections.\n\nContributions from political parties, movements and connected entities are refunded — the rule and its limits are set out in the impartiality declaration under About.",
        },
      },
    ],
  },
  charts: {
    title: { cs: "Grafy", en: "Charts" },
    chart: true, // rendered by ChartsPage instead of plain sections
  },
  prompts: {
    title: { cs: "Použité prompty", en: "Prompts used" },
    prompts: true, // rendered by PromptsPage instead of plain sections
  },
  /* FAQ. Nadpis sekce = otázka, odstavec = odpověď — vystačí si se stávajícím
     vykreslováním sekcí, vlastní komponenta není potřeba.
     Záměrně jsou tu i nepříjemné otázky (zaujatost, rozpor s čísly vlády,
     důvěra v AI). FAQ, které se vyhýbá tomu, na co se lidé opravdu ptají,
     důvěryhodnosti spíš uškodí. Odpovědi neopakují metodiku, odkazují na ni. */
  faq: {
    title: { cs: "Často kladené dotazy", en: "FAQ" },
    sections: [
      {
        h: { cs: "Hodnotí to umělá inteligence. Proč bych tomu měl věřit?", en: "It’s rated by AI. Why should I trust it?" },
        p: {
          cs: "Nemusíte — a právě proto je web postavený tak, aby si šlo všechno ověřit. U každého bodu jsou odkazy na zdroje, ze kterých hodnocení vychází. Instrukce, které model dostane, jsou zveřejněné do posledního znaku v sekci Použité prompty. Každé hodnocení se navíc trvale ukládá do auditního souboru, který se nikdy nepřepisuje.\n\nModel taky nemá poslední slovo. Program jeho odpověď kontroluje: odkaz, který se ve vyhledávání neobjevil, vyhodí jako vymyšlený, a stav „splněno“ bez konkrétního dokladu automaticky sníží. Berte to jako rychlý první průchod, který ukáže, kam se podívat — ne jako rozsudek.",
          en: "You don’t have to — which is why the site is built so that everything can be checked. Every item lists the sources its rating draws on. The instructions the model receives are published to the last character under Prompts used. And every rating is permanently recorded in an audit file that is never rewritten.\n\nThe model also doesn’t get the last word. The program checks its answer: a link that never appeared in the search is discarded as invented, and a “fulfilled” status without concrete evidence is automatically downgraded. Treat it as a fast first pass that shows you where to look — not as a verdict.",
        },
      },
      {
        h: { cs: "Není to zaujaté proti vládě?", en: "Isn’t this biased against the government?" },
        p: {
          cs: "Autor není členem žádné strany a do jednotlivých hodnocení ručně nezasahuje — viz Deklarace nestrannosti v sekci O projektu. Model dostává u všech 143 bodů stejné instrukce a je v nich výslovně vedený k tomu, aby vážil argumenty z obou stran.\n\nUpřímně ale: úplná nestrannost se zaručit nedá. Jazykový model se učil z textů, které nestranné nejsou, a výběr povolených zpravodajských webů je taky rozhodnutí. Proto jsou zdroje u každého bodu vidět — když vám hodnocení přijde křivé, můžete si přečíst, z čeho vzniklo, a napsat nám.",
          en: "The author belongs to no party and does not manually alter individual ratings — see the impartiality declaration under About. The model receives identical instructions for all 143 items and is explicitly told to weigh arguments from both sides.\n\nHonestly, though: complete impartiality cannot be guaranteed. A language model learns from texts that are not impartial, and choosing which news sites it may read is itself a decision. That is why the sources are shown on every item — if a rating looks skewed to you, you can read what it was based on and tell us.",
        },
      },
      {
        h: { cs: "Premiér mluví o desítkách procent, vy o jednotkách. Kdo lže?", en: "The Prime Minister cites tens of percent, you cite single digits. Who is lying?" },
        p: {
          cs: "Nikdo — počítá se něco jiného. Vládní odpočty obvykle započítávají i to, co je rozpracované nebo schválené vládou a čeká na Sněmovnu. Vládoměr počítá jako splněné jen to, co prošlo celým legislativním procesem a vyšlo ve Sbírce zákonů.\n\nRozdělaná práce se tu neztrácí, jen se uvádí zvlášť jako „částečně splněno“ a „probíhá“. Součet těch tří čísel je k vládnímu údaji podstatně blíž. Přísné počítání jsme zvolili proto, aby šlo číslo srovnat s tím, jak plnění slibů měří Demagog.cz a jak se hodnotily předchozí vlády v grafu.",
          en: "Nobody — the two count different things. Government reviews usually include work in progress and bills approved by cabinet but still awaiting parliament. Vládoměr counts an item as delivered only once it has cleared the entire legislative process and been published in the Collection of Laws.\n\nWork in progress isn’t lost here, it is simply reported separately as “partially fulfilled” and “in progress”. Add those three figures together and you land much closer to the government’s number. We chose the strict count so the figure is comparable with how Demagog.cz scores promises and how previous cabinets are measured in the chart.",
        },
      },
      {
        h: { cs: "Proč je splněno tak málo?", en: "Why is so little fulfilled?" },
        p: {
          cs: "Ze dvou důvodů, a ani jeden není „vláda nic nedělá“. Za prvé kvůli tomu přísnému počítání výše. Za druhé kvůli času: legislativní proces trvá měsíce, takže na začátku volebního období je nízké číslo očekávatelné a samo o sobě nic neznamená. Zajímavý je až jeho vývoj v čase — od toho je graf.",
          en: "For two reasons, and neither is “the government is doing nothing”. First, the strict counting described above. Second, time: legislation takes months, so a low figure early in a term is expected and means little on its own. What matters is how it moves — that is what the chart is for.",
        },
      },
      {
        h: { cs: "Našel jsem chybné hodnocení. Co s tím?", en: "I found a wrong rating. What now?" },
        p: {
          cs: "Napište nám — formulář i GitHub najdete v sekci Návrhy na zlepšení. Nejvíc pomůže, když uvedete číslo bodu (třeba #2.4) a odkaz na zdroj, který hodnocení vyvrací.\n\nJednotlivá hodnocení se ručně nepřepisují: bylo by to přesně to zasahování, kterému se web brání. Když je chyba systematická, opraví se instrukce pro model nebo kontroly v programu a projeví se to při dalším týdenním běhu.",
          en: "Tell us — the form and GitHub are both under Suggest improvements. It helps most if you give the item number (say #2.4) and a link to a source that contradicts the rating.\n\nIndividual ratings are not edited by hand: that would be exactly the interference this site guards against. Where an error is systematic, the model’s instructions or the program’s checks get fixed and the change shows up in the next weekly run.",
        },
      },
      {
        h: { cs: "Jak často se to aktualizuje?", en: "How often is it updated?" },
        p: {
          cs: "Každý pátek v 9:00 UTC. Běh trvá zhruba půl hodiny a přepíše stavy i komentáře u všech bodů. Datum posledního hodnocení je vždy nahoře na stránce.",
          en: "Every Friday at 09:00 UTC. The run takes about half an hour and rewrites the statuses and comments for every item. The date of the latest assessment is always shown at the top of the page.",
        },
      },
      {
        h: { cs: "Proč tam chybí iDNES, Blesk nebo jiný web?", en: "Why is iDNES, Blesk or some other site missing?" },
        p: {
          cs: "Model smí hledat jen na uzavřeném seznamu webů — kompletní výpis obou seznamů je v sekci Použité prompty. Bulvár tam schválně není. iDNES.cz a Lidovky.cz chybí z jiného důvodu: technicky blokují přístup vyhledávání, takže je zařadit nejde, i kdybychom chtěli.",
          en: "The model may only search a closed list of sites — both lists are reproduced in full under Prompts used. Tabloids are deliberately absent. iDNES.cz and Lidovky.cz are missing for a different reason: they technically block search access, so they cannot be included even if we wanted to.",
        },
      },
      {
        h: { cs: "Jak poznám, že jste data zpětně nezměnili?", en: "How do I know you haven’t quietly changed the data?" },
        p: {
          cs: "Nijak nám nemusíte věřit. Celý web i všechna data jsou na GitHubu a každý týdenní běh je samostatný commit — jde se podívat, co přesně se kdy změnilo, a vrátit se k libovolnému staršímu stavu. K tomu existuje auditní soubor audit.json, do kterého se hodnocení přidávají a nikdy se nepřepisují.",
          en: "You don’t have to take our word for it. The whole site and all its data are on GitHub, and each weekly run is a separate commit — you can see exactly what changed and when, and go back to any earlier state. On top of that there is audit.json, an append-only file where ratings are added and never rewritten.",
        },
      },
      {
        h: { cs: "Můžu vaše data použít?", en: "Can I reuse your data?" },
        p: {
          cs: "Ano, i komerčně, stačí uvést zdroj — hodnocení a data jsou pod licencí CC BY 4.0, zdrojový kód pod MIT. Prosíme jen, abyste u čísla uváděli i datum: přepisuje se každý pátek, takže údaj bez data je za týden nepravdivý. Doporučený tvar citace je v souboru LICENSE-DATA na GitHubu.",
          en: "Yes, commercially too, as long as you credit the source — the assessments and data are under CC BY 4.0, the source code under MIT. We only ask that you quote the date alongside the figure: it is rewritten every Friday, so a number without one is wrong within the week. The suggested wording is in LICENSE-DATA on GitHub.",
        },
      },
      {
        h: { cs: "Kdo to platí a sledujete návštěvníky?", en: "Who pays for this, and do you track visitors?" },
        p: {
          cs: "Provoz platí autor ze svého; je to řádově pár tisíc korun ročně za tokeny modelu a doménu. Příspěvky od politických stran, hnutí a napojených subjektů se vracejí — podrobnosti jsou v Deklaraci nestrannosti.\n\nMěření návštěvnosti se spustí jedině tehdy, když k němu dáte souhlas v liště dole. Když ho odmítnete, neodesílá se nic a rozhodnutí jde kdykoli změnit odkazem v patičce.",
          en: "The author pays for it personally; it runs to a few thousand crowns a year for model tokens and the domain. Contributions from political parties, movements and connected entities are refunded — the details are in the impartiality declaration.\n\nAnalytics only start if you consent in the bar at the bottom. Decline and nothing is sent; you can change your mind at any time via the link in the footer.",
        },
      },
      {
        h: { cs: "Kdo vybral těch 143 bodů?", en: "Who chose the 143 items?" },
        p: {
          cs: "Vycházejí přímo z programového prohlášení vlády schváleného 5. 1. 2026. Znění je zkrácené do sledovatelných položek, protože původní dokument je psaný souvislým textem a mnoho odstavců obsahuje víc slibů najednou. Zkrácení dělal autor, ne model — a je to nejsubjektivnější část celého projektu. Úplné znění je na vlada.gov.cz a seznam bodů je otevřený na GitHubu, takže výběr jde zkontrolovat i rozporovat.",
          en: "They come straight from the programme statement approved on 5 Jan 2026. The wording is condensed into trackable items because the original is continuous prose and many paragraphs contain several promises at once. The condensing was done by the author, not the model — and it is the most subjective part of the whole project. The full text is at vlada.gov.cz and the list of items is open on GitHub, so the selection can be checked and challenged.",
        },
      },
      {
        h: { cs: "Co znamená „neměřitelné“?", en: "What does “unmeasurable” mean?" },
        p: {
          cs: "Některé závazky jsou formulované tak obecně, že se u nich nedá objektivně říct, jestli jsou splněné — třeba slib „podporovat“ něco. Takové body se z procent vyřazují, aby je neředily ani jedním směrem. Ve výpisu jsou označené a jejich počet je vidět pod hlavním ukazatelem.",
          en: "Some commitments are worded so broadly that there is no objective way to say whether they are met — a promise to “support” something, for instance. Those items are excluded from the percentages so they cannot dilute them either way. They are marked in the listing and their count is shown under the headline figure.",
        },
      },
    ],
  },
  ideas: {
    title: { cs: "Návrhy na zlepšení", en: "Suggest improvements" },
    sections: [
      {
        h: { cs: "Vaše zpětná vazba", en: "Your feedback" },
        p: {
          cs: "Narazili jste na chybné hodnocení, nefunkční odkaz, nebo máte nápad na novou funkci? Budeme rádi za každý podnět. U chybného hodnocení prosím uveďte číslo bodu (např. #2.4) a odkaz na zdroj, který hodnocení vyvrací.",
          en: "Found a wrong rating, a broken link, or have an idea for a new feature? Every suggestion helps. For a wrong rating, please include the item number (e.g. #2.4) and a link to a source that contradicts it.",
        },
      },
      {
        h: { cs: "Kde podnět podat", en: "Where to submit" },
        p: {
          cs: "Nejjednodušší je formulář — nevyžaduje žádný účet a zabere minutu. Máte-li účet na GitHubu, můžete podnět založit rovnou tam: zůstane veřejně dohledatelný včetně toho, jak jsme ho vyřešili.",
          en: "The form is the easiest route — no account needed and it takes a minute. If you have a GitHub account you can file the suggestion there instead: it stays publicly trackable, including how it was resolved.",
        },
      },
    ],
  },
};

function daysBetween(a, b) { return Math.floor((b - a) / 86400000); }
function fmtDate(d, lang) {
  return new Date(d).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function nextFriday(from) {
  const d = new Date(from); const day = d.getDay(); const add = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + add); d.setHours(9, 0, 0, 0); return d;
}
function trend(from, to) {
  const a = (STATUS[to]?.rank ?? 1) - (STATUS[from]?.rank ?? 1);
  return a > 0 ? { g: "▲", c: "var(--ok)" } : a < 0 ? { g: "▼", c: "var(--bad)" } : { g: "→", c: "var(--muted)" };
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^(www|m)\./, ""); } catch { return url; } }

const CSS = `
/* "Institutional Cyberpunk" palette — deep slate/charcoal foundation, indigo
   accent for chrome, emerald/amber/red reserved for status data, gradient
   fills on gauges. Light mode uses slightly deepened status colors so text
   on white keeps AA contrast; dark mode uses the spec values verbatim. */
:root{
  --bg:#F4F6F8; --surface:#ffffff; --surface-2:#EEF1F5; --text:#0F172A;
  --muted:#5B6577; --border:#E2E7EF; --shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.05);
  --accent:#3B5BDB; --ok:#059669; --partial:#4D7C0F; --prog:#B45309; --declared:#64748B; --bad:#DC2626; --pending:#94A0B2;
  --cz-blue:#11457e; --cz-red:#d7141a;
  --grad-a:#3B5BDB; --grad-b:#059669;
  --grad:linear-gradient(90deg,var(--grad-a),var(--grad-b));
}
[data-theme="dark"]{
  --bg:#0B0F19; --surface:#121824; --surface-2:#0E1523; --text:#E8EDF7;
  --muted:#8B96AB; --border:#232C3D; --shadow:0 1px 2px rgba(0,0,0,.45),0 12px 32px rgba(0,0,0,.4);
  --accent:#5B7BE8; --ok:#10B981; --partial:#84CC16; --prog:#F59E0B; --declared:#8B96AB; --bad:#EF4444; --pending:#5B6577;
  --cz-blue:#3f7fd6; --cz-red:#ff5a5f;
  --grad-a:#3B5BDB; --grad-b:#10B981;
}
*{box-sizing:border-box}
.vm-root{background:var(--bg);color:var(--text);min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif;font-feature-settings:"tnum" on,"lnum" on;line-height:1.5;transition:background .25s,color .25s}
.vm-mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Roboto Mono",monospace;font-variant-numeric:tabular-nums}
.vm-wrap{max-width:980px;margin:0 auto;padding:0 16px 64px}
.vm-tricolor{height:3px;width:100%;display:flex}
.vm-tricolor i{flex:1}
.vm-tricolor i:nth-child(1){background:#fff;border-bottom:1px solid var(--border)}
.vm-tricolor i:nth-child(2){background:var(--cz-blue)}
.vm-tricolor i:nth-child(3){background:var(--cz-red)}
.vm-top{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--border)}
.vm-topbar{max-width:980px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px}
.vm-brand{display:flex;flex-direction:column;min-width:0}
.vm-brand h1{font-size:19px;font-weight:760;letter-spacing:-.02em;margin:0;white-space:nowrap}
.vm-brand p{margin:0;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vm-spacer{flex:1}
.vm-seg{display:inline-flex;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:var(--surface-2)}
.vm-seg button{appearance:none;border:0;background:transparent;color:var(--muted);padding:6px 10px;font-size:12.5px;font-weight:620;cursor:pointer}
.vm-seg button.on{background:var(--accent);color:#fff}
.vm-icon{appearance:none;border:1px solid var(--border);background:var(--surface-2);color:var(--text);width:34px;height:32px;border-radius:9px;cursor:pointer;font-size:15px}
.vm-hero{margin:18px 0 10px}
.vm-govline{font-size:12.5px;color:var(--muted);margin:0 0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vm-dot{width:7px;height:7px;border-radius:50%;background:var(--ok)}
.vm-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.vm-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:var(--shadow)}
.vm-card .lab{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;margin-bottom:6px}
.vm-big{font-size:40px;font-weight:780;letter-spacing:-.03em;line-height:1}
.vm-sub{font-size:11.5px;color:var(--muted);margin-top:6px}
.vm-gauge-wrap{display:flex;align-items:center;gap:14px}
.vm-pct{font-size:30px;font-weight:780;letter-spacing:-.03em}
.vm-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 6px}
.vm-meta{font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}
.vm-meta b{color:var(--text);font-weight:650}
.vm-ghost{appearance:none;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:620;font-size:12.5px;padding:8px 11px;border-radius:10px;cursor:pointer}
.vm-search{flex:1;min-width:180px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:10px;padding:9px 12px;font-size:13.5px}
.vm-search::placeholder{color:var(--muted)}
.vm-filters{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px}
.vm-chip{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:12px;font-weight:620;padding:5px 10px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.vm-chip.on{color:var(--text);border-color:var(--text)}
.vm-chip .sw{width:8px;height:8px;border-radius:50%}
.vm-changes{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);margin-top:12px;overflow:hidden}
.vm-changes-head{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;user-select:none}
.vm-changes-head .ttl{font-weight:680;font-size:14px;flex:1}
.vm-changes-head .cnt{font-size:12px;font-weight:740;color:#fff;background:var(--accent);border-radius:999px;padding:1px 9px}
.vm-changes-body{border-top:1px solid var(--border)}
.vm-chg{display:flex;align-items:flex-start;gap:10px;padding:10px 16px;border-top:1px solid var(--border)}
.vm-chg:first-child{border-top:0}
.vm-chg-arrow{font-size:14px;font-weight:800;flex:none;width:16px;text-align:center;margin-top:1px}
.vm-chg-main{flex:1;min-width:0}
.vm-chg-text{font-size:13.2px}
.vm-chg-meta{font-size:11px;color:var(--muted);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.vm-chg-note{font-size:12.3px;color:var(--text);margin-top:5px;line-height:1.45}
.vm-arrowpill{display:inline-flex;align-items:center;gap:5px}
.vm-list{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.vm-ch{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.vm-ch-head{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;user-select:none}
.vm-ch-num{font-size:12px;font-weight:740;color:var(--muted);width:22px;flex:none;text-align:center}
.vm-ch-title{font-weight:680;font-size:15px;letter-spacing:-.01em;flex:1;min-width:0}
.vm-ch-prog{display:flex;align-items:center;gap:10px;flex:none}
.vm-ch-pct{font-size:12.5px;font-weight:720;width:38px;text-align:right}
.vm-mini{width:70px;height:6px;border-radius:6px;background:var(--border);overflow:hidden;display:flex}
.vm-mini > i{display:block;height:100%}
.vm-mini > i.done{background:var(--ok)}
.vm-mini > i.prog{background:var(--prog);opacity:.55}
.vm-dual{display:flex;gap:13px;flex-wrap:wrap}
.vm-dual > div{display:flex;flex-direction:column}
.vm-dual .n{font-size:22px;font-weight:780;letter-spacing:-.02em;line-height:1.1}
.vm-dual > div.sm .n{font-size:15px;font-weight:740}
.vm-dual .l{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;margin-top:2px}
.vm-pill-unver{color:var(--muted);border:1px dashed var(--muted)}
.vm-evi{display:block;font-size:12.3px;line-height:1.45;padding:5px 8px;background:var(--bg);border-radius:6px;border-left:2px solid var(--ok)}
.vm-mini > i.partial{background:var(--partial);opacity:.8}
.vm-caret{color:var(--muted);transition:transform .2s;flex:none}
.vm-caret.open{transform:rotate(90deg)}
.vm-ch-body{border-top:1px solid var(--border);padding:6px 0}
.vm-grp-title{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;padding:12px 16px 6px}
.vm-it{padding:9px 16px;border-top:1px solid var(--border)}
.vm-it:first-of-type{border-top:0}
.vm-it-row{display:flex;align-items:flex-start;gap:11px}
.vm-box{flex:none;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;margin-top:1px}
.vm-it-main{flex:1;min-width:0}
.vm-it-text{font-size:13.6px;line-height:1.45}
.vm-it-foot{display:flex;align-items:center;gap:10px;margin-top:5px;flex-wrap:wrap}
.vm-pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;display:inline-flex;align-items:center;gap:5px}
.vm-trend{font-size:12px;font-weight:800}
.vm-cmt-btn{appearance:none;border:0;background:transparent;color:var(--accent);font-size:11.5px;font-weight:650;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px}
.vm-cmt{margin-top:8px;font-size:12.7px;line-height:1.5;color:var(--text);background:var(--surface-2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:0 9px 9px 0;padding:9px 11px}
.vm-cmt .clab{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;margin:8px 0 3px}
.vm-cmt .when{display:block;margin-top:8px;font-size:10.5px;color:var(--muted)}
.vm-timeline{display:flex;gap:4px;align-items:center;margin-top:3px;flex-wrap:wrap}
.vm-tl-dot{width:10px;height:10px;border-radius:3px;display:inline-block}
.vm-src{display:flex;flex-direction:column;gap:3px;margin-top:3px}
.vm-src a{font-size:12px;color:var(--accent);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.vm-src a:hover{text-decoration:underline}
.vm-src .host{color:var(--muted);font-size:10.5px}
.vm-id{font-size:10.5px;color:var(--muted)}
.vm-foot{margin-top:26px;font-size:12px;color:var(--muted);line-height:1.6}
.vm-foot a{color:var(--accent)}
/* Consent bar. Fixed to the bottom so it is unmissable, but it must never
   cover the content permanently — both buttons dismiss it for good. */
.vm-cookie{position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--surface);
  border-top:1px solid var(--border);box-shadow:0 -12px 32px rgba(0,0,0,.25);
  padding:14px 16px calc(14px + env(safe-area-inset-bottom));
  display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:center}
.vm-cookie p{margin:0;font-size:12.6px;line-height:1.55;color:var(--text);max-width:760px;flex:1 1 320px}
.vm-cookie-btns{display:flex;gap:8px;flex:0 0 auto}
.vm-cookie-ok{appearance:none;border:1px solid var(--accent);background:var(--accent);color:#fff;
  font-weight:680;font-size:12.5px;padding:8px 14px;border-radius:10px;cursor:pointer}
.vm-link{appearance:none;border:0;background:transparent;color:var(--accent);font:inherit;font-weight:650;cursor:pointer;padding:0;text-decoration:underline}
.vm-methodrow{margin:12px 0 0;font-size:12px;color:var(--muted)}
.vm-menu-wrap{position:relative}
.vm-menu{position:absolute;right:0;top:38px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);min-width:220px;z-index:60;overflow:hidden;padding:4px}
.vm-menu button{display:block;width:100%;text-align:left;appearance:none;border:0;background:transparent;color:var(--text);font-size:13px;font-weight:620;padding:10px 12px;border-radius:8px;cursor:pointer}
.vm-menu button:hover{background:var(--surface-2)}
.vm-menu-overlay{position:fixed;inset:0;z-index:55}
.vm-btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:#fff;border:0;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:680;cursor:pointer;text-decoration:none}
.vm-btn:hover{filter:brightness(1.08)}
.vm-btn-ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.vm-btn-ghost:hover{background:var(--surface-2);filter:none}
.vm-empty{padding:30px;text-align:center;color:var(--muted);font-size:13px}
.vm-backdrop{position:fixed;inset:0;background:rgba(8,10,14,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;z-index:50;overflow-y:auto}
.vm-modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.35);max-width:680px;width:100%;margin:auto}
.vm-modal-head{position:sticky;top:0;background:var(--surface);display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border);border-radius:16px 16px 0 0}
.vm-modal-head h2{font-size:17px;font-weight:740;margin:0;flex:1}
.vm-modal-body{padding:6px 20px 22px}
.vm-modal-body h3{font-size:13px;font-weight:720;margin:18px 0 6px}
.vm-modal-body p{font-size:13.4px;line-height:1.6;color:var(--text);margin:0}
.vm-modal-body ul{margin:6px 0 0;padding-left:18px}
.vm-modal-body li{font-size:13.2px;line-height:1.55;margin:3px 0}
.vm-disc{font-size:11.5px;color:var(--muted);margin-top:6px}
.vm-modal.wide{max-width:860px}
.vm-pagelinks{margin:22px 0 0;padding-top:14px;border-top:1px solid var(--border);
  font-size:13px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
/* Prompty se zobrazují doslova, včetně zalomení a odsazení — proto <pre>.
   Dlouhý řádek se musí zalomit, ne roztáhnout okno; pre-wrap + break-word. */
.vm-prompt{border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin:16px 0 0;background:var(--surface-2)}
.vm-prompt h4{font-size:15px;font-weight:740;margin:0 0 4px}
.vm-prompt .meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted);margin:0 0 10px}
.vm-prompt .meta b{color:var(--text);font-family:ui-monospace,"DejaVu Sans Mono",monospace;font-weight:600}
.vm-prompt p{font-size:13.4px;line-height:1.6;margin:0 0 10px}
.vm-code{margin:0;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px;
  font:12.4px/1.55 ui-monospace,"DejaVu Sans Mono",monospace;color:var(--text);
  white-space:pre-wrap;overflow-wrap:break-word;max-height:420px;overflow-y:auto}
.vm-toggle{display:flex;align-items:center;gap:8px;margin:10px 0 0}
.vm-toggle .lab{font-size:12.5px;font-weight:700;color:var(--muted)}
.vm-domains{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0;list-style:none}
.vm-domains li{font:12px/1 ui-monospace,"DejaVu Sans Mono",monospace;color:var(--text);
  background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:5px 9px}
.vm-chart{width:100%;height:auto;display:block;margin:4px 0 2px;overflow:visible}
.vm-chart-tick{font-size:10px;fill:var(--muted);font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.vm-chart-axis{font-size:10.5px;fill:var(--muted);font-weight:600}
.vm-chart-legend{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px}
.vm-legend-item{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--surface-2);border-radius:999px;padding:5px 11px 5px 8px;font-size:12px;cursor:pointer;opacity:.55}
.vm-legend-item.on{opacity:1;border-color:var(--muted)}
.vm-legend-item input{margin:0;accent-color:var(--accent);width:13px;height:13px}
.vm-legend-item .sw{width:9px;height:9px;border-radius:50%;flex:none}
.vm-legend-item .nm{font-weight:640}
.vm-legend-item .pd{color:var(--muted);font-size:11px}
.vm-table-wrap{overflow-x:auto;margin-top:4px}
.vm-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:440px}
.vm-table th{text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding:7px 10px 7px 0;border-bottom:1px solid var(--border);white-space:nowrap}
.vm-table td{padding:8px 10px 8px 0;border-bottom:1px solid var(--border)}
.vm-table td .sw{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.vm-news{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);margin-top:12px;overflow:hidden}
.vm-news-body{border-top:1px solid var(--border)}
.vm-news-item{padding:11px 16px;border-top:1px solid var(--border);display:flex;gap:11px;align-items:flex-start}
.vm-news-item:first-child{border-top:0}
.vm-news-num{font-size:11px;font-weight:740;color:var(--muted);flex:none;width:14px;text-align:center;margin-top:2px}
.vm-news-main{flex:1;min-width:0}
.vm-news-main a{font-size:13.4px;font-weight:640;color:var(--text);text-decoration:none;line-height:1.4}
.vm-news-main a:hover{color:var(--accent);text-decoration:underline}
.vm-news-sum{font-size:12.2px;color:var(--muted);margin-top:4px;line-height:1.45}
.vm-news-host{font-size:10.5px;color:var(--accent);margin-top:4px;font-weight:620}
@media (max-width:680px){
  .vm-cards{grid-template-columns:1fr;gap:10px}.vm-big{font-size:34px}.vm-brand p{display:none}
  .vm-ch-title{font-size:14px}.vm-mini{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

/* Two-segment gauge: solid emerald for delivered, muted amber for work in
   progress. Flat fills here on purpose — colour carries meaning (it matches
   the status colours used throughout), so a decorative gradient would blur
   the distinction the gauge exists to make. */
function Ring({ done, partial, prog, broken, size = 64 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const seg = (pct) => (Math.max(0, Math.min(100, pct)) / 100) * c;
  const rot = `rotate(-90 ${size / 2} ${size / 2})`;
  const common = { cx: size / 2, cy: size / 2, r, fill: "none", strokeWidth: 7, transform: rot };
  const t = { transition: "stroke-dasharray .5s, stroke-dashoffset .5s" };
  /* Arcs stack in order of progress so the dial reads outward from delivered,
     and "broken" sits last, right before the empty grey. The dial therefore
     runs best → worst and the red cannot be mistaken for progress — which is
     why it can be shown at all: a longer arc must never read as a better
     result. */
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle {...common} stroke="var(--border)" />
      <circle {...common} stroke="var(--bad)" opacity="0.8" style={t}
        strokeDasharray={`${seg(broken)} ${c}`} strokeDashoffset={-seg(done + partial + prog)} />
      <circle {...common} stroke="var(--prog)" opacity="0.5" style={t}
        strokeDasharray={`${seg(prog)} ${c}`} strokeDashoffset={-seg(done + partial)} />
      <circle {...common} stroke="var(--partial)" opacity="0.75" style={t}
        strokeDasharray={`${seg(partial)} ${c}`} strokeDashoffset={-seg(done)} />
      <circle {...common} stroke="var(--ok)" strokeLinecap="round" style={t}
        strokeDasharray={`${seg(done)} ${c}`} />
    </svg>
  );
}

function Timeline({ id, snapshots, lang }) {
  const pts = snapshots.map((s) => ({ date: s.date, status: s.statuses?.[id] })).filter((p) => p.status).slice(-12);
  if (pts.length === 0) return null;
  return (
    <div className="vm-timeline">
      {pts.map((p, i) => (
        <span key={i} className="vm-tl-dot"
          title={`${p.date}: ${STATUS[p.status]?.[lang] || p.status}`}
          style={{ background: STATUS[p.status]?.color || "var(--pending)" }} />
      ))}
    </div>
  );
}

function MethodologyModal({ lang, onClose, onOpenPrompts }) {
  const t = (k) => T[k][lang];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="vm-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-head">
          <h2>{METHOD.title[lang]}</h2>
          <button className="vm-icon" onClick={onClose} aria-label={T.close[lang]}>✕</button>
        </div>
        <div className="vm-modal-body">
          {METHOD.sections.map((s, i) => (
            <div key={i}>
              <h3>{s.h[lang]}</h3>
              {s.list && <ul>{s.list[lang].map((li, j) => <li key={j}>{li}</li>)}</ul>}
              {s.p && s.p[lang].split("\n\n").map((para, k) => (
                <p key={k} style={{ marginTop: k === 0 ? (s.list ? 8 : 0) : 8 }}>{para}</p>
              ))}
            </div>
          ))}
          {/* Metodika popisuje pravidla, Použité prompty ukazují doslovné
              instrukce, podle kterých se ta pravidla vynucují. Odkaz se
              zobrazí jen tam, kde je ta sekce zapnutá. */}
          <p className="vm-pagelinks">
            {MENU_FLAGS.prompts && onOpenPrompts && (
              <><button className="vm-link" onClick={onOpenPrompts}>{t("seePrompts")}</button>{" · "}</>
            )}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">{t("openOnGithub")} ↗</a>
          </p>
          <p className="vm-disc">
            {T.source[lang]} ·{" "}
            <a href="https://vlada.gov.cz/cz/vlada/programove-prohlaseni/programove-prohlaseni-vlady-224629/" target="_blank" rel="noopener noreferrer">vlada.gov.cz</a>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Charts ────────────────────────────────────────────────────────────────
   Line chart comparing cumulative "fulfilled %" per quarter of the term.
   The current cabinet's curve is derived live from weekly snapshots using the
   STRICT metric (fulfilled / all items) so it is directly comparable with the
   external series — see src/governments.js for the full reasoning.          */
const CHART_METHOD = {
  cs: "Křivky předchozích vlád pocházejí z externí analýzy postavené na auditech Demagog.cz a datech gov.cz. Ty počítají pouze plně splněné sliby – stejně jako ukazatel „splněno“ na hlavní stránce, takže se srovnává totéž s tímtéž. Přesto srovnávejte s rezervou: vzorky se liší velikostí (156 / 50 / 50 slibů oproti našim 143 bodům), hodnocení předchozích vlád dělali lidští fact-checkeři retrospektivně po skončení mandátu, zatímco naše vzniká průběžně jazykovým modelem.",
  en: "The previous cabinets' curves come from an external analysis based on Demagog.cz promise audits and gov.cz records. Those count only fully-kept promises — the same definition as the \"fulfilled\" figure on the main page, so the chart compares like with like. Even so, compare with care: sample sizes differ (156 / 50 / 50 promises vs. our 143 items), the previous cabinets were assessed retrospectively by human fact-checkers after their term ended, while ours is measured live by a language model.",
};

function strictPctFromStatuses(statuses) {
  const ids = Object.keys(statuses || {});
  if (ids.length === 0) return null;
  let done = 0;
  for (const id of ids) if (statuses[id] === "fulfilled") done++;
  return (done / ids.length) * 100;
}

/** Live quarterly series for the current cabinet, from weekly snapshots.
 *  Latest snapshot within each quarter wins. */
function currentSeries(snapshots, evals, termStartMs) {
  const out = new Array(QUARTER_COUNT).fill(null);
  const byQ = {};
  for (const s of snapshots || []) {
    if (!s.date || !s.statuses) continue;
    const q = quarterOf(new Date(s.date).getTime(), termStartMs);
    if (q === null || q >= QUARTER_COUNT) continue;
    const pct = strictPctFromStatuses(s.statuses);
    if (pct === null) continue;
    if (!byQ[q] || s.date > byQ[q].date) byQ[q] = { date: s.date, pct };
  }
  for (const q in byQ) out[q] = byQ[q].pct;
  // Always include the live "now" value so the curve reaches the present.
  const nowQ = quarterOf(Date.now(), termStartMs);
  if (nowQ !== null && nowQ < QUARTER_COUNT) {
    const live = strictPctFromStatuses(
      Object.fromEntries(Object.entries(evals || {}).map(([k, v]) => [k, v.status])));
    if (live !== null) out[nowQ] = live;
  }
  return out;
}

function LineChart({ series, lang, width = 720, height = 400 }) {
  const padL = 46, padR = 14, padT = 14, padB = 58;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const yMax = 100;
  const x = (i) => padL + (i / (QUARTER_COUNT - 1)) * plotW;
  const y = (v) => padT + plotH - (v / yMax) * plotH;

  // Split each series into contiguous segments so null gaps break the line.
  const segmentsOf = (vals) => {
    const segs = []; let cur = [];
    vals.forEach((v, i) => {
      if (v === null || v === undefined) { if (cur.length) segs.push(cur); cur = []; }
      else cur.push([i, v]);
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="vm-chart" role="img"
      aria-label={T.chartsTitle[lang]}>
      {/* y grid every 10 % across the full 0–100 scale */}
      {Array.from({ length: 11 }, (_, k) => k * 10).map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)}
            stroke="var(--border)" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="vm-chart-tick">{v}%</text>
        </g>
      ))}
      {/* one gridline per quarter; the year boundary after Q4 is heavier */}
      {Array.from({ length: QUARTER_COUNT }, (_, i) => i).map((i) => (
        <line key={i} x1={x(i)} y1={padT} x2={x(i)} y2={padT + plotH}
          stroke="var(--border)" strokeWidth="1" />
      ))}
      {[3, 7, 11].map((i) => (
        <line key={`y${i}`} x1={x(i + 0.5)} y1={padT} x2={x(i + 0.5)} y2={padT + plotH}
          stroke="var(--muted)" strokeWidth="2" opacity="0.65" />
      ))}
      {/* x labels: Q1–Q4 repeating, with the term year called out underneath */}
      {Array.from({ length: QUARTER_COUNT }, (_, i) => i).map((i) => (
        <text key={i} x={x(i)} y={height - padB + 17} textAnchor="middle" className="vm-chart-tick">
          {`Q${(i % 4) + 1}`}
        </text>
      ))}
      {[0, 1, 2, 3].map((yr) => (
        <text key={yr} x={(x(yr * 4) + x(yr * 4 + 3)) / 2} y={height - padB + 34}
          textAnchor="middle" className="vm-chart-axis">
          {lang === "cs" ? `${yr + 1}. rok` : `Year ${yr + 1}`}
        </text>
      ))}
      <text x={padL + plotW / 2} y={height - 4} textAnchor="middle" className="vm-chart-axis">
        {T.chartAxisX[lang]}
      </text>
      {series.map((s) => (
        <g key={s.id}>
          {segmentsOf(s.values).map((seg, si) => (
            <polyline key={si} fill="none" stroke={s.color}
              strokeWidth={s.current ? 3 : 2}
              strokeLinecap="round" strokeLinejoin="round"
              points={seg.map(([i, v]) => `${x(i)},${y(v)}`).join(" ")} />
          ))}
          {s.values.map((v, i) => v === null || v === undefined ? null : (
            <circle key={i} cx={x(i)} cy={y(v)} r={s.current ? 4 : 3} fill={s.color}
              stroke="var(--surface)" strokeWidth="1.5">
              <title>{`${s.label} · ${quarterLabel(i, lang)} · ${v.toFixed(1)} %`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function ChartsPage({ lang, evals, snapshots }) {
  const [on, setOn] = useState({
    babis3: true, fiala: true, babis2: true, sobotka: true, babis1: false,
  });
  const termStart = new Date(DATES.tookOffice).getTime();
  const live = useMemo(() => currentSeries(snapshots, evals, termStart), [snapshots, evals, termStart]);
  const liveCount = live.filter((v) => v !== null).length;

  const series = [
    ...GOVERNMENTS.filter((g) => on[g.id]).map((g) => ({
      id: g.id, color: g.color, values: g.series, label: g.name[lang], current: false,
    })),
    ...(on.babis3 ? [{
      id: "babis3", color: CURRENT_GOV.color, values: live,
      label: CURRENT_GOV.name[lang], current: true,
    }] : []),
  ];
  const all = [...GOVERNMENTS, { ...CURRENT_GOV, promises: TOTAL_ITEMS, final: null }];

  return (
    <>
      <h3>{lang === "cs" ? "Plnění programu v čase" : "Delivery over time"}</h3>
      <p style={{ marginBottom: 10 }}>
        {lang === "cs"
          ? "Kumulativní podíl plně splněných bodů podle kvartálu volebního období. Silnější zelená křivka je současná vláda z živého hodnocení."
          : "Cumulative share of fully-fulfilled items by quarter of the term. The thicker green curve is the current cabinet, from live ratings."}
      </p>
      <LineChart series={series} lang={lang} />
      <div className="vm-chart-legend">
        {all.map((g) => (
          <label key={g.id} className={`vm-legend-item ${on[g.id] ? "on" : ""}`}>
            <input type="checkbox" checked={!!on[g.id]}
              onChange={() => setOn((o) => ({ ...o, [g.id]: !o[g.id] }))} />
            <span className="sw" style={{ background: g.color }} />
            <span className="nm">{g.name[lang]}</span>
            <span className="pd">{g.period}</span>
          </label>
        ))}
      </div>
      {liveCount < 2 && <p className="vm-disc" style={{ marginTop: 10 }}>{T.chartNoData[lang]}</p>}

      <h3>{lang === "cs" ? "Konečná bilance ukončených vlád" : "Final tally of completed cabinets"}</h3>
      <div className="vm-table-wrap">
        <table className="vm-table">
          <thead>
            <tr>
              <th>{lang === "cs" ? "Vláda" : "Cabinet"}</th>
              <th>{lang === "cs" ? "Slibů" : "Promises"}</th>
              <th>{lang === "cs" ? "Splněno" : "Fulfilled"}</th>
              <th>{lang === "cs" ? "Částečně" : "Partial"}</th>
              <th>{lang === "cs" ? "Nesplněno" : "Broken"}</th>
            </tr>
          </thead>
          <tbody>
            {GOVERNMENTS.filter((g) => g.final).map((g) => (
              <tr key={g.id}>
                <td><span className="sw" style={{ background: g.color }} /> {g.name[lang]}</td>
                <td className="vm-mono">{g.promises}</td>
                <td className="vm-mono" style={{ color: "var(--ok)" }}>{g.final.fulfilled} %</td>
                <td className="vm-mono" style={{ color: "var(--prog)" }}>{g.final.partial} %</td>
                <td className="vm-mono" style={{ color: "var(--bad)" }}>{g.final.broken} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{lang === "cs" ? "Jak je graf srovnatelný" : "How the comparison works"}</h3>
      <p>{CHART_METHOD[lang]}</p>
      <p className="vm-disc" style={{ marginTop: 8 }}>
        {lang === "cs"
          ? `Pro pořádek: tatáž externí analýza uvádí pro současnou vládu v Q1/2026 hodnotu ${CURRENT_EXTERNAL_Q1} %. Do grafu ji nemícháme — naše křivka vzniká vlastním měřením.`
          : `For the record: the same external analysis puts the current cabinet at ${CURRENT_EXTERNAL_Q1}% in Q1/2026. We don't mix it into the chart — our curve comes from our own measurement.`}
      </p>
    </>
  );
}

/* Použité prompty. prompty.json vzniká při buildu a nese doslovné znění šablon,
   model u každé a ukázku po doplnění dat. Načítá se až při otevření sekce —
   je to ~30 kB pro stránku, kterou většina návštěvníků nikdy neotevře, takže
   do loadData() na úvodní obrazovce nepatří. */
function PromptsPage({ lang }) {
  const t = (k) => T[k][lang];
  const [data, setData] = useState(null);
  const [stav, setStav] = useState("nacitam"); // nacitam | ok | chyba
  const [otevreno, setOtevreno] = useState({}); // id -> zobrazit ukázku

  useEffect(() => {
    let zruseno = false;
    fetch(`${import.meta.env.BASE_URL}prompty.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP"))))
      .then((j) => { if (!zruseno) { setData(j); setStav("ok"); } })
      .catch(() => { if (!zruseno) setStav("chyba"); });
    return () => { zruseno = true; };
  }, []);

  if (stav === "nacitam") return <p>{t("promptLoading")}</p>;
  if (stav === "chyba") return <p>{t("promptError")}</p>;

  return (
    <>
      <p>{t("promptsIntro")}</p>
      <p>{t("promptsSablona")}</p>

      {data.prompty.map((p) => {
        const popis = PROMPT_POPIS[p.id];
        const open = !!otevreno[p.id];
        return (
          <div className="vm-prompt" key={p.id}>
            <h4>{popis ? popis.nadpis[lang] : p.id}</h4>
            <div className="meta">
              <span>{t("promptModel")}: <b>{p.model}</b></span>
              <a href={`${GITHUB_REPO_URL}/blob/main/${p.soubor}`} target="_blank" rel="noopener noreferrer">
                {t("promptSoubor")} ↗
              </a>
            </div>
            {popis && <p>{popis.p[lang]}</p>}

            <div className="vm-toggle"><span className="lab">{t("promptSablona")}</span></div>
            <pre className="vm-code">{p.sablona}</pre>

            {p.ukazka && (
              <>
                <div className="vm-toggle">
                  <button className="vm-ghost" onClick={() => setOtevreno((o) => ({ ...o, [p.id]: !open }))}>
                    {open ? t("promptHide") : t("promptShow")} · {t("promptUkazka")}
                    {p.ukazkaPopis ? ` (${p.ukazkaPopis})` : ""}
                  </button>
                </div>
                {open && <pre className="vm-code" style={{ marginTop: 8 }}>{p.ukazka}</pre>}
              </>
            )}
          </div>
        );
      })}

      <div className="vm-prompt">
        <h4>{t("promptZdroje")}</h4>
        <p>{t("promptZdrojeP")}</p>
        {[["promptZdrojeH", data.zdroje.hodnoceni], ["promptZdrojeZ", data.zdroje.zpravy]].map(([k, list]) => (
          <div key={k} style={{ marginTop: 10 }}>
            <div className="vm-toggle"><span className="lab">{t(k)} ({list.length})</span></div>
            <ul className="vm-domains">{list.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
        ))}
      </div>
    </>
  );
}

function PageModal({ pageKey, lang, evals, snapshots, onClose }) {
  const t = (k) => T[k][lang];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const page = PAGES[pageKey];
  return (
    <div className="vm-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`vm-modal ${page.chart || page.prompts ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-head">
          <h2>{page.title[lang]}</h2>
          <button className="vm-icon" onClick={onClose} aria-label={T.close[lang]}>✕</button>
        </div>
        <div className="vm-modal-body">
          {page.chart && <ChartsPage lang={lang} evals={evals} snapshots={snapshots} />}
          {page.prompts && <PromptsPage lang={lang} />}
          {(page.sections || []).map((s, i) => (
            <div key={i}>
              <h3>{s.h[lang]}</h3>
              {s.list && <ul>{s.list[lang].map((li, j) => <li key={j}>{li}</li>)}</ul>}
              {s.p && s.p[lang].split("\n\n").map((para, k) => (
                <p key={k} style={{ marginTop: k === 0 ? (s.list ? 8 : 0) : 8 }}>{para}</p>
              ))}
            </div>
          ))}
          {pageKey === "support" && (SUPPORT_LINKS.buymeacoffee || SUPPORT_LINKS.githubSponsors) && (
            <p style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {SUPPORT_LINKS.buymeacoffee && (
                <a href={SUPPORT_LINKS.buymeacoffee} target="_blank" rel="noopener noreferrer">
                  <img src={BMC[lang].src} alt={BMC[lang].alt}
                       width={BMC[lang].w} height={50}
                       style={{ display: "block", maxWidth: "100%", height: "auto" }} />
                </a>
              )}
              {SUPPORT_LINKS.githubSponsors && (
                <a className="vm-btn" href={SUPPORT_LINKS.githubSponsors} target="_blank" rel="noopener noreferrer">
                  ♥ GitHub Sponsors
                </a>
              )}
            </p>
          )}
          {pageKey === "ideas" && (
            <p style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="vm-btn" href={SUGGESTION_FORM_URL} target="_blank" rel="noopener noreferrer">
                {lang === "cs" ? "Vyplnit formulář" : "Fill in the form"} ↗
              </a>
              <a className="vm-btn vm-btn-ghost" href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
                {lang === "cs" ? "Podat na GitHubu" : "File on GitHub"} ↗
              </a>
            </p>
          )}
          {/* Odkaz na repozitář na každé vysvětlující stránce, ne jen na jedné.
              Kdo si čte, jak web funguje, má mít zdroj na dosah odkudkoli. */}
          <p className="vm-pagelinks">
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">{t("openOnGithub")} ↗</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState("cs");
  const [dark, setDark] = useState(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches : false);
  const [evals, setEvals] = useState({});
  const [snapshots, setSnapshots] = useState([]);
  const [news, setNews] = useState([]);
  const [newsOpen, setNewsOpen] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [openCh, setOpenCh] = useState({ "1": true });
  const [openCmt, setOpenCmt] = useState({});
  const [changesOpen, setChangesOpen] = useState(true);
  const [showMethod, setShowMethod] = useState(false);
  // Bumped by the footer link; CookieBar re-opens on every change.
  const [cookieOpen, setCookieOpen] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(null); // "about" | "support" | "ideas"
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());

  const t = (k) => T[k][lang];

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  /* Volá se jen jednou při startu. Tlačítko „Obnovit“ tu bývalo, ale data se
     mění jednou týdně, takže kliknutí prakticky nikdy nic nezměnilo a jen
     budilo dojem, že je co obnovovat. */
  const loadData = useCallback(async () => {
    try {
      const [er, hr, nr] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}evaluations.json?t=${Date.now()}`),
        fetch(`${import.meta.env.BASE_URL}history.json?t=${Date.now()}`),
        fetch(`${import.meta.env.BASE_URL}news.json?t=${Date.now()}`).catch(() => null),
      ]);
      if (er.ok) { const j = await er.json(); setEvals(j.evals || {}); setLastUpdated(j.lastUpdated || null); }
      if (hr.ok) { const h = await hr.json(); setSnapshots(h.snapshots || []); }
      if (nr && nr.ok) { const n = await nr.json(); setNews(n.items || []); }
    } catch (e) { /* keep empty state */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const daysIn = daysBetween(new Date(DATES.tookOffice).getTime(), now);
  const electionMs = new Date(DATES.electionEstimate).getTime();
  const daysLeft = Math.max(0, daysBetween(now, electionMs));
  const termTotal = daysBetween(new Date(DATES.tookOffice).getTime(), electionMs);
  const termPct = Math.min(100, Math.max(0, (daysIn / termTotal) * 100));

  /* Strict scoring: an item counts as delivered only when it is actually
     fulfilled. "In progress" is reported separately rather than earning half
     credit — a weighted blend put 84% of the headline figure on work that
     merely started, which is neither defensible nor comparable with how
     Demagog.cz and government reviews score promises. */
  const { donePct, partialPct, progPct, brokenPct, evaluatedCount, unverifiableCount } = useMemo(() => {
    let done = 0, partial = 0, prog = 0, broken = 0, n = 0, unver = 0;
    for (const it of ALL_ITEMS) {
      const e = evals[it.id];
      if (!e || !STATUS[e.status] || STATUS[e.status].score === null) continue;
      // Commitments too vague to measure are excluded from the denominator
      // rather than scored — counting them either way would distort the result.
      if (e.unverifiable) { unver++; continue; }
      n++;
      if (e.status === "fulfilled") done++;
      else if (e.status === "partial") partial++;
      else if (e.status === "in_progress") prog++;
      // Porušené sliby se počítají zvlášť. Jsou to jediná čísla, která jdou
      // proti vládě, a vynechávat je z přehledu, kde jsou tři příznivější,
      // by bylo zkreslení výběrem.
      else if (e.status === "broken" || e.status === "stalled") broken++;
    }
    const p = (x) => (n ? (x / n) * 100 : 0);
    return {
      donePct: p(done), partialPct: p(partial), progPct: p(prog), brokenPct: p(broken),
      evaluatedCount: n, unverifiableCount: unver,
    };
  }, [evals]);
  const pct1 = (v) => (v >= 10 || v === 0 ? Math.round(v) : Math.round(v * 10) / 10);
  /* Before the first run there is nothing to divide by, and every percentage
     computes to 0. "0 % splněno" is a claim about the cabinet; "–" is the
     absence of one. Chapter rows already make that distinction — the headline
     gauge has to make it too, or the site states a falsehood until the first
     Friday. */
  const pctOrDash = (v) => (evaluatedCount ? `${pct1(v)}%` : "–");

  const changes = useMemo(() => {
    const map = {};
    for (const ch of CHAPTERS) for (const g of ch.groups) for (const it of g.items) map[it.id] = { it, ch };
    const out = [];
    for (const id in evals) {
      const e = evals[id];
      if (e && e.previousStatus && e.previousStatus !== e.status && map[id]) {
        out.push({ ...map[id], from: e.previousStatus, to: e.status, change: e.change });
      }
    }
    return out.sort((a, b) => (STATUS[b.to].rank - STATUS[b.from].rank) - (STATUS[a.to].rank - STATUS[a.from].rank));
  }, [evals]);

  const chapterStats = useCallback((ch) => {
    let done = 0, partial = 0, prog = 0, n = 0, tot = 0;
    for (const g of ch.groups) for (const it of g.items) {
      tot++; const e = evals[it.id];
      if (!e || !STATUS[e.status] || STATUS[e.status].score === null || e.unverifiable) continue;
      n++;
      if (e.status === "fulfilled") done++;
      else if (e.status === "partial") partial++;
      else if (e.status === "in_progress") prog++;
    }
    return {
      done: n ? (done / n) * 100 : 0,
      partial: n ? (partial / n) * 100 : 0,
      prog: n ? (prog / n) * 100 : 0,
      evaluated: n, total: tot,
    };
  }, [evals]);

  const statusOf = (id) => (evals[id] ? evals[id].status : "pending");

  const matches = useCallback((it) => {
    if (query) {
      const q = query.toLowerCase();
      if (!it.cs.toLowerCase().includes(q) && !it.en.toLowerCase().includes(q) && !it.id.includes(q)) return false;
    }
    if (filter !== "all" && statusOf(it.id) !== filter) return false;
    return true;
  }, [query, filter, evals]);

  const filtering = query !== "" || filter !== "all";
  function setAllOpen(open) { const o = {}; if (open) CHAPTERS.forEach((c) => (o[c.id] = true)); setOpenCh(o); }
  const next = nextFriday(lastUpdated ? new Date(lastUpdated) : new Date(now));
  const filterOpts = ["all", "fulfilled", "partial", "in_progress", "declared", "not_started", "broken", "pending"];

  return (
    <div className="vm-root" data-theme={dark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="vm-top">
        <div className="vm-tricolor"><i /><i /><i /></div>
        <div className="vm-topbar">
          <div className="vm-brand"><h1>{t("appTitle")}</h1><p>{t("appSubtitle")}</p></div>
          <div className="vm-spacer" />
          <div className="vm-seg" role="group" aria-label="language">
            <button className={lang === "cs" ? "on" : ""} onClick={() => setLang("cs")}>CS</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="vm-icon" onClick={() => setDark((d) => !d)} aria-label="theme">{dark ? "☀" : "☾"}</button>
          <div className="vm-menu-wrap">
            <button className="vm-icon" onClick={() => setMenuOpen((o) => !o)} aria-label="menu" aria-expanded={menuOpen}
              hidden={MENU_ORDER.every((k) => !MENU_FLAGS[k])}>☰</button>
            {menuOpen && (
              <>
                <div className="vm-menu-overlay" onClick={() => setMenuOpen(false)} />
                <div className="vm-menu" role="menu">
                  {MENU_ORDER.filter((k) => MENU_FLAGS[k]).map((k) => (
                    <button key={k} role="menuitem" onClick={() => { setPage(k); setMenuOpen(false); }}>
                      {PAGES[k].title[lang]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="vm-wrap">
        <div className="vm-hero">
          <p className="vm-govline">
            <span className="vm-dot" />
            {t("govLabel")} · {lang === "cs" ? "ve funkci od" : "in office since"} {fmtDate(DATES.tookOffice, lang)}
          </p>
          <div className="vm-cards">
            <div className="vm-card">
              <div className="lab">{t("daysInPower")}</div>
              <div className="vm-big vm-mono">{daysIn.toLocaleString(lang === "cs" ? "cs-CZ" : "en")}</div>
              <div className="vm-sub">{t("days")} · {Math.round(termPct)}% {lang === "cs" ? "volebního období" : "of the term"}</div>
            </div>
            <div className="vm-card">
              <div className="lab">{t("daysToElection")}</div>
              <div className="vm-big vm-mono">{daysLeft.toLocaleString(lang === "cs" ? "cs-CZ" : "en")}</div>
              <div className="vm-sub">{t("days")} · ~{fmtDate(DATES.electionEstimate, lang)}</div>
            </div>
            <div className="vm-card">
              <div className="lab">{t("overall")}</div>
              <div className="vm-gauge-wrap">
                <Ring done={donePct} partial={partialPct} prog={progPct} broken={brokenPct} />
                <div className="vm-dual">
                  <div>
                    <span className="n vm-mono" style={{ color: "var(--ok)" }}>{pctOrDash(donePct)}</span>
                    <span className="l">{t("statDone")}</span>
                  </div>
                  <div className="sm">
                    <span className="n vm-mono" style={{ color: "var(--partial)" }}>{pctOrDash(partialPct)}</span>
                    <span className="l">{t("statPartial")}</span>
                  </div>
                  <div className="sm">
                    <span className="n vm-mono" style={{ color: "var(--prog)" }}>{pctOrDash(progPct)}</span>
                    <span className="l">{t("statProg")}</span>
                  </div>
                  <div className="sm">
                    <span className="n vm-mono" style={{ color: "var(--bad)" }}>{pctOrDash(brokenPct)}</span>
                    <span className="l">{t("statBroken")}</span>
                  </div>
                </div>
              </div>
              <div className="vm-sub">
                {evaluatedCount
                  ? <>{evaluatedCount} {t("ofItems")} {TOTAL_ITEMS} {t("evaluated")}
                      {unverifiableCount > 0 && ` · ${unverifiableCount} ${t("statUnver")}`}</>
                  : t("notRatedYet")}
              </div>
            </div>
          </div>
          <p className="vm-methodrow">
            <button className="vm-link" onClick={() => setShowMethod(true)}>{t("methodologyBtn")}</button>
            {" · "}{t("disclaimerShort")}
          </p>
        </div>

        <div className="vm-controls">
          <div className="vm-meta">
            <span>{t("lastUpdated")}: <b>{lastUpdated ? fmtDate(lastUpdated, lang) : t("never")}</b></span>
            <span>{t("nextUpdate")}: <b>{fmtDate(next, lang)}</b></span>
            <span>{t("scope")}: <b>{CHAPTERS.length}</b> · {TOTAL_ITEMS} {t("items")}</span>
          </div>
        </div>

        {news.length > 0 && (
          <div className="vm-news">
            <div className="vm-changes-head" onClick={() => setNewsOpen((o) => !o)}>
              <span className="ttl">{t("newsTitle")}</span>
              <span className="cnt">{news.length}</span>
              <svg className={`vm-caret ${newsOpen ? "open" : ""}`} width="14" height="14" viewBox="0 0 14 14">
                <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            {newsOpen && (
              <div className="vm-news-body">
                {news.map((n, i) => (
                  <div className="vm-news-item" key={i}>
                    <span className="vm-news-num vm-mono">{i + 1}</span>
                    <div className="vm-news-main">
                      <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title[lang] || n.title.cs}</a>
                      {(n.summary?.[lang] || n.summary?.cs) && (
                        <div className="vm-news-sum">{n.summary[lang] || n.summary.cs}</div>
                      )}
                      <div className="vm-news-host">
                        {hostOf(n.url)}{n.date ? ` · ${fmtDate(n.date, lang)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {changes.length > 0 && (
          <div className="vm-changes">
            <div className="vm-changes-head" onClick={() => setChangesOpen((o) => !o)}>
              <span className="ttl">{t("changesTitle")}</span>
              <span className="cnt">{changes.length}</span>
              <svg className={`vm-caret ${changesOpen ? "open" : ""}`} width="14" height="14" viewBox="0 0 14 14">
                <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            {changesOpen && (
              <div className="vm-changes-body">
                {changes.map(({ it, ch, from, to, change }) => {
                  const tr = trend(from, to);
                  return (
                    <div className="vm-chg" key={it.id}>
                      <span className="vm-chg-arrow" style={{ color: tr.c }}>{tr.g}</span>
                      <div className="vm-chg-main">
                        <div className="vm-chg-text">{it[lang]}</div>
                        <div className="vm-chg-meta">
                          <span className="vm-mono">#{it.id}</span>
                          <span>{ch.title[lang]}</span>
                          <span className="vm-arrowpill">
                            <b style={{ color: STATUS[from].color }}>{STATUS[from][lang]}</b>
                            <span style={{ color: tr.c }}>→</span>
                            <b style={{ color: STATUS[to].color }}>{STATUS[to][lang]}</b>
                          </span>
                        </div>
                        {change && (change[lang] || change.cs) && (
                          <div className="vm-chg-note">{change[lang] || change.cs}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="vm-controls">
          <input className="vm-search" placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="vm-ghost" onClick={() => setAllOpen(true)}>{t("expandAll")}</button>
          <button className="vm-ghost" onClick={() => setAllOpen(false)}>{t("collapseAll")}</button>
        </div>
        <div className="vm-filters">
          {filterOpts.map((f) => (
            <button key={f} className={`vm-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f !== "all" && <span className="sw" style={{ background: STATUS[f].color }} />}
              {f === "all" ? t("filterAll") : STATUS[f][lang]}
            </button>
          ))}
        </div>

        <div className="vm-list">
          {CHAPTERS.map((ch) => {
            const st = chapterStats(ch);
            const open = !!openCh[ch.id] || filtering;
            const groups = ch.groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length > 0);
            if (filtering && groups.length === 0) return null;
            return (
              <div className="vm-ch" key={ch.id}>
                <div className="vm-ch-head" onClick={() => setOpenCh((o) => ({ ...o, [ch.id]: !o[ch.id] }))}>
                  <span className="vm-ch-num vm-mono">{ch.id}</span>
                  <span className="vm-ch-title">{ch.title[lang]}</span>
                  <span className="vm-ch-prog">
                    <span className="vm-mini" title={st.evaluated
                      ? `${t("statDone")} ${pct1(st.done)} % · ${t("statPartial")} ${pct1(st.partial)} % · ${t("statProg")} ${pct1(st.prog)} %` : ""}>
                      <i className="done" style={{ width: `${st.done}%` }} />
                      <i className="partial" style={{ width: `${st.partial}%` }} />
                      <i className="prog" style={{ width: `${st.prog}%` }} />
                    </span>
                    <span className="vm-ch-pct vm-mono" style={{ color: st.evaluated && st.done > 0 ? "var(--ok)" : undefined }}>
                      {st.evaluated ? `${pct1(st.done)}%` : "–"}
                    </span>
                  </span>
                  <svg className={`vm-caret ${open ? "open" : ""}`} width="14" height="14" viewBox="0 0 14 14">
                    <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                {open && (
                  <div className="vm-ch-body">
                    {groups.map((g, gi) => (
                      <div key={gi}>
                        <div className="vm-grp-title">{g.title[lang]}</div>
                        {g.items.map((it) => {
                          const status = statusOf(it.id);
                          const sObj = STATUS[status];
                          const e = evals[it.id];
                          const cmtOpen = !!openCmt[it.id];
                          const changed = e && e.previousStatus && e.previousStatus !== e.status;
                          const tr = changed ? trend(e.previousStatus, e.status) : null;
                          const hasSrc = e && Array.isArray(e.sources) && e.sources.length > 0;
                          const hasNote = e && ((e.comment && (e.comment[lang] || e.comment.cs)) || (e.change && (e.change[lang] || e.change.cs)) || hasSrc);
                          return (
                            <div className="vm-it" key={it.id}>
                              <div className="vm-it-row">
                                <span className="vm-box" style={{
                                  borderColor: sObj.color,
                                  color: status === "fulfilled" ? "#fff" : sObj.color,
                                  background: status === "fulfilled" ? sObj.color : "transparent",
                                }}>{status === "fulfilled" ? "✓" : sObj.glyph}</span>
                                <div className="vm-it-main">
                                  <div className="vm-it-text">{it[lang]}</div>
                                  <div className="vm-it-foot">
                                    <span className="vm-pill" style={{ color: sObj.color, border: `1px solid ${sObj.color}` }}>{sObj[lang]}</span>
                                    {e?.unverifiable && <span className="vm-pill vm-pill-unver">{t("unverBadge")}</span>}
                                    {tr && <span className="vm-trend" style={{ color: tr.c }} title={`${STATUS[e.previousStatus]?.[lang] || ""} → ${sObj[lang]}`}>{tr.g}</span>}
                                    <span className="vm-id vm-mono">#{it.id}</span>
                                    {hasNote && (
                                      <button className="vm-cmt-btn" onClick={() => setOpenCmt((o) => ({ ...o, [it.id]: !o[it.id] }))}>
                                        {cmtOpen ? (lang === "cs" ? "skrýt komentář" : "hide note") : (lang === "cs" ? "komentář hodnocení" : "show note")}
                                        <span>{cmtOpen ? "▴" : "▾"}</span>
                                      </button>
                                    )}
                                  </div>
                                  {cmtOpen && e && (
                                    <div className="vm-cmt">
                                      {e.comment && (e.comment[lang] || e.comment.cs) && <span>{e.comment[lang] || e.comment.cs}</span>}
                                      {e.evidence && (
                                        <>
                                          <span className="clab">{t("evidenceLabel")}</span>
                                          <span className="vm-evi">
                                            {e.evidence}
                                            {e.evidenceDate && <b className="vm-mono"> · {fmtDate(e.evidenceDate, lang)}</b>}
                                          </span>
                                        </>
                                      )}
                                      {e.change && (e.change[lang] || e.change.cs) && (
                                        <>
                                          <span className="clab">{t("changeLabel")}</span>
                                          {e.change[lang] || e.change.cs}
                                        </>
                                      )}
                                      {hasSrc && (
                                        <>
                                          <span className="clab">{t("sourcesLabel")}</span>
                                          <div className="vm-src">
                                            {e.sources.map((s, i) => (
                                              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>
                                                {s.title || s.url} <span className="host">· {hostOf(s.url)}</span>
                                              </a>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {snapshots.some((s) => s.statuses && s.statuses[it.id]) && (
                                        <>
                                          <span className="clab">{t("historyLabel")}</span>
                                          <Timeline id={it.id} snapshots={snapshots} lang={lang} />
                                        </>
                                      )}
                                      {e.updatedAt && <span className="when">{t("lastUpdated")}: {fmtDate(e.updatedAt, lang)}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filtering && CHAPTERS.every((ch) => ch.groups.every((g) => g.items.every((it) => !matches(it)))) && (
            <div className="vm-empty">{t("noResults")}</div>
          )}
        </div>

        <div className="vm-foot">
          <p>
            <button className="vm-link" onClick={() => setShowMethod(true)}>{t("methodologyBtn")}</button>
            {" · "}
            {/* Táž data bez JavaScriptu — pro tisk, čtečky a roboty, kteří
                aplikaci nespustí. Odkaz musí být vidět: stránka dostupná jen
                robotům by byla cloaking. */}
            <a href={lang === "cs" ? "./prehled/" : "./overview/"}>{t("textVersion")}</a>
            {" · "}<CookieSettingsLink lang={lang} onOpen={() => setCookieOpen((n) => n + 1)} />
          </p>
          <p>{t("disclaimerShort")}</p>
          <p>
            {t("source")} · <a href="https://vlada.gov.cz/cz/vlada/programove-prohlaseni/programove-prohlaseni-vlady-224629/" target="_blank" rel="noopener noreferrer">vlada.gov.cz</a>
            {" "}· {lang === "cs" ? "schváleno" : "approved"} {fmtDate(DATES.programmeApproved, lang)} · {lang === "cs" ? "důvěra" : "confidence vote"} {fmtDate(DATES.confidenceVote, lang)}
          </p>
          {/* Licence patří na web, ne jen do strukturovaných dat — tvrdit ji
              strojům a lidem ne by bylo nekonzistentní. */}
          <p>
            {t("licenceLine")}{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.cs" rel="license noopener noreferrer" target="_blank">CC BY 4.0</a>
          </p>
        </div>
      </div>

      {showMethod && (
        <MethodologyModal
          lang={lang}
          onClose={() => setShowMethod(false)}
          onOpenPrompts={() => { setShowMethod(false); setPage("prompts"); }}
        />
      )}
      {page && <PageModal pageKey={page} lang={lang} evals={evals} snapshots={snapshots} onClose={() => setPage(null)} />}
      <CookieBar lang={lang} openSignal={cookieOpen} />
    </div>
  );
}
