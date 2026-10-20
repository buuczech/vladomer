# Tasks: Parita DEV2 ↔ main

**Input**: Design documents from `/specs/001-parita/`
**Prerequisites**: plan.md, spec.md

## Phase 1: Setup

- [x] T001 Vytvořit `scripts/dev/parita/vyjimky.json` (prázdné seznamy + popis formátu)

## Phase 2: Foundational

- [x] T002 [P] Loader `scripts/dev/parita/zmrazit.js`:
  - zmrazený `Date` (`PARITA_DNES`) a nulové čekání;
  - fetch: model → simulátor / kazeta / prázdné, e-Sbírka → fixtury, cokoli jiného → chyba;
  - záznam těl požadavků do JSONL (`PARITA_POZADAVKY`).
- [x] T003 [P] Simulátor `scripts/dev/parita/syntetika.js`: odpovědi pro hodnocení, doptání, sken, ověřovatele, korekturu a zprávy podle FR-008.

## Phase 3: User Story 1 – důkaz parity (P1) 🎯 MVP

- [x] T004 [US1] `scripts/dev/parita/porovnej-vetve.js`: sestavení stran (základ přes `git archive`, kopie pracovního stromu DEV2), shodné vstupy a nastavení ze základu
- [x] T005 [US1] Porovnání požadavků a výstupních dat s výjimkami a čitelným výpisem prvního rozdílu
- [x] T006 [US1] Porovnání chráněných souborů (prompty, whitelisty, hlídací knihovny, `src/data.js`, `src/zmeny.js`)
- [x] T007 [US1] Testy základu na kódu DEV2 a porovnání přehrání korpusu (`prehraj-zabrany.js`, `prehraj-stary-doklad.js`)

## Phase 4: User Story 2 – celý běh nanečisto (P1)

- [x] T008 [US2] Scénáře `plny`, `delta`, `prazdne`; ověřit, že log běhu ukazuje všechny cesty z FR-008
- [x] T009 [US2] Režim kazety (přehrávání podle hashe; nahrávání jen ručně) — implementováno; ověří se první nahranou kazetou ve spec 002 (placené, se souhlasem vlastníka)

## Phase 5: User Story 3 – CI (P2)

- [x] T010 [US3] Job `parita` v `.github/workflows/parita.yml` proti `origin/main`

## Phase N: Polish

- [x] T011 Komentář „bez vyhledávání“ u ověřovatele v `scripts/evaluate.js` uveden do souladu se skutečností. `scripts/lib/prompty.js:111` je chráněný soubor → oprava jde nejdřív na `main` spolu s opravou `MINULY_OD`
- [x] T012 Oddíl o paritě v `CLAUDE.md`, přegenerovat AGENTS.md

## Phase N+1: Ověření (POVINNÉ, nevynechávat)

- [x] T013 Sedm offline kontrol prochází
- [x] T014 Parita na čisté DEV2: shoda ve všech scénářích (SC-001), dva běhy bajtově stejné (SC-004), čas < 5 min (SC-005) — základ a DEV2 jsou dva nezávislé běhy téhož kódu a dávají bajtově stejné výstupy; tři scénáře ~10 s
- [x] T015 Sabotáže (SC-002), každá musí kontrolu shodit:
  - slovo v `prompt-hodnoceni.md`;
  - slovo v `prompt-overeni-prechodu.md`;
  - práh v `lib/dukaz.js`;
  - podmínka v `lib/prechody.js`;
  - pořadí auditu v `evaluate.js`;
  - datum `MINULY_OD` pro ověřovatele;
  - `max_tokens` hodnocení.

  Výsledek: odhaleno 7 ze 7.

  Po každé sabotáži vrátit stav.
- [x] T016 Pracovní adresář po kontrole beze změny (`git status`)
- [x] T017 Žádný klíč ani adresa ve sledovaných souborech; 0 placených volání
