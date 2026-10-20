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
- [x] T006 `scripts/nastaveni/prompt-faktcheck.md` (nový prompt; existující beze změny) + pravidla vlastníka v `scripts/nastaveni/metodika.md`
- [x] T007 1. kolo přes Batch API nad texty zdrojů; 2. kolo s vyhledáváním jen pro nepotvrzené (pause_turn a volání neexistujícího nástroje se dokončí)
- [x] T008 Kontrola kontrolora: citace doslova ve zdroji, URL ze zdrojů/vyhledávání (simulace: zahozeno 46/46 vymyšlených citací)
- [ ] T009 Akceptace: všech 19 bodů, kde se web liší od zlaté (6) a kontrolní (13) sady, označeno; žádný propuštěný. Nástroj `scripts/dev/faktcheck-skore.js`, placený běh `dev2-eval.yml` → `rezim: faktcheck` (čeká na schválení)

## Vrstva R (rozhodnutí)
- [x] T010 `scripts/lib/faktcheck/rozhodnuti.js` + `scripts/rozhodni.js`: podržení, zákaz přechodu bez potvrzené události (stejný doklad = oprava k vlastníkovi), FR-009 (návrhy z `NAVRHY_BEHU`), kalibrace `faktcheck_kalibrace`, audit (`zadrzeno`, `faktcheck`), dnešní snímek historie; `scripts/dev/test-rozhodnuti.js` na skutečných záznamech (10.2, 7.2, 12.2, 1.2, 2.3)
- [x] T011 `public/faktcheck.json` (jen kódy a počty; návrhy pro vlastníka v `faktcheck-vystup/rozhodnuti.json`)
- [ ] T011b Zapojení do měsíčního běhu (spec 003/005): `NAVRHY_BEHU`, faktcheck, rozhodni, test-konzistence, PR s podrženými body

## Ověření
- [x] T012 Devět offline kontrol prochází (sedm + test-modely + test-faktcheck)
- [x] T013 Parita zelená (faktcheck neovlivňuje evaluate.js; `NAVRHY_BEHU` se zapisuje jen s proměnnou prostředí)
