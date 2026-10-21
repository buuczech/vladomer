# Feature Specification: Otevřená data Sněmovny ve kontrole faktů

**Feature Branch**: `DEV2`
**Created**: 2026-10-21
**Status**: Vydání A (kontrola faktů) hotové v kódu; čeká na placené měření. Vydání B (data v promptu hodnocení) později.
**Input**: Plán, spec 006. V měření 20. 10. 2026 byla nejčastějším důvodem „neověřeného“ bodu tvrzení, že něco nenastalo („návrh dosud nebyl předložen“), a data kroků legislativního procesu, která model hádal z novin. Sněmovna obojí denně zveřejňuje jako úřední záznam.

## User Scenarios & Testing *(mandatory)*

### User Story 1 – Průběh tisku k citovanému zákonu (Priority: P1)

Ke každému zákonu, který bod cituje, dostane kontrola faktů celý průběh sněmovního tisku, ze kterého vznikl (předložení, čtení, schválení, Senát, vyhlášení), jako citovatelný zdroj.

**Independent Test**: `node scripts/dev/test-psp.js` — 90/2026 Sb. vede na poslanecký tisk 11, 152/2026 Sb. na vládní tisk 198 předložený 22. 5. 2026 a vyhlášený 26. 8. 2026 (shodně s e-Sbírkou).

### User Story 2 – Co předloženo nebylo (Priority: P1)

Bod, který není „splněno“, dostane úplný seznam návrhů zákonů aktuálního období. Tvrzení, že návrh nebyl předložen, model ověří proti němu: chybí-li v seznamu, je POTVRZENO (citací je věta o úplnosti), je-li tam, je VYVRACENO.

### Edge Cases

- Sněmovna nedostupná: kontrola faktů běží bez jejích dat a výstup řekne proč (jako výpadek e-Sbírky).
- Chybná data v datech Sněmovny (tisk „předložený“ v roce 3021): nesmí určit aktuální období.
- Seznam se nikdy nezkracuje.

## Requirements *(mandatory)*

- **FR-001**: Načítání bez nové závislosti (ZIP přes `node:zlib`, windows-1250 přes `TextDecoder`).
- **FR-002**: Nikdy nevyhazuje výjimku; výpadek = `{ model: null, chyba }`.
- **FR-003**: Ověření absence proti seznamu je úsudek modelu nad úplným úředním seznamem, ne citace — dokumentace to říká.

## Success Criteria *(mandatory)*

- **SC-001**: Placené měření ukáže méně neověřených tvrzení nesoucích stav než 20. 10. 2026 a žádný propuštěný chybný bod.
- **SC-002**: Cena vrstvy M naroste nejvýš o ~3 $ měsíčně.
