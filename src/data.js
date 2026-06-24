/* Shared data: imported by both the React app (src/App.jsx) and the
   server-side evaluation script (scripts/evaluate.mjs). Single source of truth. */

export const DATES = {
  tookOffice: "2025-12-15T00:00:00",
  programmeApproved: "2026-01-05",
  confidenceVote: "2026-01-15",
  electionEstimate: "2029-10-05T00:00:00", // estimated; CZ elections held early October
};

// Haiku is used for token efficiency. Swap to "claude-sonnet-4-6" for deeper analysis.
export const EVAL_MODEL = "claude-haiku-4-5-20251001";

export const STATUS_KEYS = ["fulfilled", "in_progress", "not_started", "stalled"];

export const CHAPTERS = [
  {
    id: "1",
    title: { cs: "Zásadní priority vlády", en: "Key government priorities" },
    groups: [
      {
        title: { cs: "Pět strategických směrů", en: "Five strategic directions" },
        items: [
          { id: "1.1", cs: "Levnější energie a energetická bezpečnost; odmítnutí ETS2", en: "Cheaper energy & energy security; reject ETS2" },
          { id: "1.2", cs: "Dostupné a bezplatné zdravotnictví, kratší čekací doby", en: "Affordable free healthcare, shorter waiting times" },
          { id: "1.3", cs: "Dostupné bydlení jako veřejný zájem", en: "Affordable housing as a public interest" },
          { id: "1.4", cs: "Spravedlivé důchody, strop věku 65 let", en: "Fair pensions, retirement age capped at 65" },
          { id: "1.5", cs: "Bezpečná země, nulová tolerance nelegální migrace", en: "Safe country, zero tolerance of illegal migration" },
        ],
      },
    ],
  },
  {
    id: "2",
    title: { cs: "Finance a hospodaření státu", en: "Public finances" },
    groups: [
      {
        title: { cs: "Zdravé veřejné finance", en: "Sound public finances" },
        items: [
          { id: "2.1", cs: "Udržet deficit bezpečně pod 3 % HDP", en: "Keep the deficit safely below 3% of GDP" },
          { id: "2.2", cs: "Postupně snižovat deficit k vyrovnanému rozpočtu", en: "Gradually cut the deficit toward a balanced budget" },
        ],
      },
      {
        title: { cs: "Výběr daní a šedá ekonomika", en: "Tax collection & grey economy" },
        items: [
          { id: "2.3", cs: "Zavést EET 2.0 od roku 2027", en: "Introduce EET 2.0 from 2027" },
          { id: "2.4", cs: "Spustit „Digitální daňovou kobru“ s využitím AI", en: "Launch the AI-powered 'Digital Tax Cobra'" },
          { id: "2.5", cs: "Rozšířit kompetence Celní správy; nástupní plat 50 tis. Kč", en: "Expand Customs powers; 50k CZK starting salary" },
        ],
      },
      {
        title: { cs: "Nižší daně", en: "Lower taxes" },
        items: [
          { id: "2.6", cs: "Nezvyšovat žádné daně", en: "Do not raise any taxes" },
          { id: "2.7", cs: "Snížit daň z příjmů firem na 19 %", en: "Cut corporate income tax to 19%" },
          { id: "2.8", cs: "Vrátit školkovné a slevu na druhého z manželů", en: "Restore pre-school tax relief & spouse credit" },
          { id: "2.9", cs: "Zavést 0% DPH na léky na předpis", en: "Introduce 0% VAT on prescription drugs" },
          { id: "2.10", cs: "Zastavit zvyšování vyměřovacího základu OSVČ", en: "Stop raising the self-employed contribution base" },
        ],
      },
      {
        title: { cs: "Administrativa a transparentnost", en: "Administration & transparency" },
        items: [
          { id: "2.11", cs: "Zřídit jednotné inkasní místo", en: "Create a single tax/insurance collection point" },
          { id: "2.12", cs: "Veřejný registr dotací neziskovým organizacím", en: "Public register of NGO subsidies" },
          { id: "2.13", cs: "Zkrátit lhůtu vrácení DPH z nezaplacených faktur na 3 měsíce", en: "Cut VAT refund on unpaid invoices to 3 months" },
        ],
      },
      {
        title: { cs: "Měnová suverenita", en: "Monetary sovereignty" },
        items: [
          { id: "2.14", cs: "Nepřijmout euro; ukotvit korunu a hotovost v Ústavě", en: "Reject the euro; anchor koruna & cash in the Constitution" },
          { id: "2.15", cs: "Nabídnout Dluhopisy Republiky drobným střadatelům", en: "Offer Republic Bonds to small savers" },
        ],
      },
    ],
  },
  {
    id: "3",
    title: { cs: "Vnitřní bezpečnost a veřejná správa", en: "Internal security & public administration" },
    groups: [
      {
        title: { cs: "Platy a podmínky bezpečnostních složek", en: "Pay & conditions of security forces" },
        items: [
          { id: "3.1", cs: "Nástupní plat policisty a hasiče 50 tis. Kč", en: "50k CZK starting pay for police & firefighters" },
          { id: "3.2", cs: "Příspěvek na bydlení až 6 000 Kč/měsíc dle regionu", en: "Housing allowance up to 6,000 CZK/month by region" },
        ],
      },
      {
        title: { cs: "Policie a veřejný pořádek", en: "Police & public order" },
        items: [
          { id: "3.3", cs: "Vrátit policii do ulic, zastavit rušení služeben", en: "Return police to the streets, stop closing stations" },
          { id: "3.4", cs: "Posílit pravomoci NÚKIB a ochranu kritické infrastruktury", en: "Strengthen NÚKIB & critical-infrastructure protection" },
        ],
      },
      {
        title: { cs: "Migrace a azyl", en: "Migration & asylum" },
        items: [
          { id: "3.5", cs: "Odmítnout migrační pakt EU", en: "Reject the EU migration pact" },
          { id: "3.6", cs: "Přijmout nový zákon o migraci a azylu", en: "Pass a new migration & asylum law" },
        ],
      },
      {
        title: { cs: "Záchranný systém a nábor", en: "Rescue system & recruitment" },
        items: [
          { id: "3.7", cs: "Síť jednotných náborových a výcvikových center", en: "Network of unified recruitment & training centres" },
          { id: "3.8", cs: "Modernizovat techniku policie a hasičů, podpořit JSDH", en: "Modernise police/fire equipment, support volunteer units" },
        ],
      },
    ],
  },
  {
    id: "4",
    title: { cs: "Obrana a Armáda ČR", en: "Defence & the Armed Forces" },
    groups: [
      {
        title: { cs: "Řízení a koncepce", en: "Management & doctrine" },
        items: [
          { id: "4.1", cs: "Audit hospodaření a akvizic ministerstva obrany", en: "Audit of MoD spending & acquisitions" },
          { id: "4.2", cs: "Nová Koncepce výstavby Armády ČR 2035", en: "New Armed Forces Build-up Concept 2035" },
          { id: "4.3", cs: "Odmítnout vznik „Armády EU“", en: "Reject creation of an 'EU Army'" },
        ],
      },
      {
        title: { cs: "Schopnosti a průmysl", en: "Capabilities & industry" },
        items: [
          { id: "4.4", cs: "Posílit protivzdušnou a protidronovou obranu", en: "Strengthen air & counter-drone defence" },
          { id: "4.5", cs: "Maximální zapojení českého obranného průmyslu do zakázek", en: "Maximise Czech defence-industry share of contracts" },
        ],
      },
      {
        title: { cs: "Personál", en: "Personnel" },
        items: [
          { id: "4.6", cs: "Nástupní plat vojáka 50 tis. Kč od roku 2026", en: "50k CZK starting soldier pay from 2026" },
          { id: "4.7", cs: "Navýšit počet vojáků z povolání a aktivních záloh", en: "Increase professional soldiers & active reserves" },
        ],
      },
    ],
  },
  {
    id: "5",
    title: { cs: "Zahraniční politika", en: "Foreign policy" },
    groups: [
      {
        title: { cs: "Směřování", en: "Orientation" },
        items: [
          { id: "5.1", cs: "Obnovit vztahy v rámci Visegrádské skupiny", en: "Revive Visegrád Group relations" },
          { id: "5.2", cs: "Posílit strategické vztahy s USA a Izraelem", en: "Strengthen ties with the US and Israel" },
          { id: "5.3", cs: "Podporovat diplomatické ukončení války na Ukrajině", en: "Support a diplomatic end to the war in Ukraine" },
        ],
      },
      {
        title: { cs: "EU a instituce", en: "EU & institutions" },
        items: [
          { id: "5.4", cs: "Nepřesouvat další pravomoci na EU, hájit jednomyslnost", en: "No further powers to the EU; defend unanimity" },
          { id: "5.5", cs: "Zrušit post ministra pro evropské záležitosti", en: "Abolish the minister for European affairs post" },
          { id: "5.6", cs: "Posílit ekonomickou diplomacii a diverzifikaci exportu", en: "Boost economic diplomacy & export diversification" },
        ],
      },
    ],
  },
  {
    id: "6",
    title: { cs: "Právo a spravedlnost", en: "Law & justice" },
    groups: [
      {
        title: { cs: "Trestní politika", en: "Criminal policy" },
        items: [
          { id: "6.1", cs: "Zpřísnit tresty za násilí na seniorech, ženách a dětech", en: "Tougher penalties for violence against the vulnerable" },
          { id: "6.2", cs: "Protidrogová novela trestního zákona", en: "Anti-drug amendment to the criminal code" },
          { id: "6.3", cs: "Plná trestní odpovědnost za vyhýbání se výživnému", en: "Full criminal liability for dodging child support" },
          { id: "6.4", cs: "Jasná pravidla nutné obrany", en: "Clear rules on legitimate self-defence" },
        ],
      },
      {
        title: { cs: "Justice a vězeňství", en: "Judiciary & prisons" },
        items: [
          { id: "6.5", cs: "Modernizovat trestní řád a občanský soudní řád", en: "Modernise criminal & civil procedure codes" },
          { id: "6.6", cs: "Nástupní plat vězeňské služby 50 tis. Kč", en: "50k CZK starting pay in the prison service" },
          { id: "6.7", cs: "Rozšířit elektronické náramky a alternativní tresty", en: "Expand electronic tags & alternative sentences" },
        ],
      },
      {
        title: { cs: "Práva a referendum", en: "Rights & referendum" },
        items: [
          { id: "6.8", cs: "Zrušit trestný čin neoprávněné činnosti pro cizí moc", en: "Repeal the 'unauthorised activity for foreign power' offence" },
          { id: "6.9", cs: "Zákon o celostátním referendu (mimo EU a NATO)", en: "National referendum law (excluding EU & NATO)" },
        ],
      },
    ],
  },
  {
    id: "7",
    title: { cs: "Hospodářství, průmysl a energetika", en: "Economy, industry & energy" },
    groups: [
      {
        title: { cs: "Ceny energií", en: "Energy prices" },
        items: [
          { id: "7.1", cs: "Stát převezme poplatek za POZE", en: "State takes over the renewables (POZE) levy" },
          { id: "7.2", cs: "Neimplementovat ETS2 do české legislativy", en: "Do not implement ETS2 into Czech law" },
        ],
      },
      {
        title: { cs: "Jaderná a stabilní energetika", en: "Nuclear & firm power" },
        items: [
          { id: "7.3", cs: "Získat 100% kontrolu nad výrobou ve skupině ČEZ", en: "Gain 100% control of ČEZ generation" },
          { id: "7.4", cs: "Zahájit stavbu bloků Dukovany 5 a 6; připravit Temelín 3 a 4", en: "Start Dukovany 5 & 6; prepare Temelín 3 & 4" },
          { id: "7.5", cs: "Připravit podmínky pro malé modulární reaktory (SMR)", en: "Prepare conditions for small modular reactors (SMR)" },
          { id: "7.6", cs: "Zavést kapacitní mechanismy, urychlit plynové zdroje", en: "Introduce capacity mechanisms, speed up gas plants" },
        ],
      },
      {
        title: { cs: "Podnikání a investice", en: "Business & investment" },
        items: [
          { id: "7.7", cs: "Přejít z dotační na odpisovou politiku podpory", en: "Shift from subsidies to depreciation-based support" },
          { id: "7.8", cs: "Zákon o podpoře startupů", en: "Start-up support act" },
          { id: "7.9", cs: "Zásadní reforma byrokratické zátěže podnikatelů", en: "Major reform of business red tape" },
          { id: "7.10", cs: "Předložit Hospodářskou strategii „Země pro budoucnost 2.0“", en: "Submit the 'Country for the Future 2.0' economic strategy" },
        ],
      },
    ],
  },
  {
    id: "8",
    title: { cs: "Doprava", en: "Transport" },
    groups: [
      {
        title: { cs: "Dálnice", en: "Motorways" },
        items: [
          { id: "8.1", cs: "Do 2029 dokončit D11 a propojit s Polskem", en: "Complete D11 & link to Poland by 2029" },
          { id: "8.2", cs: "Do 2027 dovést D3 přes jižní Čechy k Rakousku", en: "D3 across South Bohemia to Austria by 2027" },
          { id: "8.3", cs: "Do 2027 dokončit Pražský okruh na Černý Most", en: "Prague ring road to Černý Most by 2027" },
        ],
      },
      {
        title: { cs: "Železnice", en: "Railways" },
        items: [
          { id: "8.4", cs: "Zvýšit rychlost na koridorech na 200 km/h", en: "Raise corridor speeds to 200 km/h" },
          { id: "8.5", cs: "Do 2029 spojit Prahu, letiště a Kladno", en: "Link Prague, the airport & Kladno by 2029" },
          { id: "8.6", cs: "Do 2029 vybavit hlavní koridory systémem ETCS", en: "Fit main corridors with ETCS by 2029" },
        ],
      },
      {
        title: { cs: "Ceny a pravidla", en: "Prices & rules" },
        items: [
          { id: "8.7", cs: "Vrátit 75% slevy na jízdné pro studenty a seniory", en: "Restore 75% fare discounts for students & seniors" },
          { id: "8.8", cs: "Odmítnout zákaz spalovacích motorů od 2035", en: "Reject the 2035 combustion-engine ban" },
          { id: "8.9", cs: "Modernizovat Letiště Praha vč. kolejového napojení", en: "Modernise Prague Airport incl. rail link" },
        ],
      },
    ],
  },
  {
    id: "9",
    title: { cs: "Vzdělávání", en: "Education" },
    groups: [
      {
        title: { cs: "Financování a platy", en: "Funding & pay" },
        items: [
          { id: "9.1", cs: "Navýšit výdaje na vzdělávání k průměru OECD", en: "Raise education spending toward the OECD average" },
          { id: "9.2", cs: "Nástupní plat učitele 50 tis. Kč", en: "50k CZK starting teacher salary" },
          { id: "9.3", cs: "Průměrný plat učitelů 75 tis. Kč na konci období", en: "75k CZK average teacher pay by term's end" },
          { id: "9.4", cs: "Zavést kariérní řád pro učitele a ředitele", en: "Introduce a career system for teachers & heads" },
        ],
      },
      {
        title: { cs: "Obsah a struktura", en: "Content & structure" },
        items: [
          { id: "9.5", cs: "Revidovat inkluzi, posílit speciální školy", en: "Revise inclusion, strengthen special schools" },
          { id: "9.6", cs: "Změnit přijímačky na SŠ (výběr po výsledcích testů)", en: "Reform secondary-school admissions" },
          { id: "9.7", cs: "Rozšířit duální vzdělávání a učňovství", en: "Expand dual & vocational education" },
        ],
      },
      {
        title: { cs: "Vysoké školy", en: "Universities" },
        items: [
          { id: "9.8", cs: "Zákon o zajištění kvality veřejných VŠ", en: "Public-university quality-assurance act" },
          { id: "9.9", cs: "Navýšit kapacity Erasmus+ a podporu chudších studentů", en: "Expand Erasmus+ & support for poorer students" },
        ],
      },
    ],
  },
  {
    id: "10",
    title: { cs: "Sociální politika a zaměstnanost", en: "Social policy & employment" },
    groups: [
      {
        title: { cs: "Důchody", en: "Pensions" },
        items: [
          { id: "10.1", cs: "Zastropovat důchodový věk na 65 letech", en: "Cap the retirement age at 65" },
          { id: "10.2", cs: "Obnovit spravedlivý valorizační vzorec", en: "Restore a fair indexation formula" },
          { id: "10.3", cs: "Zavést věkové valorizace od 80 let", en: "Introduce age-based indexation from 80" },
        ],
      },
      {
        title: { cs: "Rodiny", en: "Families" },
        items: [
          { id: "10.4", cs: "Zvýšit rodičovský příspěvek na 400 000 Kč", en: "Raise the parental allowance to 400,000 CZK" },
          { id: "10.5", cs: "Obnovit přídavky na děti a školkovné", en: "Restore child benefits & pre-school relief" },
        ],
      },
      {
        title: { cs: "Dávky a služby", en: "Benefits & services" },
        items: [
          { id: "10.6", cs: "Zrevidovat „superdávku“, vyčlenit přídavky na děti", en: "Revise the 'super-benefit', carve out child benefits" },
          { id: "10.7", cs: "Nový zákon o sociálních službách a jejich financování", en: "New social-services act & funding model" },
          { id: "10.8", cs: "Hmotné zabezpečení neformálně pečujících osob", en: "Material support for informal carers" },
        ],
      },
      {
        title: { cs: "Trh práce", en: "Labour market" },
        items: [
          { id: "10.9", cs: "Zrušit povinné hlášení a prohlídky u DPP/brigád", en: "Scrap mandatory reporting & checks for casual work" },
          { id: "10.10", cs: "Zpřísnit kontrolu agentur práce", en: "Tighten oversight of staffing agencies" },
        ],
      },
    ],
  },
  {
    id: "11",
    title: { cs: "Zdravotnictví", en: "Healthcare" },
    groups: [
      {
        title: { cs: "Prevence a primární péče", en: "Prevention & primary care" },
        items: [
          { id: "11.1", cs: "Rozvoj sdružených praxí praktických lékařů", en: "Expand group GP practices" },
          { id: "11.2", cs: "Síť urgentních stomatologických pohotovostí", en: "Network of urgent dental clinics" },
          { id: "11.3", cs: "Bonusy za účast na preventivních prohlídkách", en: "Bonuses for attending preventive check-ups" },
        ],
      },
      {
        title: { cs: "Dostupnost a kvalita", en: "Access & quality" },
        items: [
          { id: "11.4", cs: "Národní monitoring kapacit a čekacích dob (e-žádanka)", en: "National capacity & waiting-time monitoring" },
          { id: "11.5", cs: "Implementovat Národní onkologický a kardiovaskulární plán", en: "Implement national oncology & cardiovascular plans" },
          { id: "11.6", cs: "Zahájit výstavbu nové fakultní nemocnice v Praze", en: "Start a new university hospital in Prague" },
          { id: "11.7", cs: "Zajistit dostupnost léků a rezervní zásoby", en: "Secure drug availability & reserve stocks" },
        ],
      },
      {
        title: { cs: "Systém a data", en: "System & data" },
        items: [
          { id: "11.8", cs: "Elektronizace zdravotnictví a sdílení dat", en: "Health digitalisation & data sharing" },
          { id: "11.9", cs: "Reforma veřejného zdravotního pojištění (konkurence pojišťoven)", en: "Reform public health insurance (insurer competition)" },
          { id: "11.10", cs: "Reforma péče o duševní zdraví", en: "Mental-health care reform" },
        ],
      },
    ],
  },
  {
    id: "12",
    title: { cs: "Zemědělství", en: "Agriculture" },
    groups: [
      {
        title: { cs: "Soběstačnost a trh", en: "Self-sufficiency & market" },
        items: [
          { id: "12.1", cs: "Zvýšit potravinovou soběstačnost ČR", en: "Increase Czech food self-sufficiency" },
          { id: "12.2", cs: "Potravinový ombudsman a dosledovatelnost původu", en: "Food ombudsman & origin traceability" },
          { id: "12.3", cs: "Bránit trh před levnými nekvalitními dovozy", en: "Defend the market from cheap low-quality imports" },
        ],
      },
      {
        title: { cs: "Půda, dotace, zvířata", en: "Land, subsidies, animals" },
        items: [
          { id: "12.4", cs: "Zákon o předkupním právu na půdu pro aktivní zemědělce", en: "Pre-emption right on farmland for active farmers" },
          { id: "12.5", cs: "Přesměrovat dotace na aktivní produkci", en: "Redirect subsidies to active production" },
          { id: "12.6", cs: "Zrušit současné vymezení erozních oblastí", en: "Scrap the current erosion-zone designation" },
          { id: "12.7", cs: "Zvýšit tresty za týrání zvířat a množírny", en: "Raise penalties for animal cruelty & puppy mills" },
        ],
      },
    ],
  },
  {
    id: "13",
    title: { cs: "Životní prostředí", en: "Environment" },
    groups: [
      {
        title: { cs: "Klima a energetika", en: "Climate & energy" },
        items: [
          { id: "13.1", cs: "Prosazovat zásadní revizi Green Dealu", en: "Push for a major revision of the Green Deal" },
          { id: "13.2", cs: "Odmítnout zákaz aut se spalovacím motorem od 2035", en: "Reject the 2035 combustion-car ban" },
          { id: "13.3", cs: "Nezavádět povinnou fotovoltaiku ani zákazy plynových kotlů", en: "No mandatory solar or gas-boiler bans" },
        ],
      },
      {
        title: { cs: "Voda a krajina", en: "Water & landscape" },
        items: [
          { id: "13.4", cs: "Urychlit nádrže Nové Heřminovy, Vlachovice, Skalička", en: "Speed up Nové Heřminovy, Vlachovice, Skalička reservoirs" },
          { id: "13.5", cs: "Zrychlit výstavbu kanalizací a ČOV v obcích", en: "Accelerate sewers & treatment plants in municipalities" },
          { id: "13.6", cs: "Zrevidovat erozní vyhlášku", en: "Revise the soil-erosion decree" },
        ],
      },
      {
        title: { cs: "Odpady", en: "Waste" },
        items: [
          { id: "13.7", cs: "Zálohování PET jen při prokázaném přínosu", en: "Deposit return only if benefit is proven" },
          { id: "13.8", cs: "Podpořit zařízení na energetické využití odpadu (ZEVO)", en: "Support waste-to-energy facilities" },
        ],
      },
    ],
  },
  {
    id: "14",
    title: { cs: "Kultura", en: "Culture" },
    groups: [
      {
        title: { cs: "Lidé a památky", en: "People & heritage" },
        items: [
          { id: "14.1", cs: "Výrazně zvýšit platy pracovníků v kultuře", en: "Significantly raise cultural-sector pay" },
          { id: "14.2", cs: "Víceletý finanční plán na obnovu památek", en: "Multi-year funding plan for heritage" },
          { id: "14.3", cs: "Dokončit Novou scénu ND a Janáčkovo centrum; Vltavská filharmonie", en: "Finish key cultural venues (ND, Janáček centre, etc.)" },
        ],
      },
      {
        title: { cs: "Média a dostupnost", en: "Media & access" },
        items: [
          { id: "14.4", cs: "Zrušit poplatky za veřejnoprávní média", en: "Abolish public-media licence fees" },
          { id: "14.5", cs: "Kontrola hospodaření ČT a ČRo přes NKÚ", en: "Audit ČT & ČRo finances via the SAO" },
          { id: "14.6", cs: "Vstup do státních muzeí a galerií zdarma pro vybrané skupiny", en: "Free state museum/gallery entry for selected groups" },
        ],
      },
    ],
  },
  {
    id: "15",
    title: { cs: "Bydlení a regionální rozvoj", en: "Housing & regional development" },
    groups: [
      {
        title: { cs: "Stavební právo a bydlení", en: "Building law & housing" },
        items: [
          { id: "15.1", cs: "Nový stavební zákon, bydlení jako veřejný zájem", en: "New building act; housing as a public interest" },
          { id: "15.2", cs: "Digitalizace stavebního řízení", en: "Digitalise building permits" },
          { id: "15.3", cs: "Státní podpora hypoték pro mladé rodiny a klíčové profese", en: "Mortgage support for young families & key workers" },
          { id: "15.4", cs: "Podpořit družstevní a nájemní bydlení (garance, pobídky)", en: "Support cooperative & rental housing" },
          { id: "15.5", cs: "Podpořit výstavbu studentských kolejí", en: "Support student-dormitory construction" },
        ],
      },
      {
        title: { cs: "Regiony a EU fondy", en: "Regions & EU funds" },
        items: [
          { id: "15.6", cs: "Připravit čerpání fondů pro období 2028+", en: "Prepare fund drawdown for 2028+" },
          { id: "15.7", cs: "Zákon na transformaci uhelných regionů", en: "Coal-region transformation act" },
        ],
      },
    ],
  },
  {
    id: "16",
    title: { cs: "Sport, prevence a zdraví", en: "Sport, prevention & health" },
    groups: [
      {
        title: { cs: "Pohyb a infrastruktura", en: "Activity & infrastructure" },
        items: [
          { id: "16.1", cs: "Síť nízkoprahových hřišť a veřejných sportovišť", en: "Network of low-barrier public sports grounds" },
          { id: "16.2", cs: "Navýšit investice do obnovy sportovní infrastruktury", en: "Increase investment in sports facilities" },
          { id: "16.3", cs: "Programy „Trenéři do škol/školek“", en: "'Coaches into schools' programmes" },
        ],
      },
      {
        title: { cs: "Legislativa a financování", en: "Legislation & funding" },
        items: [
          { id: "16.4", cs: "Národní strategie sportu 2026–2030", en: "National sport strategy 2026–2030" },
          { id: "16.5", cs: "Nový komplexní zákon o sportu", en: "New comprehensive sport act" },
          { id: "16.6", cs: "Revize Národní sportovní agentury", en: "Review of the National Sports Agency" },
        ],
      },
    ],
  },
  {
    id: "17",
    title: { cs: "Věda, výzkum a inovace", en: "Science, research & innovation" },
    groups: [
      {
        title: { cs: "Financování a kvalita", en: "Funding & quality" },
        items: [
          { id: "17.1", cs: "Významně navýšit výdaje na vědu a výzkum", en: "Significantly raise R&D spending" },
          { id: "17.2", cs: "Revize systému hodnocení výzkumu M2017+", en: "Revise the M2017+ research-evaluation system" },
          { id: "17.3", cs: "Zatraktivnit daňové odpočty na výzkum a vývoj", en: "Make R&D tax deductions more attractive" },
        ],
      },
      {
        title: { cs: "Řízení a talenty", en: "Governance & talent" },
        items: [
          { id: "17.4", cs: "Zrušit funkci ministra pro vědu, posílit Radu vlády", en: "Abolish science-minister post; strengthen the council" },
          { id: "17.5", cs: "Usnadnit příchod zahraničních vědců a doktorandů", en: "Ease arrival of foreign researchers & PhD students" },
        ],
      },
    ],
  },
  {
    id: "18",
    title: { cs: "Digitalizace", en: "Digitalisation" },
    groups: [
      {
        title: { cs: "Debyrokratizace", en: "Cutting red tape" },
        items: [
          { id: "18.1", cs: "Princip „jednou a dost“", en: "'Once and done' principle" },
          { id: "18.2", cs: "Dokončit implementaci práva na digitální služby", en: "Complete the right to digital services" },
        ],
      },
      {
        title: { cs: "Brána, data a AI", en: "Gateway, data & AI" },
        items: [
          { id: "18.3", cs: "Jednotná digitální brána (web i mobil, sdílené přihlášení)", en: "Single digital gateway (web & mobile, shared login)" },
          { id: "18.4", cs: "Propojený datový ekosystém s otevřenými rozhraními", en: "Connected data ecosystem with open APIs" },
          { id: "18.5", cs: "Bezpečné a etické využití AI ve státní správě", en: "Safe, ethical AI use in public administration" },
          { id: "18.6", cs: "Audit státních IT, boj proti vendor lock-inu", en: "Audit state IT; fight vendor lock-in" },
        ],
      },
    ],
  },
];

export const ALL_ITEMS = CHAPTERS.flatMap((c) => c.groups.flatMap((g) => g.items));
export const TOTAL_ITEMS = ALL_ITEMS.length;
