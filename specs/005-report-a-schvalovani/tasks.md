# Tasks: Report běhu a schvalování z mobilu

## Report
- [ ] T001 `scripts/lib/report.js`: podklady z výstupů běhu (rozhodnutí, vrstvy D a M, data před a po, cena) a z nich HTML oddíly, `pro-AI.md` a popis PR
- [ ] T002 `scripts/nastaveni/report-behu.html`: šablona vzhledu (striktní `render()`), čitelná na telefonu i jako A4
- [ ] T003 `scripts/report.js`: CLI, výstup do `report/` (gitignored); `--fixture` ze skutečných dat bez sítě
- [ ] T004 PDF přes headless Chrome (`chrome()` z `lib/instagram.js`)
- [ ] T005 `scripts/dev/test-report.js`: striktní šablona, žádná e-mailová adresa ve výstupech, každý podržený bod i s příkazem

## Doručení a rozhodování
- [ ] T006 `scripts/report.js --poslat`: e-mail přes `lib/email.js` s PDF a `pro-AI.md`
- [ ] T007 `.github/workflows/rozhodnuti.yml`: `/prijmout`, `/podrzet` jen od vlastníka
- [ ] T008 `.github/workflows/pripominka.yml`: připomínka po 3 dnech

## Ověření
- [ ] T009 Offline kontroly a parita
- [ ] T010 PDF zkontrolované na šířce telefonu (screenshot)
