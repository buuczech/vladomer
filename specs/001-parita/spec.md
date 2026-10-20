# Feature Specification: Parita DEV2 ↔ main

**Feature Branch**: `DEV2`
**Created**: 2026-10-20
**Status**: Ready for planning
**Input**: Schválený plán refaktoru: „Prompty a algoritmické kontroly — hodnocení na DEV a Main by se mělo shodovat na 100 %. Připrav si na to checky.“ Upřesnění vlastníka: bajtová shoda JSONu od modelu nutná není, rozhoduje shoda s realitou. Program a to, co model čte, se ale lišit nesmí bez ohlášení.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Důkaz, že DEV2 nezměnil nic, co model čte a program rozhoduje (Priority: P1)

Vlastník (nebo agent, který na DEV2 pracuje) po každé změně spustí jednu kontrolu. Ta odpoví, jestli větev DEV2 při **stejných vstupech** posílá modelu stejné texty a nad stejnými odpověďmi modelu dojde ke stejným datům na webu jako `main`. Když ne, vypíše přesně, který požadavek nebo který záznam se liší.

**Why this priority**: Celý refaktor (měsíční běh, nové modely, fact-check) se smí dotknout procesu jen tam, kde je to záměr. Bez důkazu by tichá změna promptu nebo pravidla mohla posunout stavy na webu a nikdo by to nepoznal. Tak už se to stalo: 16. 10. 2026 přetřídění auditu tiše „přepsalo“ opravy.

**Independent Test**: Spustit kontrolu na čerstvé DEV2 (zatím bez změn v pipeline). Musí skončit „shoda“. Pak úmyslně změnit jedno slovo v promptu nebo jedno číslo v pravidle a kontrola musí skončit chybou s ukázkou rozdílu.

**Acceptance Scenarios**:

1. **Given** DEV2 se stejným kódem pipeline jako main, **When** se kontrola spustí, **Then** skončí úspěchem a vypíše, kolik požadavků a záznamů porovnala.
2. **Given** změněný text v `scripts/nastaveni/prompt-*.md`, **When** se kontrola spustí, **Then** skončí chybou a ukáže první rozdílný požadavek.
3. **Given** změněné hlídací pravidlo (např. práh v `lib/dukaz.js`), **When** se kontrola spustí, **Then** skončí chybou, protože se liší výstupní data nebo testy main na kódu DEV2 neprojdou.
4. **Given** záměrný rozdíl zapsaný se zdůvodněním v seznamu výjimek, **When** se kontrola spustí, **Then** ho nepočítá jako chybu a ve výpisu ho uvede jako ohlášený.

---

### User Story 2 – Celý běh nanečisto, zdarma a opakovatelně (Priority: P1)

Kontrola musí projet **celou** pipeline: sken událostí, hodnocení, bránu přechodů, ověřovatele, e-Sbírku, korekturu, zprávy a zápis dat. Nestačí porovnat šablony. Nesmí přitom zavolat placené API ani živý web a dva běhy se stejným vstupem musí dát stejný výsledek.

**Why this priority**: Rozdíl v rozhodování programu se projeví jen tehdy, když program má co rozhodovat: přechod, zábranu, neexistující zákon, useknutou odpověď. Prázdné odpovědi (dnešní `dump-prompts`) většinu cest vůbec neprojdou.

**Independent Test**: Spustit kontrolu dvakrát po sobě bez změny kódu. Výstupy obou běhů jsou bajtově stejné. Výpis běhu ukazuje přechody, zadržení, ověření, sraženou zábranou i korekturu.

**Acceptance Scenarios**:

1. **Given** deterministický simulátor odpovědí, **When** proběhne plný audit i delta běh, **Then** projdou všechny větve: přijatý přechod, podržený přechod se starým dokladem, zamítnutý i potvrzený ověřovatelem, sražení „splněno“ kvůli neexistujícímu předpisu, oprava data podle e-Sbírky, korektura, jednobodová kapitola, useknutá odpověď a doptání.
2. **Given** nahraná kazeta skutečných odpovědí (volitelně), **When** se přehraje oběma větvím, **Then** se výsledky porovnají stejně jako u simulátoru.

---

### User Story 3 – Hlídání v CI (Priority: P2)

Každý push do DEV2 a každý PR do main kontrolu spustí automaticky a zdarma.

**Why this priority**: Kontrola, kterou je třeba si pamatovat spustit, se nespouští.

**Independent Test**: Push do DEV2 spustí workflow, který kontrolu provede. Výsledek je vidět v GitHub Actions.

**Acceptance Scenarios**:

1. **Given** push do DEV2, **When** proběhne workflow, **Then** spustí kontrolu parity proti `origin/main` a selže při neohlášeném rozdílu.

### Edge Cases

