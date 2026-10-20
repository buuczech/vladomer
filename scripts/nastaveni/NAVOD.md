# Návod: co se tu dá měnit

V této složce je všechno, co ovlivňuje týdenní hodnocení a nevyžaduje zásah
do programu. Soubory jsou obyčejný text — otevři, uprav, ulož.

**Ukládej vždy v kódování UTF-8.** V Poznámkovém bloku: *Uložit jako →
Kódování: UTF-8*. Jinak se rozbije diakritika a běh se zastaví chybou.

| Soubor | Co obsahuje |
|---|---|
| `prompt-hodnoceni.md` | Zadání pro model, který hodnotí jednotlivé body programu |
| `prompt-doptani.md` | Krátká žádost, kterou model dostane, když místo hodnocení napíše rozbor a program jeho odpověď nedokáže přečíst |
| `prompt-zpravy.md` | Zadání pro výběr „Hlavních zpráv týdne" |
| `prompt-korektura.md` | Zadání pro jazykovou korekturu hotových textů |
| `nastaveni.txt` | Čísla a model — kolik zdrojů, jak přísné hodnocení, kolik zpráv |
| `nemeritelne.txt` | Body, které jsi rozhodl jako neměřitelné — program je tak vede vždy, model o tom nerozhoduje |
| `weby-hodnoceni.txt` | Weby, ze kterých se smí čerpat při hodnocení |
| `weby-zpravy.txt` | Weby pro zprávy týdne (užší seznam, jen zpravodajství) |

## Co se nesmí měnit

**Zástupné texty ve složených závorkách** — `{{NAZEV_OBLASTI}}`, `{{SEZNAM_BODU}}`
a podobné. Program do nich před odesláním dosazuje skutečné hodnoty. Když je
přejmenuješ nebo smažeš, běh se zastaví.

**Názvy polí v uvozovkách na posledním řádku promptů** — `"comment_cs"`,
`"evidence_date"`, `"url"` a podobně. Program podle nich čte odpověď modelu.
České popisky *uvnitř* těch uvozovek (např. `"2–3 věty, vyvážené ano-ale/ne-ale"`)
měnit můžeš a je to jedna z nejužitečnějších úprav — mění se tím styl komentářů.

## Když něco pokazíš

Nic hrozného se nestane. Běh se zastaví **ještě před** voláním API, vypíše česky,
co je špatně a kde, a na webu zůstanou data z minulého týdne. Ukázka:

```
CHYBA V NASTAVENÍ — běh se nespustil, na webu zůstávají data z minulého týdne.

  prompt-hodnoceni.md: neznámý zástupný text {{OBLAST}} — program pro něj nemá hodnotu.
```

## Jak si změnu vyzkoušet, aniž bys utratil peníze

Z kořenové složky projektu:

```
ANTHROPIC_API_KEY=x node --import ./scripts/dev/dump-prompts.js scripts/evaluate.js
```

Vypíše přesně to, co by se odeslalo do API, ale nic neodešle a nic nezaplatíš.
Datové soubory zůstanou nedotčené.

## Pozor na souvislosti

- V `prompt-korektura.md` je oddíl „CO NESMÍŠ ZMĚNIT". Neškrtej z něj. Program
  sice každou opravu kontroluje a podezřelou zahodí, ale prompt je první obrana
  — bez něj se bude většina oprav zahazovat a korektura přestane být k něčemu,
  aniž by to bylo poznat jinak než z logu.
- Korekturu si můžeš vyzkoušet zdarma: `node scripts/dev/test-korektura.js`
  vypíše prompt, ukáže všechny mechanické opravy na ostrých datech a ověří,
  že kontrola faktů odmítá podvržené opravy.

