# Feature Specification: Měsíční běh

**Feature Branch**: `DEV2`
**Created**: 2026-10-20
**Status**: Implementováno na DEV2, čeká na generálky
**Input**: Schválený plán, fáze 3. Rozhodnutí na datech: týdenní rytmus hlavně doháněl staré události (medián stáří dokladu ~150 dní, jen 5 ze 17 přechodů na události mladší 30 dní) a po každém pátečním běhu od 18. 9. následoval ruční opravný commit. Měsíční rytmus uvolní rozpočet na silnější modely, plný audit všech bodů a kontrolu faktů před zveřejněním.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Jednou měsíčně plný audit (Priority: P1)

1. den v měsíci v 05:15 UTC proběhne plný audit všech 143 bodů, kontrola faktů, rozhodnutí, zápis, PR s podrženými body a report e-mailem. Web nikdy nečeká na vlastníka.

**Independent Test**: generálka (`mereni.json` → `rezim: generalka`) projde celý běh bez zápisu na main a pošle e-mail `[ZKOUŠKA]`.

### User Story 2 – Mimořádný běh (Priority: P2)

Při velké události ruční dispatch s `rezim_behu: delta`: sken událostí a přehodnocení jen bodů s událostí; kontrola faktů a rozhodnutí stejně jako měsíčně. Instagram se po mimořádném běhu nezveřejní.

### User Story 3 – Měsíční příspěvek (Priority: P2)

Po nasazení plánovaného běhu vyjde měsíční souhrn na Instagram (`instagram.yml`, `workflow_run`).

### Edge Cases

- Plánovač se opozdí: běh se přeskočí, jsou-li data už z tohoto měsíce; ruční běh běží vždy.
- Běh nebo kontrola faktů selže: nic se nezveřejní, přijde e-mail o selhání, výstupy jsou v artefaktu.
- Pojistka ceny platí na celý běh (hodnocení + kontrola faktů).

## Requirements *(mandatory)*

- **FR-001**: Jedna definice běhu (`mesicni-beh.yml`) pro ostrý běh i generálku.
- **FR-002**: Texty webu, metodika, FAQ, stránka promptů, `/prehled/`, JSON-LD, obrázek pro sdílení, README, LICENSE-DATA, NAVOD a skills popisují měsíční rytmus ve stejném sloučení; `test-konzistence` [H] hlídá, že žádný text nemluví o týdenním rytmu.
- **FR-003**: Prompty se ve vydání A nemění (`prompt-zpravy.md` a `prompt-doptani.md` s týdenní formulací počkají na vydání B).

## Success Criteria *(mandatory)*

- **SC-001**: Dvě generálky prošly a vlastník prošel jejich report.
- **SC-002**: Parita s main zelená, offline kontroly procházejí.
