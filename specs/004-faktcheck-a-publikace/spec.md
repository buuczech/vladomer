# Feature Specification: Kontrola faktů celého webu a publikační brána

**Feature Branch**: `DEV2`
**Created**: 2026-10-20
**Status**: Vrstva D hotová; M a R čekají na výběr modelu (spec 002)
**Input**: Schválený plán, fáze 4. Cíl vlastníka: na webu nesmí vyjít tvrzení, na kterém stojí stav, aniž by bylo ověřené. Běh se zveřejní vždy; sporné body zůstanou na posledním ověřeném stavu a rozhoduje o nich člověk. Úplnost má přednost před cenou (všech 143 bodů každý měsíc); rozpočet do 50 $ měsíčně.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Program chytí, co ví přesně (vrstva D, Priority: P1)

Po každém běhu program zdarma zkontroluje všechno, co se dá ověřit bez modelu:
- čísla a data vyhlášení předpisů proti e-Sbírce (tytéž funkce, podle kterých pipeline zapisuje);
- data dokladů;
- shodu české a anglické verze;
- živost a obsah zdrojových odkazů;
- komentář, který tvrdí jiný stav než status;
- konzistenci dat se sebou a s pěti místy metriky (`test-konzistence`).

**Why this priority**: Je to zdarma a jednoznačné. Při prvním ostrém běhu (20. 10. 2026) našla dvě skutečné chyby na webu, které revize zlaté sady nenašla: 1.2 a 15.4 vydávají zákon předchozí vlády za vyhlášený 31. 12. 2025.

**Independent Test**: `node scripts/faktcheck.js` nad daty k 20. 10. 2026 najde 1.2 a 15.4 jako CHYBA. `node scripts/dev/test-faktcheck.js` projde na skutečných dokladech včetně smyšlených 270/2026 a 233/2026.

**Acceptance Scenarios**:

1. **Given** doklad s číslem předpisu, které ve Sbírce není, **When** proběhne vrstva D, **Then** je to CHYBA, která nese stav.
2. **Given** doklad s jiným datem vyhlášení, než má e-Sbírka, **When** proběhne vrstva D, **Then** je to CHYBA.
3. **Given** „devět procent“ česky a „9 %“ anglicky, **When** proběhne vrstva D, **Then** je to jen VAROVÁNÍ, ne chyba.
4. **Given** e-Sbírka nedostupná, **When** proběhne vrstva D, **Then** se předpisy nesoudí a výstup to řekne.

### User Story 2 – Nezávislý model ověří každé tvrzení se citací (vrstva M, Priority: P1)

Opus 5.5 (silnější a jiný než hodnotitel) rozloží text každého bodu na tvrzení a ke každému dá verdikt POTVRZENO / VYVRÁCENO / NEOVĚŘITELNÉ / ZASTARALÉ s doslovnou citací zdroje.
- **1. kolo** jde přes Batch API nad texty zdrojů, které stáhla vrstva D, bez vyhledávání.
- **2. kolo** s vyhledáváním dostanou jen tvrzení, která 1. kolo nepotvrdilo.
- **Program ověří**, že citace ve zdroji doslova je. Jinak verdikt zahodí.

**Independent Test**: Nad daty k 20. 10. 2026 označí všech 6 bodů, kde se web liší od zlaté sady (5.4, 6.6, 7.2, 2.7, 10.2, 12.2).

### User Story 3 – Ověřené ven, sporné podržet (vrstva R, Priority: P1)

Program rozhodne bez člověka:
- bod s chybou nebo vyvráceným tvrzením nesoucím stav si ponechá celý předchozí záznam, bez razítka „prověřeno“;
- zbytek se zveřejní;
- přechod bez nové, fact-checkem potvrzené události se nezveřejní;
- podržené body jdou do PR k rozhodnutí vlastníka (spec 005).

### Edge Cases

