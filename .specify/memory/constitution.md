# Ústava Vládoměru

Vládoměr (vladomer.cz) sleduje plnění programového prohlášení vlády. Jediné, co web má, je důvěryhodnost. Ústava shrnuje zásady, podle kterých se posuzuje každá specifikace, plán i úloha. Podrobnosti a důvody (konkrétní incidenty, čísla, soubory) jsou v `CLAUDE.md`. Ústava je neopakuje, odkazuje na ně, aby dvě kopie neujížděly.

## Core Principles

### I. Na webu nesmí vyjít neověřené tvrzení (NON-NEGOTIABLE)

- Každé tvrzení, na kterém stojí stav bodu, je ověřené jedním ze dvou způsobů:
  - programem proti primárnímu záznamu (e-Sbírka, psp.cz, senat.cz);
  - nezávislým modelem s doslovnou citací, o které program zkontroluje, že ve zdroji opravdu je.
- Co ověřit nejde, se nezveřejní: bod zůstává na posledním ověřeném stavu.
- Podržený bod nedostane razítko `overeno`. „Prověřeno beze změny“ je tvrzení, že se někdo díval.
- Bod, jehož kontrola technicky selhala, je „nezkontrolovaný“, ne „v pořádku“.

### II. Program ví, model se neptá

- Nikdy se neptáme modelu na to, co program zná přesně: přechod stavu, datum minulého hodnocení, existenci a datum vyhlášení předpisu, stádium sněmovního tisku.
- Pravidla patří do kódu, ne do promptu.
- Každé pravidlo má jediné místo (`scripts/lib/dukaz.js`, `prechody.js`, `sbirka.js` …). Kontroly a přepočty ho importují, nikdy neopisují.
- Přísná metrika (`fulfilled / rated`, `unverifiable` mimo jmenovatel) je na pěti místech a ta se musí shodovat.
- Kde kontrola čte text od modelu, ptáme se, jak by v jejích očích vypadala sebejistá fabulace.

### III. Parita s main a zmrazené prompty

- Na větvi DEV2 platí:
  - texty, které model čte, a rozhodnutí programu nad stejnými odpověďmi modelu jsou bajtově stejné jako na `main`;
  - dokládá to nástroj parity (`scripts/dev/parita/`);
  - každý záměrný rozdíl je zapsaný v `vyjimky.json` se zdůvodněním.
- Změna hlídací knihovny se dělá nejdřív na `main` a do DEV2 se merguje.
- **Ve vydání A se `scripts/nastaveni/prompt-*.md` nemění.**
- Úprava promptů je samostatné vydání B a každá její změna se dokládá:
  - diffem `dump-prompts`;
  - měřením proti zlaté sadě.

### IV. Měří se shoda s realitou

- Každá změna modelu, promptu nebo brány přechodů se měří na **zlaté sadě**: body, jejichž skutečný stav potvrdil vlastník z primárních zdrojů.
- K tomu se změří stabilita (režim `stabilita`).
- Hodnoverný argument zní: „zlatá sada a měření“, ne „zní to rozumně“.
- Fixtures v testech se kopírují ze skutečných přepisů, nikdy se nevymýšlejí.
- Nové pravidlo se před zavedením přehraje přes celý korpus `audit.json` (`prehraj-*.js`). Jeho přínos i cena jsou v diffu toho přehrání.

### V. Append-only a poctivé opravy

- `audit.json` se jen doplňuje. Oprava je nový řádek s polem `oprava`, nikdy přepis.
- Nepravdivá věta se maže, nikdy se nepřepisuje vymyšlenou náhradou.
- Zamítnutý nebo podržený přechod ponechává **celý** předchozí záznam.
- Návrh modelu a verdikt kontroly se u podrženého bodu zapisují do auditu, aby šlo dohledat, co model chtěl a proč to neprošlo.

### VI. Design se nemění, jazyk je čeština

- Vzhled webu zůstává. Mění a přidávají se jen texty ve stávajících komponentách.
- UI, prompty, komentáře, specifikace a ústava jsou česky.
- Texty popisující proces (metodika, FAQ, stránka promptů, `/prehled/`, JSON-LD) se mění **ve stejném mergi** jako proces sám.
- Čísla v textech se generují z dat a nastavení, neopisují se.

### VII. Úplnost, rozpočet a bezpečnost

- Každý měsíční běh projde **všech 143 bodů a všechny kontroly**. Kvůli ceně se nic nevynechává ani neodkládá.
- Rozpočet:
  - běžný měsíc do 50 $;
  - fáze ladění do 80 $;
  - šetří se jen způsoby, které nic nevynechávají (Batch API, cachování, effort).
- Pojistka ceny chrání proti chybě v kódu, ne proti rozpočtu.
- Placený běh se nespouští bez suché zkoušky a odhadu ceny. Extrémně drahé modely jen se zdůvodněním a souhlasem vlastníka.
- Tajemství jsou jen v GitHub secrets. Ve sledovaných souborech, v `public/` ani v `dist/` nesmí být klíč, token ani e-mailová adresa. Kontroly hlásí jen číslo řádku, nikdy obsah.
- Příkazy z komentářů PR přijímá workflow jen od vlastníka a nikdy je nespouští jako kód.

## Brány kvality

Před každým commitem, který se týká toho, co pokrývají:
- sedm offline kontrol: `node scripts/dev/test-*.js`, z toho `test-konzistence.js` dělí výsledky na CHYBA / VAROVÁNÍ;
- nástroj parity (DEV2 ↔ main) bez nehlášeného rozdílu;
- u čehokoli, co může změnit vstup modelu: diff `dump-prompts` před a po;
- pre-commit hook zapnutý (`git config core.hooksPath scripts/dev/hooks`).

`test-konzistence.js` běží i nad čerstvými daty běhu **před** commitem. Selhání zastaví zveřejnění, takže web drží minulá data.

## Vývojový postup

- **Větve:** refaktor běží na `DEV2`. `main` je produkce: push na `main` jen buildí a nasazuje, hodnocení pouští plánovač nebo ruční dispatch.
- **Postup Spec Kitu pro každou změnu, která není drobná:**
  1. `/speckit-specify`, pak `/speckit-clarify`;
  2. `/speckit-plan`, pak `/speckit-tasks` a `/speckit-analyze`;
  3. `/speckit-implement`, pak `/speckit-converge`.
- Specifikace leží v `specs/NNN-nazev/`. Spec je živý kontrakt: objev z implementace se do něj vrací.
- Rozšíření Spec Kitu `git` (vlastní větve) a `agent-context` (přepisuje CLAUDE.md) se nepoužívají.
- **Plán každé specifikace má v sekci „Constitution Check“:**
  - dotčené invarianty z `CLAUDE.md`;
  - placené kroky s odhadem ceny;
  - dopad na paritu;
  - seznam textů webu, které se musí změnit spolu s procesem.
- **Dokumentace:** `CLAUDE.md` je podrobný provozní návod. `AGENTS.md` a `.agents/skills/` se z něj generují skriptem `scripts/dev/sync-agenti.js` a ručně se needitují.

## Governance

- Ústava má přednost před zvyklostmi. Kde se s ní plán rozchází, uvede to v „Complexity Tracking“ se zdůvodněním.
- Ústavu mění jen vlastník. Změna se zapisuje se zvýšenou verzí a datem:
  - MAJOR = zásada zrušena nebo obrácena;
  - MINOR = zásada přidána;
  - PATCH = upřesnění.
- Při rozporu s `CLAUDE.md` platí přísnější výklad a rozpor se opraví v obou.

**Version**: 1.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
