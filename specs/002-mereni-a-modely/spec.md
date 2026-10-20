# Feature Specification: Měření ceny a podpora silnějších modelů

**Feature Branch**: `DEV2`
**Created**: 2026-10-20
**Status**: Ready for planning
**Input**: Schválený plán, fáze 2. Měsíční běh má používat silnější modely (návrh: hodnotitel Sonnet 5.5, ověřovatel a korektor Opus 5.5) v rozpočtu do 50 $ měsíčně (ladění do 80 $). Model se vybírá podle shody se zlatou sadou (`scripts/dev/fixtury/zlata-sada.json`, 22 bodů potvrzených vlastníkem 20. 10. 2026). Prompty se nemění.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Vím, kolik běh stál (Priority: P1)

Po každém běhu je v logu i v souboru zapsáno, kolik stál: celkem a po rolích (hodnocení, sken, ověření, korektura, zprávy), kolik tokenů a kolik vyhledávání. Když se běh zjevně vymkne (chyba v kódu, zacyklení), zastaví ho pojistka dřív, než utratí víc než stanovenou částku, a nic se nezveřejní.

**Why this priority**: Dnes cenu běhu nikdo nezná. Rozpočet 50 $ a rozhodování mezi modely bez toho stojí na odhadech.

**Independent Test**: Simulovaný běh vypíše souhrn ceny a zapíše záznam. Simulace překročení pojistky běh zastaví s nenulovým návratovým kódem.

**Acceptance Scenarios**:

1. **Given** dokončený běh, **When** se podívám do logu, **Then** vidím cenu v $ po rolích a celkem a stejný záznam přibyl do souboru nákladů.
2. **Given** pojistka 80 $ a běh, který ji překročí, **When** se má poslat další požadavek, **Then** se už neodešle, běh skončí chybou a workflow nic necommitne.

---

### User Story 2 – Pipeline umí volat modely s přemýšlením (Priority: P1)

Model se mění jen v nastavení. Program podle modelu sám sestaví správné volání:
- **u dnešních modelů** (Haiku 4.5, Sonnet 4.6, Opus 4.6) přesně stejné jako dnes;
- **u řady 5.x**:
  - bez `temperature`, kterou tyto modely odmítají;
  - s přemýšlením a nastavenou hloubkou (effort);
  - s dostatečným limitem odpovědi;
  - se streamováním, aby dlouhé přemýšlení nenarazilo na timeout;
  - s novější verzí vyhledávání;
  - se záložním modelem, když model odmítne odpovědět.

Odmítnutí modelu se pozná a zapíše. Do auditu se zapíše model, který odpověď opravdu dal.

**Why this priority**: Bez toho řadu 5.x nejde ani změřit. Teplota 0 v dnešním volání by skončila chybou 400.

**Independent Test**: Offline test sestaví volání pro každý podporovaný model a ověří tvar. Složí streamovanou odpověď z ukázky včetně bloků přemýšlení, vyhledávání a podpisů. Parita prokáže, že pro dnešní modely se volání nezměnilo ani o bajt.

**Acceptance Scenarios**:

1. **Given** nastavení z main (Haiku/Sonnet 4.6), **When** proběhne parita, **Then** všechny požadavky jsou bajtově stejné jako na main.
2. **Given** model `claude-sonnet-5-5`, **When** se sestaví volání, **Then** neobsahuje `temperature`, obsahuje přemýšlení, effort a streamování a nástroj vyhledávání v novější verzi.
3. **Given** model, který v nastavení neexistuje (překlep), **When** běh startuje, **Then** skončí srozumitelnou chybou dřív, než cokoli zaplatí.

---

### User Story 3 – Měření proti zlaté sadě (Priority: P1)

Vlastník (nebo agent s jeho souhlasem) spustí ručně v GitHubu měření: zvolený model ohodnotí jen body zlaté sady nad daty z main. Výsledek je skóre shody s realitou (stav, předpis, datum), cena a tabulka rozdílů. Nic se necommituje.

**Why this priority**: Rozhodnutí o modelu má stát na shodě s realitou, ne na dojmu.

**Independent Test**: Skórovač spuštěný nad dnes publikovanými daty ukáže známý výsledek revize zlaté sady (web se liší v 6 z 22 bodů).

**Acceptance Scenarios**:

1. **Given** dnešní `public/evaluations.json`, **When** spustím skórovač, **Then** hlásí shodu stavu 16 z 22 a vyjmenuje 5.4, 6.6, 7.2, 2.7, 10.2 a 12.2.
2. **Given** ruční spuštění měření s modelem X, **When** doběhne, **Then** artefakt obsahuje skóre, cenu a log a v repozitáři se nic nezmění.

### Edge Cases