- Chyba v textu, který je i v předchozím záznamu: podržení nepomůže, bod jde k člověku.
- **Oprava chybně zveřejněného stavu nemá „událost“.** V měření 20. 10. 2026 navrhl Sonnet 5.5 správně 7.2 „porušeno“ → „deklarováno“ a 12.2 „splněno“ → „částečně“ (shoda se zlatou sadou). Brána přechodů obojí podržela („západka bez datovaného dokladu“), protože od „porušeno“ a „splněno“ chce datovanou událost. Pravda ale je, že k porušení nikdy nedošlo, a to žádnou událost nemá. Když vrstva D nebo M vyvrátí tvrzení, na kterém stojí **dosavadní** stav, a hodnotitel navrhuje jiný stav, jde návrh vlastníkovi do PR s důkazy. Potichu podržet se nesmí, jinak zůstane chyba na webu napořád.
- Zdroj blokuje stahování (403, timeout): neověřitelné odtud. 2. kolo M pak hledá jinde.
- Kontrola bodu technicky selže: bod je „nezkontrolovaný“ a podrží se. Nikdy nevyjde jako ověřený.

## Requirements *(mandatory)*

- **FR-001** (D): pravidla v `scripts/lib/faktcheck/deterministicky.js`, existence a datum předpisů přes `overZnacky` a `opravDatumVyhlaseni` z `lib/sbirka.js` (neopisovat).
- **FR-002** (D): rejstřík se načte pro všechny citované roky, nejen od nástupu vlády.
- **FR-003** (D): stažené texty zdrojů se uloží pro vrstvu M.
- **FR-004** (D): výsledek `test-konzistence.js` je součástí nálezů.
- **FR-005** (M): všech 143 bodů každý běh, nic se kvůli ceně nevynechá.
- **FR-006** (M): citace a URL verdiktu se ověří kódem.
- **FR-007** (R): rozhodnutí podle pravidel výš. Do auditu se zapíše návrh i verdikt (`zadrzeno`, `faktcheck`). Opravy jsou jen nové řádky.
- **FR-008**: zveřejněný `public/faktcheck.json` (bez UI) a podklady pro report (spec 005).
- **FR-009** (R): přechod, který brána podržela, ale jehož dosavadní stav kontrola faktů vyvrátila, jde do PR k rozhodnutí vlastníka, i s důkazy obou stran. Brána (`lib/prechody.js`) se nemění, rozhoduje vrstva R.

## Success Criteria *(mandatory)*

- **SC-001**: Vrstva D najde 1.2 a 15.4 a všechny smyšlené předpisy z auditních oprav 14.–15. 10. 2026.
- **SC-002**: Vrstva M označí 6 ze 6 známých nesouladů se zlatou sadou.
- **SC-003**: Žádný bod s chybou nebo vyvráceným tvrzením nesoucím stav nevyjde jako ověřený.
- **SC-004**: Cena vrstvy M do ~20 $ za běh (Batch), celý měsíční běh do 50 $.

## Měření

### 2026-10-20: vrstva M, kolo 1 na zlaté a kontrolní sadě (schválil vlastník: jen kolo 1, strop 6 $; stálo 2,30 $)

Opus 5.5, effort high, Batch API, 46 bodů, data webu k 16. 10. 2026. Čtyři dávky po sobě trvaly 3 h 40 min (proto od teď zkušební dávka a zbytek najednou).

| | zlatá (22) | kontrolní (24) | celkem |
|---|---|---|---|
| bodů, kde se web liší od pravdy | 6 | 13 | 19 |
| chyceno | 6 | 13 | **19/19, žádný propuštěný** |
| podrženo, ač stav webu sedí | 11/16 | 7/11 | 18/27 |
| návrh stavu podle pravidel sedí s pravdou | 14/16 | 8/10 | 22/26 |

