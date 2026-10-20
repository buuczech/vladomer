# Code review

Tenhle repozitář nemá linter, nemá typy a `src/App.jsx` má přes 1600 řádků.
Nic z toho není opomenutí — je to napsané v `CLAUDE.md` jako rozhodnutí.
**Měřítkem tedy nejsou obecné dobré mravy, ale invarianty projektu a to, co
se reálně rozejde.** Recenze, která navrhne rozsekat `App.jsx` na komponenty
nebo přidat TypeScript, je pro tenhle projekt šum.

Čtyři otázky, v tomhle pořadí.

## 1. Udržovatelnost: co se rozejde?

Projekt má několik míst, kde totéž pravidlo žije vícekrát. U každého se ptej:
**shodují se dnes, a pozná se, když se rozejdou?**

| co | kde | co hlídá |
|---|---|---|
| přísná metrika `splněno / hodnocené` | `src/App.jsx` (`donePct`), `scripts/og-image.js`, `scripts/lib/seo.js`, `scripts/lib/prehled.js`, `scripts/instagram/post.js` | `test-konzistence.js`, skupina F |
| tabulka stavů a jejich názvů | `App.jsx` (`STATUS`), `lib/prompty.js` (`STATUS_CS`), `lib/korektura.js` (`STAV_POPIS`), `instagram/post.js` (`NAZEV`), `lib/prehled.js` | nic — projdi ručně |
| geometrie oblouků prstence | `App.jsx` (`Ring`), `instagram/post.js` (`oblouk`) | nic — projdi ručně |
| vysvětlivky degradace | `App.jsx` (`demotedWhy`), `lib/prehled.js` | `test-konzistence.js`, skupina C |

Duplicita sama o sobě není vada — u prstenců je záměrná, aby se nemuselo
sdílet přes hranici `src`/`scripts`, a `CLAUDE.md` to zdůvodňuje. Vada je
duplicita, o které se neví. Když najdeš pátou kopii metriky, kterou nikdo
nehlídá, je to **vážné**.

Šestá kopie, o které víme: `scripts/dev/prepocet-degradaci.js` počítá souhrn
jiným jmenovatelem. Je to vývojářský výpis, nepublikuje se — **drobné**, ale
patří do reportu, protože zní jako publikované číslo.

## 2. Standardy: co je v tomhle repozitáři load-bearing

Věci, které vypadají jako kosmetika a nejsou:

- **Text chybových hlášek.** `withBackoff` v `scripts/evaluate.js` se
  rozhoduje, jestli opakovat, podle toho, co je ve zprávě: `/API (429|5\d\d)/`,
  `/JSON/` a značka `[opakovat]`. Přeformátovaná hláška tiše vypne opakování.
  Zvlášť si všímej hlášky v `korektura.js`, která obsahuje slovo „JSON“
  schválně, ačkoli o JSON nejde.
- **Přísnost `render()`** v `lib/nastaveni.js`. Neznámý zástupný text, nepoužitá
  hodnota i jakékoli zbylé `{{` běh zastaví. Jakékoli změkčení téhle funkce
  je **vážné**: je to poslední pojistka, aby se rozbitá šablona nedostala na
  veřejný web.
- **`assertFields` a `preflight`.** Ověřují, že prompt pořád obsahuje názvy
  polí, které parser čte, a dělají to **před** prvním placeným voláním.
  Kontroluj, že seznam polí odpovídá tomu, co parser opravdu čte.
- **`base: "./"` ve `vite.config.js`.** Drží build funkční z domény i z cesty
  projektu na github.io.
- **Kódování a konce řádků.** `scripts/nastaveni/` je připnuté na LF
  v `.gitattributes`, protože se čte za běhu, a `readText()` odmítne soubor
  uložený v CP1250. Změna kterékoli z těch dvou pojistek je **vážné**.

## 3. Opravitelnost: dá se každé číslo přepočítat?

Publikované číslo, které nejde bez modelu ověřit, je pro projekt tohohle typu
slepé místo. Vzorem je `lib/dukaz.js`: pravidlo bydlí zvlášť právě proto, aby
šlo pustit znovu nad už zveřejněnými daty (`scripts/dev/prepocet-degradaci.js`)
a nemuselo se kopírovat.

Ptej se u nového nebo změněného kódu:

- Je pravidlo oddělené od běhu, který ho použil?
- Existuje offline cesta, jak výsledek přepočítat bez placeného volání?
- Je změna zachytitelná některým ze tří testů? Když ne, patří sem nový test.
  Sem míří i **guards belong in code, not prompts**: pravidlo, které existuje
  jen jako věta v promptu, model dřív nebo později obejde. Ověřené případy
  z minulosti popisuje `CLAUDE.md`.

Po jakékoli změně, která může měnit to, co model dostane, pořiď výpis promptů
před i po a porovnej je. Prázdný rozdíl je důkaz:

```bash
ANTHROPIC_API_KEY=x CHAPTER_LIMIT=18 node --import ./scripts/dev/dump-prompts.js scripts/evaluate.js > po.txt
```

## 4. Dohledatelnost: pozná se, proč to tak je?

V tomhle repozitáři nese skoro každé netriviální pravidlo komentář s důvodem,
často i s tím, co se stalo, když tam nebylo. Není to zdvořilost — je to hlavní
obrana proti tomu, aby někdo příště strážce „zjednodušil“. Klasický případ je
`\p{L}` v `lib/dukaz.js`: bez komentáře vypadá jako zbytečná komplikace, ve
skutečnosti bez něj kontrola tiše neplatí pro nic s českou koncovkou.

Nález je tedy: **netriviální pravidlo bez důvodu, nebo komentář, který
neodpovídá kódu pod sebou.** Zastaralý komentář je horší než žádný.

Sem patří i dohledatelnost na úrovni dat, o kterou uživatel žádal:
`public/audit.json` je append-only, web to slibuje na třech místech (metodika,
časté dotazy, „jak vím, že si to nevymýšlíte“) a opravy se připojují jako nový
záznam s polem `oprava`. Ověřuje to `test-konzistence.js`, skupina G. Jakýkoli
kód, který by přepsal existující záznam, je **kritické**.

## Jak to projít

Nesnaž se přečíst celý repozitář. Výnos v tomhle pořadí:

1. **Rozdíl proti poslednímu commitu nebo proti stavu při minulém reportu** —
   nový kód je ten, který ještě nikdo neprověřil.
2. **Tabulka duplicit výše** — projdi ji celou, je krátká.
3. **`scripts/evaluate.js` a `scripts/lib/`** — tady je uložená veškerá
   logika, na které stojí důvěryhodnost výstupu.
4. **`src/App.jsx`** vzorkem, se zaměřením na výpočty a na to, co se vykresluje
   z modelem vytvořeného textu.

## Co nenavrhovat

Rozdělení `App.jsx`, TypeScript, linter, formátovač ani testovací framework —
pokud si o to uživatel neřekne. Jsou to vědomá rozhodnutí a navrhovat je
znovu při každé kontrole je jen šum, ve kterém zapadnou skutečné nálezy.
Když máš pro některé z nich opravdu silný argument, uveď ho jako **námět**,
jednou, s odůvodněním, co konkrétně by to zachytilo.
