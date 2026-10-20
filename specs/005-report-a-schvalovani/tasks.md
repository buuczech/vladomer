# Tasks: Report běhu a schvalování z mobilu

## Report
- [x] T001 `scripts/lib/report.js`: podklady z výstupů běhu (rozhodnutí, vrstvy D a M, data před a po, cena) a z nich HTML oddíly, `pro-AI.md` a popis PR
- [x] T002 `scripts/nastaveni/report-behu.html`: šablona vzhledu (striktní `render()`), čitelná na telefonu i jako A4
- [x] T003 `scripts/report.js`: CLI, výstup do `report/` (gitignored); `--fixture` ze skutečných dat bez sítě — fixtura `fixtury/report.json` se doplní ze skutečných výsledků prvního placeného běhu kontroly faktů
- [x] T004 PDF přes headless Chrome (`chrome()` z `lib/instagram.js`), stránka 130 × 230 mm — ověřeno na simulovaném běhu
- [ ] T005 `scripts/dev/test-report.js` napsaný; do CI půjde s fixturou `report.json`

## Doručení a rozhodování
- [x] T006 `scripts/report.js --poslat` (+ `--selhani`, `--pripominka`): e-mail přes `lib/email.js` s PDF a `pro-AI.md`
- [x] T007 `.github/workflows/rozhodnuti.yml` + `scripts/navrhy.js`, `lib/navrhy.js`: `/prijmout`, `/podrzet` jen od vlastníka; větev se skládá znovu z commitu běhu a přijatých bodů (test v `test-rozhodnuti.js`). Funguje až po sloučení do main (issue_comment běží z výchozí větve)
- [x] T008 `.github/workflows/pripominka.yml`: připomínka po 3 dnech a pak každé 3 dny

## Ověření
- [x] T009 Offline kontroly a parita
- [x] T010 PDF zkontrolované na šířce telefonu (simulovaný běh, 20. 10. 2026)