- **Main se mezitím posune** (týdenní běh zapíše nová data, oprava pravidla): kontrola bere jako základ aktuální `origin/main`, data pro obě strany z něj a nastavení z něj. Rozdíl, který se pak objeví, je skutečný a znamená „mergni main do DEV2“.
- **DEV2 přidá nový soubor nebo novou kontrolu**: nová kontrola na DEV2 parity nevadí. Kontrola ale vyžaduje, aby **testy z main** prošly na kódu DEV2.
- **Výpis běhu (log) se liší**, např. kvůli novému řádku s cenou: log je informativní a nepočítá se jako chyba. Rozhodují požadavky a data.
- **Neznámý požadavek při přehrávání kazety**: chyba s ukázkou nejbližšího nahraného požadavku, nikdy tiché pokračování.
- **Kontrola nesmí zapsat do pracovního adresáře**: běží v dočasných kopiích, ostrá data v `public/` se nemění.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Kontrola MUSÍ sestavit dvě strany ze shodných vstupů: *základ* (`origin/main`, nebo zadaná revize) a *DEV2* (aktuální pracovní strom včetně necommitnutých změn). Obě dostanou stejná data `public/*.json` a ve výchozím stavu stejné `nastaveni.txt` ze základu.
- **FR-002**: Obě strany MUSÍ běžet se zmrazeným časem, bez čekání, bez sítě. E-Sbírka se obslouží z fixtur a odpovědi modelu ze sdíleného deterministického simulátoru (nebo z kazety). Simulátor a zmrazení jsou pro obě strany **tytéž soubory** (z DEV2), aby rozdíl mohl pocházet jen z kódu pipeline.
- **FR-003**: Kontrola MUSÍ porovnat úplné tělo každého požadavku na model (pořadí, model, parametry, všechny zprávy) a výstupní `evaluations.json`, `history.json`, `audit.json` a `news.json`.
- **FR-004**: Kontrola MUSÍ porovnat bajty chráněných souborů: všech `scripts/nastaveni/prompt-*.md`, whitelistů zdrojů a hlídacích knihoven (`dukaz`, `prechody`, `sbirka`, `korektura`, `odpoved`, `delta`, `prompty`, `nastaveni`), `src/data.js` a `src/zmeny.js`.
- **FR-005**: Kontrola MUSÍ spustit offline testy **ze základu** (`scripts/dev/test-*.js` a jejich fixtury) proti kódu DEV2 a selhat, pokud některý neprojde.
- **FR-006**: Kontrola MUSÍ spustit přehrání korpusu (`prehraj-zabrany.js`, `prehraj-stary-doklad.js`) na obou stranách nad stejnými daty a porovnat výstupy.
- **FR-007**: Záměrné rozdíly MUSÍ být zapsané v jednom souboru výjimek se zdůvodněním u každé položky: pole požadavku, chráněný soubor, nebo pole výstupních dat. Neohlášený rozdíl = chyba (exit 1). Ohlášený rozdíl se vypíše.
- **FR-008**: Simulátor MUSÍ projít alespoň tyto cesty programu:
  - přijatý přechod;
  - přechod podržený kvůli staršímu dokladu;
  - přechod ověřený (potvrzený i zamítnutý);
  - sražení `fulfilled` pro neexistující předpis;
  - oprava data vyhlášení podle e-Sbírky;
  - korektura s přijatou opravou;
  - očista `<cite>`;
  - jednobodová odpověď jako holý objekt;
  - odpověď s prózou před JSON;
  - useknutá odpověď s doptáním chybějících bodů;
  - odpověď bez JSON s doptáním v téže konverzaci;
  - zprávy.
- **FR-009**: Kontrola MUSÍ umět i režim s nahranou kazetou: nahrávání (jen ručně, stojí peníze) a přehrávání (zdarma). Přehrávání páruje podle obsahu požadavku, ne podle pořadí.
- **FR-010**: Kontrola MUSÍ běžet v CI na každý push do DEV2 a PR do main, bez secrets.
- **FR-012**: Záměrné změny DEV2 v chráněných souborech nebo v rozhodování programu MUSÍ být ohlášené jako patche (`scripts/dev/parita/zmeny/`) se zdůvodněním. Kontrola je aplikuje na základ před porovnáním, protože `main` se během refaktoru nemění (rozhodnutí vlastníka 20. 10. 2026). Patch, který nejde aplikovat, je chyba.
- **FR-011**: Kontrola NESMÍ měnit soubory pracovního adresáře a po sobě uklidí dočasné kopie (pokud se výslovně nevyžádá jejich ponechání pro diagnózu).

### Key Entities

- **Strana** (základ / DEV2): úplná kopie stromu repozitáře, ve které běží pipeline.
- **Scénář**: režim běhu (plný audit, delta, prázdné odpovědi, kazeta) s pevným datem a vstupy.
- **Požadavek**: úplné tělo jednoho volání modelu v pořadí, v jakém ho program poslal.
- **Výjimka**: ohlášený záměrný rozdíl se zdůvodněním.
- **Kazeta**: nahrané páry „požadavek → skutečná odpověď“ jednoho placeného běhu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na DEV2 bez změn v pipeline kontrola hlásí shodu ve 100 % porovnaných požadavků a záznamů, ve všech scénářích.
- **SC-002**: Úmyslná změna jednoho slova v kterémkoli promptu nebo jedné hodnoty v kterémkoli pravidle je odhalena ve 100 % případů (ověřeno sadou úmyslných „sabotáží“).
- **SC-003**: Kontrola nestojí nic: 0 volání placeného API, 0 požadavků na živý web.
- **SC-004**: Dva po sobě jdoucí běhy kontroly bez změny kódu dají bajtově stejné výstupy.
- **SC-005**: Kontrola doběhne do 5 minut na běžném počítači i v CI.

## Assumptions

- Obě strany sdílejí strukturu repozitáře: `scripts/evaluate.js` se spouští stejně a zapisuje do `public/` vlastního stromu.
- Pipeline nepotřebuje npm závislosti (importuje jen moduly z repozitáře a `node:`), takže kopie stromu nepotřebuje `node_modules`.
- Výpis běhu (stdout) není součástí kontraktu a liší se smí. Rozhoduje, co jde do modelu a co jde na web.
- Rozptyl modelu samotného se tu neměří. To dělá měření proti zlaté sadě a režim `stabilita` (spec 002).
