# Implementation Plan: Měření ceny a podpora silnějších modelů

**Branch**: `DEV2` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

## Summary

Nový modul `scripts/lib/modely.js` je jediné místo, které ví, jak se volá který model:
- `teloPozadavku()` sestaví tělo podle profilu modelu;
- `zavolejApi()` pošle požadavek, u streamu složí odpověď, zaznamená spotřebu, hlídá pojistku a odmítnutí;
- tabulka cen;
- `overModely()` ověří, že nastavené modely existují.

`evaluate.js` a `lib/korektura.js` volají API jen přes něj. Profil „klasický“ (Haiku 4.5, Sonnet 4.6, Opus 4.6) skládá stejné tělo jako dnes. Profil „přemýšlení“ (Opus 4.7+, řada 5.x, Fable) vynechá `temperature` a doplní přemýšlení, effort, stream, novější vyhledávání a záložní model.

Měření proti zlaté sadě obstarají:
- filtr `BODY` v `evaluate.js`;
- skórovač `scripts/dev/zlata-sada-skore.js`;
- ruční workflow `dev2-eval.yml`.

## Technical Context

**Language/Version**: Node.js 20 (ESM)
**Primary Dependencies**: žádné nové; `fetch` a ruční čtení SSE (bez SDK, jako dosud)
**Storage**: nový `public/naklady.json` (záznam ceny každého běhu)
**Testing**: nová offline kontrola `scripts/dev/test-modely.js`; parita (včetně důkazu neutrality patchů)
**Constraints**: prompty beze změny; parita s nastavením z main; 0 $ za vývoj
**Scale/Scope**: 5 míst volání API (4× evaluate.js, 1× korektura.js)

## Constitution Check

- [x] **I. Neověřené tvrzení nevyjde**: odmítnutí modelu a pojistka vedou k ponechání minulého stavu, nikdy k neověřenému zápisu. Skutečný model se zapisuje do auditu.
- [x] **II. Program ví**: cena, skutečný model a tvar volání jsou v kódu na jednom místě (`modely.js`). Model se na ně neptá.
- [x] **III. Parita**: `lib/nastaveni.js` (nové povinné klíče a typ „volba“) a `lib/korektura.js` (volání přes `modely.js`) jsou chráněné. Jdou jako ohlášený patch `02-volani-modelu.patch` označený jako neutrální: parita ho ověří i bez něj (stejné požadavky a data).
- [x] **IV. Měření**: skórovač proti zlaté sadě. Ukázka streamu je zatím sestavená podle dokumentace. Úloha na nahrazení skutečným přepisem je v tasks.
- [x] **V. Append-only**: audit dostane volitelné pole `model_skutecny` jen tehdy, když se liší od nastaveného (u dnešních modelů nikdy).
- [x] **VI. Design a texty**: web beze změny. NAVOD.md a nastaveni.txt popíšou nová nastavení. Metodiku na webu mění až fáze 3+4 (v jednom mergi s procesem).
- [x] **VII. Úplnost, rozpočet, bezpečnost**: pojistka jen proti chybě (80 $). Nic se nevynechává kvůli ceně. Měřicí workflow jen ručně, bez commitu.

**Placené kroky**: žádné v této feature. Měření (zlatá sada × 3 modely ≈ 15–20 $, stabilita ≈ 25 $) se spouští zvlášť se souhlasem vlastníka.

**Texty webu ke změně**: žádné (až fáze 3+4).

## Project Structure

```text
scripts/lib/modely.js                 # NOVÝ: profily, tělo, zavolejApi (SSE), měřič ceny, pojistka, overModely
scripts/lib/nastaveni.js              # nové povinné klíče, typ „volba“ (patch 02)
scripts/lib/korektura.js              # volání přes modely.js (patch 02)
scripts/evaluate.js                   # volání přes modely.js, overModely, filtr BODY, souhrn ceny, naklady.json, model_skutecny
scripts/nastaveni/nastaveni.txt, NAVOD.md
scripts/dev/test-modely.js            # NOVÁ offline kontrola (8.)
scripts/dev/fixtury/sse-ukazka.txt    # ukázka streamu (dočasně sestavená, viz tasks)
scripts/dev/zlata-sada-skore.js       # skórovač
scripts/dev/parita/zmrazit.js         # GET /v1/models, odpovědi ve streamu
scripts/dev/parita/porovnej-vetve.js  # neutrální patche: druhý průchod bez nich
scripts/dev/parita/zmeny/02-volani-modelu.patch
.github/workflows/dev2-eval.yml       # NOVÝ, ruční měření
```

## Complexity Tracking

Žádné porušení.
