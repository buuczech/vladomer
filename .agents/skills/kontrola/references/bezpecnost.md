# Bezpečnost

Otázka nezní „jde web hacknout“. Vládoměr je statický web na GitHub Pages, bez
serveru, bez databáze a bez přihlašování — přes prohlížeč se ukrást nedá,
protože tam není co ukrást. **Reálné riziko je jinde: že někdo přepíše, co web
tvrdí, nebo něco vydá jeho jménem.** Pro projekt, jehož jediný kapitál je
důvěryhodnost, je to horší než výpadek.

Proto se prochází pět vrstev v tomhle pořadí — od té, kde by škoda byla
největší.

## Report se nezveřejňuje

**Nálezy z téhle oblasti nepatří do commitu, do popisu commitu, do issue ani
do pull requestu.** Repozitář je veřejný; popis zranitelnosti v něm je
zveřejnění dřív, než je opravená. Report jde do `kontroly/`, což `.gitignore`
vylučuje. Až se nález opraví, commit popisuje opravu, ne díru.

## 1. Účty a tokeny — kdo může promluvit jménem Vládoměru

Nejdražší scénář: někdo přepíše publikovaná data nebo vydá příspěvek na
Instagram. Obojí se tváří jako projekt sám.

- Kdo má do repozitáře zápis a je u těch účtů dvoufaktorové ověření?
- Které workflow má `permissions: contents: write` a co všechno může
  commitnout? Je ten rozsah opravdu potřeba?
- Kde v běhu jsou v prostředí dostupné `IG_ACCESS_TOKEN` a `IG_USER_ID`?
  Nastavené na úrovni jobu jsou v prostředí **všech** kroků, včetně
  `checkout` — když stačí jen jednomu kroku, patří k němu.
- Platí pořád, že `media_publish` volá jediné místo (`scripts/lib/instagram.js`)?
  Ten chokepoint drží pojistku proti dvojímu vydání a nesmí se obejít.
- Chová se pořád `adhoc.js` tak, že značku „publikováno“ commitne **před**
  zveřejněním? Nevydaný příspěvek je opravitelný, duplicita na profilu ne.

## 2. Dodavatelský řetězec

Závislosti jsou dvě (`react`, `react-dom`) plus dvě vývojové, takže plocha je
malá — o to snazší je ji udržet čistou.

- Používají workflow `npm ci`, nebo `npm install`? `install` smí v rozsahu
  `^` sáhnout po novější verzi a přepsat `package-lock.json`, takže **v CI se
  zamčené verze nevynucují** a build není reprodukovatelný.
- Jsou akce připnuté na SHA, nebo na značku? Značka se dá přesunout. Dnes jsou
  všechny akce od `actions/*` (první strana), takže je to spíš **námět** než
  vážný nález — ale ověř, že nepřibyla akce třetí strany, u které to platí
  jinak.
- Odpovídá `package-lock.json` tomu, co je v `package.json`?

## 3. Injektáž do workflow

Cokoli, co se z `${{ … }}` vloží přímo do těla `run:`, je vykonaný shell.

- Projdi všechna čtyři workflow v `.github/workflows/` a najdi, kde se do
  `run:` interpoluje vstup — `inputs.*`, `github.event.*`, výstup kroku.
  Známý případ: `inputs.zadani` v `instagram.yml`, v jobu, který má token
  k Instagramu a právo zapisovat do repozitáře. Vyžaduje to zápis do
  repozitáře, takže to není díra pro kohokoli zvenčí, ale je to nejjasnější
  cíl na zpevnění. Řeší se předáním přes `env:` a odkazem `"$PROMENNA"`.
- Nemá žádné workflow spouštěč `pull_request_target`? Dnes nemá žádné
  workflow ani `pull_request` — kdyby přibylo, je to **kritické** a je třeba
  se podívat, co všechno by fork mohl spustit.

## 4. Úniky klíčů

- Je `.env.local` pořád mimo git a `.env` pořád bez tajemství? `.env` je
  commitnutý schválně, jsou v něm jen příznaky `VITE_MENU_*`.
- Neprosákl klíč do `dist/`? Vite vystavuje jen proměnné s předponou `VITE_`,
  takže by neměl — ověř to hledáním v sestaveném balíčku, ne úvahou.
- Funguje pojistka v `scripts/dev/hooks/pre-commit`? Zná tvary klíčů, které se
  tu opravdu používají? Známá mezera: klíč Anthropicu ve tvaru `sk-ant-…`
  vzorům neodpovídá. A naopak vzor na facebookový token falešně chytá
  zakódovaná písma v `public/bmc-*.svg`.
- Hook není v čerstvém klonu zapnutý sám; zapíná se
  `git config core.hooksPath scripts/dev/hooks`.

**Když hook nebo cokoli jiného ohlásí nález, nikdy nevypisuj obsah řádku** —
jen číslo řádku a soubor. Výpisy z běhů i přepisy sezení se ukládají, takže
vypsaný klíč by se jen přestěhoval jinam. Hook to tak dělá schválně a je za
tím zaplacená zkušenost.

## 5. Klientská vrstva a integrita dat

Poslední, protože je nejméně ohrožená — ale ne bez nálezů.

- **Adresy z modelu se vykreslují do `href` bez kontroly schématu**
  (zprávy i zdroje v `src/App.jsx`). Dnes je to nedosažitelné, protože
  vyhledávání smí vracet jen domény z `weby-*.txt` a `evaluate.js` navíc
  zahodí odkaz, který se ve výsledcích hledání nevyskytl. Ale je to strážené
  jen v pipeline — proti vlastní zásadě projektu, že strážci patří do kódu.
  Kontrola schématu při vykreslení je levná a patří tam. **Vážné.**
- Text z modelu se vykresluje jako obsah JSX, takže ho React escapuje.
  Ověř, že se nikde neobjevilo `dangerouslySetInnerHTML` — dnes nikde není.
- Odkazy ven mají `target="_blank"` i `rel="noopener noreferrer"`. Dnes
  všechny; nový odkaz bez toho je **drobné**.
- Strukturovaná data se do `index.html` vkládají nahrazením řetězce
  `</head>`. Vstup je číselný souhrn, ne volný text, ale je to místo, kde by
  se sekvence `</script>` v datech dostala do HTML. Stojí za pojistku.
- Souhlas s cookies: analytika se načítá **až po souhlasu**, ne
  z `index.html`, a odvolání souhlasu stránku znovu načte, protože už
  spuštěné měření jinak běží dál. Ověř, že to pořád platí — je to jediné
  místo, kde web někam posílá data o návštěvníkovi.
- **Integrita historie.** `public/audit.json` je append-only a web to slibuje
  na třech místech. Přepsaný starší záznam je **kritické**; hlídá to
  `test-konzistence.js`, skupina G, proti verzi v gitu.

## Co je dnes v pořádku a nemá se „opravovat“

Aby report neopakoval, co už je vyřešené: žádné workflow nemá `pull_request`
ani `pull_request_target`; nikde není `dangerouslySetInnerHTML`; odkazy ven
mají konzistentně `rel="noopener noreferrer"`; analytika je za souhlasem;
publikaci na Instagram drží jediný chokepoint; značka „publikováno“ se
commituje před vydáním; a hook hlásí čísla řádků bez obsahu. Když některá
z těch vlastností zmizí, **to** je nález.
