# Implementation Plan: Parita DEV2 ↔ main

**Branch**: `DEV2` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-parita/spec.md`

## Summary

Nástroj `scripts/dev/parita/` spustí `scripts/evaluate.js` základu (`origin/main`) i DEV2 v dočasných kopiích stromu se shodnými vstupy. Pak porovná všechny požadavky na model a výsledná data. Determinismus a nulovou cenu zajistí loader pro `--import` (`zmrazit.js`). Je stejný pro obě strany, takže `evaluate.js` zůstává netknutý. Loader:
- zmrazí čas;
- vypne čekání;
- e-Sbírku obslouží z fixtur;
- odpovědi modelu vezme ze sdíleného simulátoru (`syntetika.js`) nebo z kazety.

Simulátor odvozuje odpovědi z publikovaných dat a deterministicky (hash id) vyvolá všechny větve programu z FR-008. Navíc nástroj:
- ověří bajty chráněných souborů;
- pustí testy základu proti kódu DEV2;
- porovná přehrání korpusu.

## Technical Context

**Language/Version**: Node.js 20 (ESM)
**Primary Dependencies**: žádné nové; `node:` moduly, `git` (worktree), loader přes `node --import`
**Storage**: dočasné adresáře v `os.tmpdir()`; kazety volitelně v `scripts/dev/fixtury/`
**Testing**: samotný nástroj je kontrola; jeho správnost dokládá sada úmyslných sabotáží (SC-002)
**Target Platform**: Windows (Git Bash / PowerShell) i ubuntu-latest v GitHub Actions
**Project Type**: vývojový nástroj nad dávkovou pipeline
**Performance Goals**: < 5 min na všechny scénáře (SC-005)
**Constraints**: 0 volání API a živého webu; pracovní adresář beze změny; obě strany sdílí loader i simulátor
**Scale/Scope**: 143 bodů, 18 kapitol, 3 scénáře (plný, delta, prázdné) + volitelná kazeta

## Constitution Check

- [x] **I. Neověřené tvrzení nevyjde**: nástroj na web nic nezapisuje. Je to brána, která tichým změnám procesu brání.
- [x] **II. Program ví**: nástroj neopisuje pravidla. Spouští skutečný kód obou stran a porovnává výsledky.
- [x] **III. Parita**: to je smysl feature. `evaluate.js`, prompty ani hlídací knihovny se nemění; změní se jen komentáře „bez vyhledávání“ (viz níž), které chování nemají.
- [x] **IV. Měření**: fixtury e-Sbírky jsou výřezy skutečných odpovědí (už v repu). Simulátor staví odpovědi ze skutečných publikovaných záznamů.
- [x] **V. Append-only**: nástroj píše jen do dočasných kopií. Ostrý `audit.json` se nedotkne.
- [x] **VI. Design a texty**: web se nemění. Dokumentace: CLAUDE.md (oddíl o paritě), AGENTS.md přegenerovat.
- [x] **VII. Úplnost, rozpočet, bezpečnost**: 0 $. Nahrávání kazety (placené) je jen volitelný ruční režim a spouští se až ve spec 002 se souhlasem vlastníka. Klíč ani adresa se nikam nepíše.

**Dotčené invarianty z CLAUDE.md**: „Error message strings are load-bearing“ (simulátor nesmí měnit tvar chyb), „audit.json is append-only“, `dump-prompts` (parita ho doplňuje o ověřovatele a o celý běh, sám se nemění).

**Placené kroky**: žádné.

**Texty webu ke změně**: žádné.

## Project Structure

### Documentation (this feature)

```text
specs/001-parita/
├── spec.md
├── plan.md
├── tasks.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
scripts/dev/parita/
├── zmrazit.js          # loader --import: čas, čekání, fetch (model / e-Sbírka / nic jiného), záznam požadavků
├── syntetika.js        # deterministický simulátor odpovědí modelu (hodnocení, sken, ověřovatel, korektura, zprávy, doptání)
├── porovnej-vetve.js   # orchestrace: strany, scénáře, porovnání, výjimky, testy základu, korpus
└── vyjimky.json        # ohlášené záměrné rozdíly se zdůvodněním (zatím prázdné)
.github/workflows/parita.yml   # nový job „parita“
CLAUDE.md                      # oddíl o paritě (+ AGENTS.md přegenerovat)
```

**Structure Decision**: Všechno nové pod `scripts/dev/parita/`, mimo kód pipeline. Strana DEV2 je kopie pracovního stromu, aby šly ověřit i necommitnuté změny. Strana základu je `git worktree` z `origin/main`, protože je spolehlivý i na Windows i v CI.

## Návrh klíčových rozhodnutí

1. **Loader místo úprav `evaluate.js`**: stejný princip jako `dump-prompts.js`, který se osvědčil. Loader je pro obě strany fyzicky týž soubor (z DEV2), takže rozdíl může pocházet jen z kódu pipeline.
2. **Simulátor místo prázdných odpovědí**: prázdné `[]` nevyvolá přechod, zábranu ani korekturu. Simulátor vrací záznamy postavené z publikovaných dat a podle hashe id přidá deterministické „poruchy“:
   - nový přechod s čerstvým dokladem;
   - přechod se starým dokladem;
   - `fulfilled` s neexistujícím číslem předpisu;
   - `fulfilled` se skutečným číslem z fixtury;
   - `<cite>` v komentáři.

   Tvarem odpovědí pokryje holý objekt pro jeden bod, prózu před JSON a useknutí.
3. **Porovnání požadavků**: kanonický JSON těla (seřazené klíče) řádek po řádku. Výjimka může vyjmout pole těla (např. `stream`), ne text promptu.
4. **Testy základu na kódu DEV2**: třetí kopie DEV2, do které se překopíruje `scripts/dev/test-*.js` a `scripts/dev/fixtury/` ze základu.
5. **Kazeta**: JSON se seznamem `{hash, telo, odpoved}`, hash = sha256 kanonického těla. Nahrávání (`PARITA_ODPOVEDI=nahrat`) jen s platným klíčem a ručně.

## Complexity Tracking

Žádné porušení ústavy.
