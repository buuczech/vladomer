# Tasks: Vydání B — pravidla vlastníka a data Sněmovny v promptech

- [x] T001 `lib/prompty.js`: `nactiMetodiku`, `slibySKontextem`, `zneniSKontextem`, oddíl u bodu v `radkyBodu` a ve skenu, `TISKY_NEDOSTUPNE`; `lib/faktcheck/modelova.js` je jen re-exportuje
- [x] T002 `prompt-hodnoceni.md`: `{{METODIKA}}` místo vlastních definic stavů, doklad u fulfilled/broken, předchozí vláda podle M1/M8/M10, příklad porušení podle M3, `{{TISKY_PSP}}`, bez `unverifiable`, bez verzálek psaných pro Haiku
- [x] T003 `prompt-overeni-prechodu.md`, `prompt-overeni-prostredniho.md`: `{{METODIKA}}`; ověřovatel dostane znění bodu s kapitolou a oddílem
- [x] T004 `prompt-doptani.md`, `prompt-zpravy.md`: pryč týdenní formulace; `prompt-delta.md`: oddíl u bodu
- [x] T005 `evaluate.js`: načtení dat Sněmovny (`nactiTisky` → `zdrojSeznamu`), `unverifiable` jen podle `nemeritelne.txt`
- [x] T006 `lib/psp.js`: číslo ve Sbírce jen u kroku, kterým tisk skončil (oprava 7/2026 u tisků 189 a 198); seznam tisků nese číslo a datum vyhlášení; test v `test-psp.js`
- [x] T007 Parita: `zmeny/03-vydani-b.patch`, `vyjimky.json`, data Sněmovny z fixtury v `zmrazit.js`
- [x] T008 `dump-prompts.js`: ověření modelů, SSE pro modely 5.x, data Sněmovny, ochrana `naklady.json` (nefungoval od spec 002)
- [x] T009 Web: ukázka promptu se seznamem tisků a znění bodu u ověřovatele (`vite.config.js`), metodika, „Změny metodiky“, popis promptu hodnocení; NAVOD, CLAUDE.md, AGENTS.md
- [x] T010 Placené měření řetězu na 46 bodech (`rezim: retez`, 20,20 $): přesnost beze změny, výsledek ve spec 004
- [x] T010b Rozhodnutí vlastníka o neměřitelnosti i pro záznam podržený branou (`evaluate.js`, patch 04) a ve vrstvě R (`rozhodnuti.js`); test v `test-rozhodnuti.js`
- [x] T010c Druhý bod měření z generálky: 33/46, stejně jako bez B. Vlastník 22. 10.: B nechat a doplnit Plán legislativních prací (spec 006 T008) — s ním 38/46
- [x] T011 Ověření: všech 14 offline kontrol, parita, build, `test-soukromi --dist`