- Model vrátí `stop_reason: refusal`: běh to zapíše a kapitolu nechá na minulém stavu. Opakování stejného vstupu nepomůže.
- Odpověď přijde od záložního modelu: do auditu se zapíše skutečný model.
- Neznámý model bez ceny v tabulce: cena se počítá konzervativně (jako nejdražší řada Opus) a log to řekne.
- Přerušený stream: chyba s označením k opakování, stejně jako dnes u chyb API 5xx.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Program MUSÍ u každého volání modelu zaznamenat spotřebu (vstup, výstup, cache, počet vyhledávání) a skutečný model a na konci běhu vypsat a uložit cenu po rolích.
- **FR-002**: Program MUSÍ před každým voláním zkontrolovat pojistku ceny (výchozí 80 $ na běh). Po jejím překročení už nic neodešle a skončí nenulovým kódem.
- **FR-003**: Program MUSÍ podle ID modelu sestavit volání. Pro dnešní modely beze změny. Pro řadu 5.x bez `temperature`, s adaptivním přemýšlením, s effortem z nastavení, s limitem odpovědi pro přemýšlení, se streamováním, s `web_search_20260209` tam, kde ho model podporuje, a se serverovým záložním modelem tam, kde ho API nabízí.
- **FR-004**: Program MUSÍ složit streamovanou odpověď do stejného tvaru, jaký vrací volání bez streamu, včetně bloků přemýšlení s podpisy, aby doptání v téže konverzaci fungovalo.
- **FR-005**: Program MUSÍ před prvním placeným voláním ověřit, že nastavené modely existují.
- **FR-006**: Nová nastavení (effort hodnocení, effort kontrol, pojistka ceny) jsou povinná jako všechna ostatní. Platí zásada `lib/nastaveni.js`, že žádné nastavení nesmí tiše spadnout na výchozí hodnotu. Parita je k nastavení ze základu doplní hodnotami z DEV2. Pro vlastníka MUSÍ být popsaná v `NAVOD.md`.
- **FR-007**: Program MUSÍ umět ohodnotit jen vybrané body (pro měření na zlaté sadě). Výchozí chování se tím nemění.
- **FR-008**: Skórovač MUSÍ porovnat hodnocení se zlatou sadou (stav, `unverifiable`, citovaný předpis, datum dokladu) a vypsat skóre a rozdíly.
- **FR-009**: Měřicí workflow MUSÍ běžet jen na DEV2 a jen se zapsaným souhlasem vlastníka (`scripts/dev/mereni.json` → `schvaleno`). `workflow_dispatch` GitHub nabízí jen z výchozí větve, kam refaktor nesahá. Workflow nesmí nic commitovat a výsledky uloží jako artefakt.
- **FR-010**: Změny v chráněných souborech (`lib/nastaveni.js`, `lib/korektura.js`) MUSÍ být ohlášené patche, které prokazatelně nemění chování pro dnešní modely (parita i bez nich).

## Success Criteria *(mandatory)*

- **SC-001**: Parita s nastavením z main zůstane zelená. Patche z této feature jsou prokázané jako neutrální.
- **SC-002**: Skórovač nad dnešními daty reprodukuje výsledek revize (16/22).
- **SC-003**: Offline test pokryje tvar volání pro všechny podporované modely a složení streamu.
- **SC-004**: Nic z této feature nestojí peníze. Placená měření se spouštějí zvlášť, s předem ohlášeným odhadem.

## Výsledky měření

### 2026-10-20: Sonnet 5.5 na zlaté sadě (schválil vlastník, celkem 6,51 $)

**1. běh (3,14 $), neplatný.** Novější vyhledávání `web_search_20260209` (dynamické filtrování) vedlo model k hledání vlastním kódem:
- vyčerpal limit 4 vyhledávání na kapitolu;
- usoudil, že „vyhledávání selhalo“, a v 8 kapitolách z 9 necitoval žádný zdroj;
- v kapitole 2 zavolal neexistující nástroj „code_execost“ a doptání pak API odmítlo (400).

Oprava: základní vyhledávání pro všechny modely a odpověď chybou na volání neexistujícího nástroje.

**2. běh (3,37 $: hodnocení 3,03 $ za 9 volání, ověření 0,35 $ za 1 volání).** Zdroje se zachovaly (3–12 na kapitolu).

| | dnešní web (Haiku + ruční opravy) | Sonnet 5.5: návrh hodnotitele | Sonnet 5.5: po bráně přechodů |
|---|---|---|---|
| stav | 16/22 | 17/22 | 17/22 |
| datum dokladu | 4/10 | — | 6/10 |
| předpis | 4/5 | — | 3/5 |

Co z toho plyne:
- **Hodnotitel navrhl správně** 6.6 a 7.2 („porušeno“ → „deklarováno“) a 10.2 („probíhá“ → „deklarováno“). Ověřovatel (Opus 5.5) potvrdil 10.2. Brána přechodů ale 6.6 a 7.2 podržela („západka bez datovaného dokladu“). Oprava chyby nemá událost, proto spec 004, FR-009.
- **Hodnotitel se mýlil** u 10.1 („porušeno“ → „deklarováno“, pravda je „porušeno“) a 17.3 („částečně“ → „deklarováno“). Obojí brána podržela, tedy správně.
- **Beze změny zůstaly chybné stavy** 12.2 („splněno“, pravda „částečně“) a 2.7 („porušeno“, pravda „deklarováno“). Ty musí chytit kontrola faktů.
- **Odhad ceny plného měsíčního běhu se Sonnetem 5.5:** hodnocení ~6–7 $ (19 volání), ověřování ~5 $, korektura a zprávy ~3 $, kontrola faktů ~16–26 $. Celkem ~31–41 $, tedy v rozpočtu.

Opus 5.5 a Sonnet 4.6 jako hodnotitelé zatím změřeni nebyli; vlastník schválil jen Sonnet 5.5.

## Assumptions

- Ceny a schopnosti modelů jsou podle dokumentace Anthropic ke 2026-10-06. Tabulka cen je v kódu na jednom místě, s datem.
- Ukázka streamu pro offline test je sestavená podle dokumentovaného formátu, protože skutečný záznam by stál peníze. Při prvním placeném měření se nahradí skutečným přepisem (pravidlo ústavy IV).
