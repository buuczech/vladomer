# Tasks: Kontrola faktů a publikační brána

## Vrstva D (deterministická)
- [x] T001 `scripts/lib/faktcheck/deterministicky.js`: D1 data dokladů, D2 předpisy (overZnacky, opravDatumVyhlaseni), D3 cs↔en, D6 polarita
- [x] T002 `scripts/faktcheck.js`: rejstřík pro citované roky, D4 odkazy (živost, titulka, whitelist, uložení textu), test-konzistence, výstup `faktcheck-vystup/deterministicky.json`
- [x] T003 `scripts/dev/test-faktcheck.js` na skutečných dokladech (1.2, 15.4, 270/2026, 233/2026, 11.9, 14.1, 3.2) + fixtura e-Sbírky 2025
- [x] T004 První ostrý běh nad daty k 20. 10. 2026: 2 CHYBA (1.2, 15.4, obě skutečné), 7 VAROVÁNÍ; 199/231 zdrojů přečteno
- [x] T004b Nová pravidla D po kontrolní sadě: nestabilní čísla předpisů z auditu (1.2, 10.5, 11.4, 14.1, 15.4), „splněno“ s výhradou „Ne, ale“, neměřitelnost podle vlastníka neuplatněná; názvy citovaných předpisů ve výstupu
- [x] T004c `scripts/nastaveni/nemeritelne.txt` + `evaluate.js` (ohlášený patch parity 02): neměřitelnost drží program
- [ ] T005 D5 vykreslený web (headless Chrome: SPA, /prehled/, /overview/, JSON-LD proti datům)

## Vrstva M (model) — po výběru modelu
- [ ] T006 `scripts/nastaveni/prompt-faktcheck.md` (nový prompt; existující beze změny)
- [ ] T007 1. kolo přes Batch API nad texty zdrojů; 2. kolo s vyhledáváním jen pro nepotvrzené
- [ ] T008 Kontrola kontrolora: citace doslova ve zdroji, URL ze zdrojů/vyhledávání
- [ ] T009 Akceptace: 6/6 nesouladů se zlatou sadou

## Vrstva R (rozhodnutí)
- [ ] T010 `scripts/lib/faktcheck/rozhodnuti.js`: podržení, zákaz přechodu bez potvrzené události, kalibrace, audit (`zadrzeno`, `faktcheck`)
- [ ] T011 `public/faktcheck.json`

## Ověření
- [x] T012 Devět offline kontrol prochází (sedm + test-modely + test-faktcheck)
- [ ] T013 Parita zelená (faktcheck neovlivňuje evaluate.js)