- **Akceptace (SC-002) splněna**, ale nerozlišuje dost: 13 z 19 chycených chytilo jen „neověřeno“, které podrželo i 18 z 27 správných bodů. Rozlišují „spor o stav“ (správně 10.2, 12.2, 2.7, 7.2; chybně 2.2, 10.1, 14.1 — M3 použité na odklad bez formálního kroku) a „vyvráceno“.
- **Část „zbytečných“ podržení jsou skutečné chyby textu při správném stavu:** 15.1 tvrdí, že zákon čeká na podpis prezidenta, ale podle zdroje už je podepsaný; 10.1 má v doklad datum 28. 5. místo 8. 5.; 12.7 tvrdí, že návrh schválila vláda, šlo o poslanecký návrh; 6.8 cituje dohodu, kterou žádný zdroj nezmiňuje; 3.2 cituje nesouvisející vyhlášku 108/2024. Skóre měří jen stav, tohle nevidí.
- **Proč tolik „neověřeno“ (69 tvrzení nesoucích stav, 59 z nich u bodů s čitelnými zdroji):** (a) číslo a datum vyhlášení předpisu, které program ověřil v e-Sbírce, model nemá odkud citovat (2.10, 10.4); (b) tvrzení o tom, že něco NENASTALO („návrh dosud nebyl předložen“), citací doložit nejde — to vyřeší až otevřená data Sněmovny (spec 006); (c) tvrzení, které zdroje opravdu nenesou.
- **Cena:** kolo 1 0,05 $ za bod → ~7 $ za 143 bodů měsíčně. Do kola 2 by dnes šlo 72 % bodů (~100 měsíčně, odhad 40–60 $) — to rozpočet nepustí; nejdřív se musí snížit (a) a (b).

### 2026-10-21: opravy (a) a (b) — zdarma, odhad na odpovědích z 20. 10.

- **(a)** Ověřené předpisy jsou citovatelný zdroj (`zdrojeSbirky`, údaje rejstříku e-Sbírky). Na odpovědích z 20. 10. by šlo potvrdit 14 tvrzení.
- **(b)** Model značí tvrzení, že něco nenastalo (`absence`). Rozhodnutí vlastníka (A): nezměněný bod kvůli neověřené absenci nedrží, změna stavu ano. Přehrání ukázalo, že čisté A propustí 15.7 („nezahájeno“, pravda „deklarováno“), proto výjimka: u „nezahájeno“ absence drží dál. Přísnější než čisté A; vlastník může výjimku zrušit.
- **Odhad** (tvrzení o neexistenci poznaná podle slov, ne modelem): chyceno 19/19, propuštěno 0, zbytečně podrženo 13/27 (bylo 18), do kola 2 28/46 (bylo 33). Skutečné číslo dá až další placené měření.

### 2026-10-21: druhé měření — kolo 1 na 46 bodech + kolo 2 na vzorku 10 (schválil vlastník, strop 9 $; stálo 6,71 $)

S opravou e-Sbírky a pravidlem A, ještě bez dat Sněmovny. Dvoustupňová dávka doběhla za 16 minut.

| | 20. 10. | 21. 10. | 21. 10. po opravě absence |
|---|---|---|---|
| chyceno | 19/19 | 16/19 | 17/19 |
| propuštěno | 0 | 8.7, 13.5, 16.3 | 8.7, 13.5 |
| zbytečně podrženo | 18/27 | 9/27 | 9/27 |
| návrh stavu sedí s pravdou | 22/26 | 25/32 | 25/32 |

