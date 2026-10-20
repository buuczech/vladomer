# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!-- Předvyplněno pro Vládoměr. Uprav jen to, čeho se feature týká; neznámé označ NEEDS CLARIFICATION. -->

**Language/Version**: Node.js 20 (ESM, `"type": "module"`), React 18 + Vite 5 pro web

**Primary Dependencies**: žádné runtime npm závislosti mimo React/Vite — API Anthropic, e-Sbírka, psp.cz a Resend se volají přes `fetch`; Chrome (headless) pro obrázky a PDF

**Storage**: soubory v repozitáři — `public/*.json` (evaluations, history, news, audit; append-only audit), `scripts/nastaveni/` (prompty, nastavení, whitelisty)

**Testing**: žádný test runner; offline kontroly `node scripts/dev/test-*.js` s fixtures ze skutečných přepisů, `dump-prompts`, nástroj parity, přehrání korpusu `prehraj-*.js`

**Target Platform**: statický web na GitHub Pages; pipeline v GitHub Actions (ubuntu-latest); lokálně Windows (PowerShell / Git Bash)

**Project Type**: statický web + dávková pipeline hodnocení + build-time generování

**Performance Goals**: měsíční běh projde všech 143 bodů a všechny kontroly v limitu jobu GitHub Actions

**Constraints**: rozpočet API do 50 $ / měsíc (ladění do 80 $), nic se kvůli ceně nevynechává; design webu beze změny; prompty ve vydání A zmrazené; parita s `main`

**Scale/Scope**: 143 bodů v 18 kapitolách, ~300 zdrojových odkazů, ~1 400 auditních řádků

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Odpověz u každé brány ANO / NE / N/A a u NE uveď zdůvodnění v Complexity Tracking.

- [ ] **I. Neověřené tvrzení nevyjde** — může feature způsobit, že na webu vyjde tvrzení nesoucí stav bez ověření? Jak se tomu brání?
- [ ] **II. Program ví** — ptá se feature modelu na něco, co program zná přesně? Je každé nové pravidlo na jediném místě a importované, ne opsané? Pět míst přísné metriky se shoduje?
- [ ] **III. Parita** — mění feature texty, které model čte, nebo rozhodnutí programu nad stejnou odpovědí? Pokud ano: je to deklarováno v `scripts/dev/parita/vyjimky.json`? Mění hlídací knihovnu (pak nejdřív na `main`)? Mění `prompt-*.md` (ve vydání A zakázáno)?
- [ ] **IV. Měření** — vyžaduje změna měření na zlaté sadě a/nebo stabilitě? Jsou fixtures ze skutečných přepisů?
- [ ] **V. Append-only** — zapisuje feature do `audit.json` jen nové řádky? Ponechává podržený bod celý předchozí záznam?
- [ ] **VI. Design a texty** — mění se vzhled (nesmí)? Které texty webu (metodika, FAQ, prompty, `/prehled/`, JSON-LD, og) se musí změnit ve stejném mergi?
- [ ] **VII. Úplnost, rozpočet, bezpečnost** — vynechává se něco kvůli ceně (nesmí)? Odhad ceny placených kroků; nejsou ve sledovaných souborech klíče, tokeny ani e-mailové adresy?

**Dotčené invarianty z CLAUDE.md**: [vyjmenuj odstavce sekce „Invariants worth knowing before editing“, kterých se feature týká]

**Placené kroky**: [každé volání API: kdy, kolik, odhad $; nebo „žádné“]

**Texty webu ke změně**: [seznam klíčů v `src/App.jsx` a souborů, nebo „žádné“]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

<!-- Skutečné rozložení repozitáře; ponech jen větve, kterých se feature týká, a doplň nové soubory. -->

```text
src/                     # web: App.jsx (jeden velký soubor záměrně), data.js, zmeny.js, governments.js
scripts/
├── evaluate.js          # měsíční/týdenní běh hodnocení (stojí peníze)
├── lib/                 # sdílené pipeline + build: dukaz, prechody, sbirka, korektura, odpoved, delta, prompty, nastaveni, prehled, seo, instagram …
├── nastaveni/           # prompty a nastavení editovatelné vlastníkem (LF, NAVOD.md)
├── instagram/           # post.js, adhoc.js, reel.js
└── dev/                 # offline kontroly test-*.js, fixtury/, dump-prompts, prehraj-*, parita/, hooks/
public/                  # evaluations.json, history.json, news.json, audit.json (append-only)
.github/workflows/       # deploy.yml, dev-eval.yml, instagram*.yml
```

**Structure Decision**: [Které soubory feature mění a které přidává — s odkazem na stromy výš]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
