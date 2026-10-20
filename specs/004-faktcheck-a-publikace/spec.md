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

## Success Criteria *(mandatory)*

- **SC-001**: Vrstva D najde 1.2 a 15.4 a všechny smyšlené předpisy z auditních oprav 14.–15. 10. 2026.
- **SC-002**: Vrstva M označí 6 ze 6 známých nesouladů se zlatou sadou.
- **SC-003**: Žádný bod s chybou nebo vyvráceným tvrzením nesoucím stav nevyjde jako ověřený.
- **SC-004**: Cena vrstvy M do ~20 $ za běh (Batch), celý měsíční běh do 50 $.

## Assumptions

- Vrstva M a R se dokončí po výběru modelu (spec 002). Prompt kontroly faktů je nový soubor a existující prompty se nemění.
- psp.cz (D7) přibude se spec 006.
