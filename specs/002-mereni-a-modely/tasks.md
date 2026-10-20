# Tasks: Měření ceny a podpora silnějších modelů

## Phase 2: Foundational

- [x] T001 `lib/nastaveni.js`: typ „volba“ a nové povinné klíče `effort_hodnoceni`, `effort_kontroly`, `pojistka_ceny_usd`. Výchozí hodnoty ne: zásada „žádné tiché výchozí hodnoty“; parita doplní klíče známé jen DEV2.
- [x] T002 `lib/modely.js`:
  - profily;
  - `teloPozadavku`;
  - `zavolejApi` (JSON i SSE);
  - měřič a ceny;
  - pojistka;
  - odmítnutí;
  - `overModely`.

## Phase 3: US1 + US2 (P1)

- [x] T003 `evaluate.js`: 4 volání přes `zavolejApi`, `overModely` na startu, souhrn ceny a `public/naklady.json`, pojistka → nenulový kód, `model_skutecny` v auditu jen při rozdílu
- [x] T004 `lib/korektura.js`: volání přes `zavolejApi` (role `korektura`, effort kontrol)
- [x] T005 `test-modely.js`: tvary těl pro všechny profily, složení SSE, cena, pojistka, odmítnutí, chybové hlášky ve tvaru pro `withBackoff`

## Phase 4: US3 (P1)

- [x] T006 Filtr `BODY` v `evaluate.js` (bez filtru beze změny; s filtrem se neposune `posledniPlnyAudit`)
- [x] T007 `scripts/dev/zlata-sada-skore.js` a základní měření nad dnešními daty (16/22)
- [x] T008 `.github/workflows/dev2-eval.yml` (ručně, jen DEV2, bez commitu, artefakty)

## Phase N: Parita a dokumentace

- [x] T009 `zmrazit.js`: GET `/v1/models/{id}`, odpovědi ve streamu pro `stream: true`
- [x] T010 Patch `02-volani-modelu.patch` (nastaveni.js, korektura.js, modely.js) s příznakem neutrální; orchestrátor ověří paritu i bez něj
- [x] T011 `nastaveni.txt` + `NAVOD.md`, CLAUDE.md, AGENTS.md
- [ ] T012 Ukázku streamu nahradit skutečným přepisem při prvním placeném měření (fixtury ze skutečných běhů) — ČEKÁ na první placené měření se souhlasem vlastníka (`dev2-eval.yml`, `nahrat_kazetu: true`)

## Phase N+1: Ověření (POVINNÉ)

- [x] T013 Osm offline kontrol prochází (sedm + test-modely); CI je spouští
- [x] T014 Parita zelená s nastavením z main; neutrální patch ověřen i bez něj
- [x] T015 Simulovaný plný běh se Sonnet 5.5 / Opus 5.5 doběhne: stream složen, blok přemýšlení s podpisem vrácen v doptání beze změny, bez temperature, effort, záloha, web_search_20260209
- [x] T016 Skórovač reprodukuje 16/22 (navíc: datum dokladu u splněno/porušeno sedí jen 4/10)
- [x] T017 Žádný klíč ani adresa ve sledovaných souborech; 0 placených volání
