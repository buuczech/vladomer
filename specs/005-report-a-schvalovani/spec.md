# Feature Specification: Report běhu a schvalování z mobilu

**Feature Branch**: `DEV2`
**Created**: 2026-10-20
**Status**: Rozpracováno
**Input**: Schválený plán, část „Report a schvalování z mobilu“. Vlastník nechce po každém běhu sedět u počítače ani číst JSON. Chce textově-grafický export, u kterého řekne ano/ne, případně ho nahraje do AI a nechá si doporučit, co s ním. Report má přijít e-mailem (rozhodnutí vlastníka: vlastní e-mail s PDF) a rozhodovat se má jedním tlačítkem nebo komentářem z telefonu.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Po běhu přijde e-mail s verdiktem a PDF (Priority: P1)

Po každém měsíčním běhu přijde vlastníkovi e-mail. Předmět nese verdikt („Vládoměr 11/2026: zveřejněno, 2 body k rozhodnutí“). Přílohy:
- **PDF** čitelné na telefonu: verdikt, cena a modely; hlavní metrika před a po; co se na webu změnilo (u každé změny doklad, předpis z e-Sbírky a citace, kterou kontrola faktů ověřila); co čeká na rozhodnutí (dosavadní a navržený záznam vedle sebe, proč kontrola návrh nepustila, hotový příkaz k opsání); ostatní nálezy.
- **pro-AI.md**: totéž jako text pro aplikaci Claude, s definicemi stavů, pravidly vlastníka a připraveným dotazem „pro každý bod doporuč přijmout / podržet / opravit“.

**Why this priority**: Bez reportu vlastník neví, co rozhodnout, a podržené body by zůstaly viset.

**Independent Test**: `node scripts/report.js --fixture` vyrobí PDF, pro-AI.md a popis PR ze skutečných dat bez sítě a bez placení; PDF je čitelné na šířce telefonu.

**Acceptance Scenarios**:

1. **Given** běh bez podržených bodů, **When** vznikne report, **Then** předmět i titulek řeknou „zveřejněno, nic k rozhodnutí“.
2. **Given** podržený bod s návrhem hodnotitele i kontroly, **When** vznikne report, **Then** jsou v něm oba návrhy, důvod podržení a příkaz `/prijmout <id>`.
3. **Given** jakýkoli běh, **When** vznikne report, **Then** v PDF, pro-AI.md ani popisu PR není žádná e-mailová adresa.

### User Story 2 – Rozhodnutí z telefonu (Priority: P1)

Podržené body s návrhem jsou v PR `beh/RRRR-MM`. Vyjde jen výslovně přijaté (od 22. 10. 2026; dřív Merge = přijmout všechny nevyvrácené). Merge = zveřejnit přijaté, Close = nic. Po bodech komentářem `/prijmout 2.3`, `/podrzet 10.4`, u vyvráceného bodu `/prijmout 2.3 duvod: …` (důvod se zapíše do auditu jako `oprava`). Příkaz platí jen od vlastníka repozitáře.

**Independent Test**: na zkušebním PR projde příkaz od vlastníka a příkaz od cizího účtu se ignoruje.

### User Story 3 – Připomínka (Priority: P2)

Když PR `beh/*` čeká déle než 3 dny, přijde připomínka e-mailem. Další měsíční běh nevyřízený PR zavře, protože podržené body posoudí znovu.

### Edge Cases

- Běh selže: přijde krátký e-mail s odkazem na log; web zůstává na minulém měsíci.
- Chybí Chrome: report vznikne bez PDF (HTML a pro-AI.md), e-mail to řekne.
- Chybí `RESEND_API_KEY` nebo `REPORT_EMAIL_TO`: běh se nezastaví, report je jako artefakt, log řekne, který secret chybí (bez hodnoty).
- Vrstva M neběžela: report to řekne nahoře; nic se nepustilo jako ověřené (vrstva R).

## Requirements *(mandatory)*

- **FR-001**: Report se skládá z výstupů běhu (`rozhodnuti.json`, `deterministicky.json`, `modelova.json`, data před a po), nic se kvůli němu znovu nepočítá ani neplatí.
- **FR-002**: Šablona vzhledu je `scripts/nastaveni/report-behu.html`, vyplňovaná striktním `render()` jako ostatní šablony vlastníka.
- **FR-003**: PDF přes headless Chrome (`--print-to-pdf`), týž Chrome jako Instagram a obrázek pro sdílení; žádná nová závislost.
- **FR-004**: Barvy stavů jsou barvy legendy webu (světlý motiv).
- **FR-005**: Hlavní metrika je stejné pravidlo jako na webu (`fulfilled / rated`, bez neměřitelných).
- **FR-006**: E-mail odchází jen přes `scripts/lib/email.js`; adresa je jen v GitHub secrets a nikde se nevypisuje.
- **FR-007**: Příkazy z komentářů čte workflow jen od vlastníka a jen přísným regexem; text komentáře se nikdy nespouští.

## Success Criteria *(mandatory)*

- **SC-001**: Vlastník rozhodne o každém podrženém bodu z telefonu bez otevření JSONu.
- **SC-002**: Report z fixture vznikne offline a zdarma; test ho ověří (striktní šablona, žádná adresa, všechny podržené body a jejich příkazy).
- **SC-003**: Žádná e-mailová adresa v repozitáři, `public/`, `dist/` ani ve výstupech reportu.

## Assumptions

- Účet Resend a secrets `RESEND_API_KEY`, `REPORT_EMAIL_TO` zakládá vlastník sám.
- Workflow `rozhodnuti.yml` a `pripominka.yml` vzniknou se zapojením měsíčního běhu (spec 003); do té doby se report vyrábí ručně nebo z fixture.