- Seznam v `weby-hodnoceni.txt` je popsaný i v metodice na webu
  (`src/App.jsx`, sekce „Povolené zdroje"). Po změně uprav i ji, ať web netvrdí
  něco jiného, než co se doopravdy děje.
- Když do seznamu přidáš web, který blokuje vyhledávacího robota (např.
  `idnes.cz`, `lidovky.cz`), **selže celý dotaz**, ne jen ten jeden web.
- Vyšší hodnoty u `vyhledavani_*` znamenají důkladnější, ale dražší běh.
  Hodnocení běží 18× za týden, sběr zpráv jen jednou.

## Stabilizace hodnocení (od srpna 2026)

Týdenní běh už nehodnotí všech 143 bodů znovu. Nejdřív proběhne **sken
událostí** (`prompt-delta.md`): u každé oblasti se model ptá jen na to, co se
od minulého běhu stalo. Přehodnocují se pak pouze body s nalezenou datovanou
událostí; ostatní drží stav z minula a dostanou jen razítko „prověřeno".

Změna stavu **z nebo do „splněno" či „porušeno"** musí navíc projít ověřením
(`prompt-overeni-prechodu.md`): silnější model dostane úzkou otázku, jestli
doklad ten přechod opravdu nese, s výchozí odpovědí NE. Zamítnutý přechod
znamená, že bod podrží minulé hodnocení celé.

Posun mezi ostatními stavy („jen deklarováno“, „nezahájeno“, „probíhá“,
„částečně splněno“) se ověřuje taky, pokud je zapnuté
`overovat_prostredni` — ale mírnější šablonou (`prompt-overeni-prostredniho.md`).
Tam stačí datovaný krok, třeba předložení návrhu nebo první čtení; dokončený
zákon se vyžaduje jen u „splněno“. Bez toho stačilo k posunu bodu to, že sken
něco našel — a sken se sám se sebou shodne jen z 55 %, protože vyhledávání
vrací pokaždé jiné výsledky.

Jednou za `plny_audit_dni` dnů proběhne **plný audit** všech bodů — pojistka,
aby zmeškaná událost nezůstala zmeškaná navždy.

Ověřovatel si doklad **dohledává** (`vyhledavani_overeni`). Bez toho kontroluje
jen to, jestli tvrzení dává smysl — a vymyšlené číslo zákona dává smysl
dokonale. 21. 8. 2026 kvůli tomu prošlo „splněno" s dokladem „Zákon
č. 270/2026 Sb., vyhlášen 26. 5. 2026", který vznikl z toho, že Sněmovna toho
dne přehlasovala veto Senátu.

Týdenní běh navíc **drží přechod opřený o starý doklad** (`drzet_stary_doklad`):
když model změnu stavu zdůvodní krokem, který se stal dřív, než bod do
dosavadního stavu vůbec vstoupil, nejde o novou událost a stav se nehne.
Plný audit takový přechod nezadrží, jen ho v logu vypíše „ke kontrole" — má
totiž zachytit právě zmeškané starší události. Dřív to hlídal jen ověřovatel
a nekonzistentně: 18. 9. 2026 pustil „splněno" u daňových odpočtů na výzkum,
které zavedla předchozí vláda. Co by pravidlo udělalo s dosavadními přechody,
ukáže `node scripts/dev/prehraj-stary-doklad.js`.

**Čísla předpisů ověřuje program v e-Sbírce** (`rejstrik_sbirky`). Model Sbírku
zákonů sám nevidí — e-Sbírka je aplikace, kterou vyhledávače skoro neindexují —
a čísla si domýšlel, nebo citoval skutečný předpis k jinému tématu. Teď dostane
seznam zákonů, nařízení vlády a vyhlášek vydaných od nástupu vlády a program
každé citované číslo ověří: neexistující číslo „splněno“ neunese a datum
vyhlášení se u „splněno“ vezme z e-Sbírky (opraví se i v textu dokladu). Jestli se předpis slibu týká, posoudí
ověřovatel, který dostane jeho oficiální název a u „splněno“ i začátek jeho
znění — samotný název nestačí, „novela stavebního zákona“ může jen posouvat
lhůtu. Seznam je vidět i v sekci
„Použité prompty“ (v ukázce zkrácený).

K tomu patří nová nastavení v `nastaveni.txt`: `plny_audit_dni`,
`overovat_prechody`, `overovat_prostredni`, `overovaci_model`,
`vyhledavani_overeni`, `vyhledavani_delta`, `drzet_stary_doklad` a `rejstrik_sbirky`. Každé má
komentář přímo u sebe.

Na co si dát pozor:

- `prompt-delta.md` je jediné místo, které rozhoduje, co se vůbec bude
  hodnotit. Když z něj vyškrtneš důraz na důkladné hledání, běh zlevní, ale
  web začne zaspávat události — a pozná se to až při plném auditu.
- V `prompt-overeni-prechodu.md` je výchozí odpověď NE schválně. Když ji
  otočíš, ověření přestane plnit svou roli a zůstane z něj drahé razítko.
- `overovat_prostredni` se platí každý týden a zabere nejčastěji právě tam,
  kde je posun sporný. Když ho vypneš, web bude reagovat rychleji, ale začne
  se víc házet sem a tam.
- Všechny prompty se zobrazují na webu v sekci „Použité prompty" — po změně
  se na ně tam podívej, jestli dávají smysl i pro čtenáře.

## Silnější modely a cena běhu (od října 2026)

Model se mění jen v `nastaveni.txt` (`model`, `overovaci_model`,
`korektura_model`). Program podle názvu modelu sám pozná, jak ho volat:
dnešní modely (`claude-haiku-4-5…`, `claude-sonnet-4-6`, `claude-opus-4-6`)
dostanou přesně totéž co dřív, modely s přemýšlením (`claude-sonnet-5-5`,
`claude-opus-5-5` a další z řady 5) se volají jinak — bez „teploty“, kterou
odmítají, a s přemýšlením. Model, který program nezná, nebo překlep v názvu
zastaví běh hned na začátku, ještě než se cokoli zaplatí.

Nová nastavení, každé s komentářem u sebe:

- `effort_hodnoceni`, `effort_kontroly` — jak hluboko model s přemýšlením
  přemýšlí (`low` až `max`). U dnešních modelů se nepoužijí.
- `pojistka_ceny_usd` — kolik smí jeden běh nejvýš stát. Není to rozpočet,
  ale pojistka proti chybě v programu: po překročení se už nic neodešle,
  běh skončí chybou a na webu zůstanou předchozí data.

- `faktcheck_kalibrace` — 1 = každá změna stavu počká na tvoje schválení,
  i když ji kontrola faktů potvrdila (první dva měsíční běhy); 0 = ověřené
  změny jdou na web samy a k tobě přijdou jen sporné body.

Kolik který běh stál, je vidět na konci logu („Cena běhu: …“) a v souboru
`public/naklady.json`.

Na co si dát pozor:

- **Nejdřív měřit, pak měnit.** Model se vybírá podle shody se zlatou sadou
  (body, jejichž skutečný stav jsi potvrdil). Měření se spouští změnou
  souboru `scripts/dev/mereni.json` na větvi DEV2: vyplní se model, režim
  `zlata-sada` a do „schvaleno“ kdo a kdy placený běh schválil — bez toho
  se nic nespustí ani nezaplatí. Nic se tím nezveřejní a výsledek (shoda
  stavu, předpisu a data, cena) je vidět v souhrnu běhu na GitHubu.
- Ověřovatel a korektor mají být silnější než hodnotitel — slabší model
  neuhlídá úsudek silnějšího. Na webu to tak i stojí v metodice.

## Tvoje rozhodnutí, která drží program (od října 2026)

Jestli je slib tak obecný, že jeho splnění nejde změřit, je vlastnost jeho
znění — ne toho, co se stalo. Proto o tom rozhoduješ ty, jednou, a program to
pak drží: body v `nemeritelne.txt` dostanou „neměřitelné“ při každém hodnocení,
ať model napíše cokoli, a nezapočítávají se do procent. Řádek je číslo bodu
a za `#` důvod. Překlep v čísle bodu zastaví běh hned na začátku.

Rozhodnutí o tom, JAK hodnotit (co je „deklarováno“ a co „probíhá“, kdy je
odklad porušení…), program držet nemůže — to jsou pravidla pro model a patří
do promptu. Tvoje pravidla M1–M10 ze zlaté a kontrolní sady se do promptu
dostanou ve vydání B, změřeně.