- **16.3** (web „deklarováno“, pravda „nezahájeno“) prošel kvůli výjimce pro absenci: tvrzení „vláda se nevyjádřila“ stavu odporují. Oprava: absence nedrží, jen když model z ověřených faktů dojde ke stejnému stavu jako web (jinak drží). Přepočet na odpovědích tohoto běhu: zachycen, žádné podržení navíc.
- **8.7** (web „deklarováno“, pravda „porušeno“): rozhoduje návrh rozpočtu 2027 ze září (M3: vyřazení z rozpočtu = porušeno), zdroj webu je z června. Kontrola faktů ověřuje web proti jeho zdrojům a novější událost bez vyhledávání nenajde; kolo 2 se pouští jen u neověřených tvrzení. Novou událost má najít měsíční plný audit s vyhledáváním — měří se až v řetězu hodnocení + kontrola.
- **13.5** (web „probíhá“, pravda „deklarováno“): kolo 2 našlo výzvu SFŽP na čistírny a uznalo „probíhá“ (M7); vlastník ji neuznal, protože míří na čistírny nad 10 000 EO, ne na malé obce ze slibu. Výklad rozsahu slibu (jistota vlastníka „nízká až střední“).
- 20. 10. chytilo 8.7 a 13.5 jen „neověřeno“, tedy náhodou: nulová propustnost proti pravdě vlastníka na samotné kontrole faktů stát nemůže.
- **Kolo 2:** 0,44 $ za bod (2,7 vyhledávání na bod). Na vzorku pustilo 2 správné body (12.7, 4.3), u 1.3, 7.8, 10.9 a 15.2 převedlo „neověřeno“ na „vyvráceno“ a jeden chybný bod pustilo (13.5). Potřebovalo by ho 57 % bodů → ~36 $ měsíčně, nad rozpočet.
- **Kolo 1:** 0,05 $ za bod, ~7 $ měsíčně (s daty Sněmovny odhad ~9,5 $).

### 2026-10-21: řetěz hodnocení → kontrola faktů → rozhodnutí na 46 bodech (schválil vlastník, strop 18 $; stálo 17,71 $)

Data DEV2 k 16. 10., hodnocení Sonnet 5.5 s vyhledáváním (5,08 $), kontrola faktů Opus 5.5 s daty Sněmovny a stropem kola 2 (12,63 $: kolo 1 3,48 $, kolo 2 9,16 $ za 19 bodů), rozhodnutí bez kalibrace. `retez-skore.js`:

| | zlatá (22) | kontrolní (24) | celkem |
|---|---|---|---|
| hodnocení samo sedí s pravdou | 15 | 11 | 26/46 |
| na web jako ověřené, stav sedí | 11 | 11 | 22 |
| **na web jako ověřené se špatným stavem** | 0 | 3 | **3 (3.2, 8.7, 13.5)** |
| k vlastníkovi — web sedí | 5 | 0 | 5 |
| k vlastníkovi — správný návrh | 5 | 5 | 10 |
| k vlastníkovi — bez dobrého návrhu | 1 | 5 | 6 |

Pro srovnání: dnešní web má správně 27/46 a všechno vydává za hotové hodnocení.

Tři propuštěné jsou výklad pravidel, ne vymyšlená fakta — model fakta zná:
- **3.2** „Příspěvek na bydlení až 6 000 Kč/měsíc dle regionu“ je z oddílu o platech bezpečnostních složek; hodnotitel i kontrola ho „splnili“ superdávkou, přesně podle protipříkladu v M10. Kontrola dostávala jen text bodu bez kapitoly a oddílu — **opraveno** (`slibySKontextem`), změří se příště.
- **8.7** Návrh rozpočtu 2027 slevu 75 % vynechal a premiér říká „pokusíme se v roce 2028“. M3 obsahuje obojí: „vyřazení z rozpočtu = porušeno“ i „odklad, který zůstává v tomto období, není ústup“; model zvolil druhé, vlastník první. **Rozhodne vlastník** (upřesnění M3).
- **13.5** Výzva SFŽP s penězi (M7 → probíhá) míří jen na čistírny nad 10 000 EO, slib na obce obecně; vlastník neuznal (jistota nízká až střední). **Rozhodne vlastník** (dílčí krok vůči cílové skupině slibu).

Cena: kolo 1 0,076 $ za bod s daty Sněmovny (~11 $ za 143 bodů), kolo 2 0,48 $ za bod. Odhad měsíčního běhu: hodnocení ~6–8 $, ověření, korektura a zprávy ~5 $, kontrola kolo 1 ~11 $, kolo 2 strop 15 $ → **~37–39 $**.

## Assumptions

- Vrstva M a R se dokončí po výběru modelu (spec 002). Prompt kontroly faktů je nový soubor a existující prompty se nemění.
- psp.cz (D7) přibude se spec 006.
