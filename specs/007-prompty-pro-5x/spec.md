# Feature Specification: Vydání B — pravidla vlastníka a data Sněmovny v promptech

**Feature Branch**: `DEV2`
**Created**: 2026-10-21
**Status**: Hotové v kódu (parita: ohlášený patch `03-vydani-b.patch`); čeká na placené měření řetězu na obou sadách.
**Input**: Rozbor odpovědí Sonnetu 5.5 z měření 20. a 21. 10. 2026: ve čtyřech z pěti chyb hodnotitel našel stejná fakta jako vlastník a zařadil je podle jiných pravidel. Pravidla M1–M10 byla jen v hlavě vlastníka, v sadách a v promptu kontroly faktů, ne v promptu hodnocení — a ten jim v M1 (dílo předchozí vlády) a M3 (příklad porušení) dokonce odporoval. U bodu 3.2 chyběl oddíl programového prohlášení, bez kterého je slib nejednoznačný. Stádium legislativního procesu model hádal ze zpráv, ačkoli ho Sněmovna zveřejňuje jako úřední záznam.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Všechny role hodnotí podle stejných pravidel (Priority: P1)

Hodnotitel, oba ověřovatelé i kontrola faktů dostanou `scripts/nastaveni/metodika.md` beze změny, z jedné funkce (`nactiMetodiku` v `lib/prompty.js`). Definice stavů v promptu hodnocení nahradila metodika; v promptu zůstal jen požadavek na doklad u „splněno“ a „porušeno“ a pravidlo o předchozí vládě, které odkazuje na M1, M8 a M10.

**Independent Test**: `dump-prompts` — v každém promptu hodnocení i ověření je text metodiky; parita s ohlášeným patchem 03 projde.

### User Story 2 – Slib v kontextu oddílu (Priority: P1)

Každý řádek bodu v promptu hodnocení a sken událostí nese oddíl programového prohlášení; ověřovatel dostane znění s kapitolou a oddílem, stejně jako kontrola faktů.

**Independent Test**: řádek bodu 3.2 obsahuje „(oddíl „Platy a podmínky bezpečnostních složek“)“.

### User Story 3 – Stádium návrhu zákona z úředního záznamu (Priority: P1)

Hodnotitel dostane úplný seznam návrhů zákonů období z otevřených dat Sněmovny (`{{TISKY_PSP}}`, `zdrojSeznamu` z `lib/psp.js`), u tisku, ze kterého vzešel předpis, i jeho číslo ve Sbírce a datum vyhlášení. Bez dat Sněmovny dostane větu, že seznam není k dispozici, a běh pokračuje.

### Edge Cases

- Sněmovna nedostupná: prompt řekne, že seznam chybí, a pravidlo „co v seznamu není, předloženo nebylo“ neplatí.
- Stádium „KONEC“ bez čísla předpisu: zamítnutí, stažení, nebo vyhlášení ještě nezapsané — rozhodne rejstřík Sbírky.
- Číslo ve sloupci `zaver_sb_cislo` u kroku, kterým tisk neskončil (změna lhůty pozměňovacího návrhu nese 7): není to předpis.

## Requirements *(mandatory)*

- **FR-001**: Neměřitelnost se modelu neklade; `unverifiable` je pravda právě u bodů z `nemeritelne.txt`.
- **FR-002**: Žádná týdenní formulace v promptech (doptání, zprávy). „Za týden“ v promptu zpráv zůstává, protože okno zpráv je sedm dní.
- **FR-003**: Ukázka promptu na webu (`prompty.json`) skládá metodiku, oddíly i seznam tisků stejnými funkcemi jako běh; zkrácené části to přiznávají.
- **FR-004**: Parita: změna je ohlášený patch `scripts/dev/parita/zmeny/03-vydani-b.patch` (přidává do základu i `metodika.md` a `lib/psp.js`); `zmrazit.js` servíruje data Sněmovny z fixtury, takže parita porovnává i prompt se seznamem tisků.

## Success Criteria *(mandatory)*

- **SC-001**: V řetězu na 46 bodech (`rezim: retez`) sedí hodnocení samo s pravdou častěji než 26 a 28 ze 46 v měřeních 21. 10. 2026.
- **SC-002**: Na web jako ověřené se špatným stavem: 0.
- **SC-003**: Méně bodů k vlastníkovi než 26/46.
- **SC-004**: Cena hodnocení vzroste nejvýš o ~1 $ za měsíční běh (metodika ~1 500 a seznam tisků ~8 000 tokenů na dotaz).

## Assumptions

- Změna, která shodu se sadami nezlepší, se nezavede (vrátí se patch 03 a prompty).
- Kontrolní sada je poctivý test jen do chvíle, než se podle ní napíše pravidlo; M3 a M7 byly upřesněné 21. 10. podle bodů 8.7 a 13.5 kontrolní sady, což se při čtení výsledku řekne.
