# UI a UX

Ptáš se, jestli návštěvník pochopí, co mu web říká, a jestli se k tomu vůbec
dostane. Netýká se to jen vzhledu — nejhorší nálezy v téhle oblasti jsou ty,
kde stránka ukáže číslo, které se dá špatně přečíst.

## Na čem to zkoušet

Kontroluj **sestavený web**, ne dev server. Stránky `/prehled/` a `/overview/`,
strukturovaná data v `index.html` a `prompty.json` vznikají až buildem
a na `npm run dev` prostě nejsou:

```bash
npm run build
```

Pak otevři náhled přes `preview_start` s konfigurací `vladomer-build`
(`npm run preview`, port 4173). Když ji `.claude/launch.json` nemá, doplň ji —
ten soubor je lokální a `.gitignore` ho vylučuje, takže tím nic nezveřejníš.
Pro rychlé iterace při opravách stačí `vladomer-dev`.

## Co projít

**Všechny stránky.** Hlavní přehled plus položky menu: O projektu, Časté
dotazy, Použité prompty, Grafy, Podpořit, Náměty. Modál s metodikou. Kterou
položku menu vidíš, řídí příznaky `VITE_MENU_*` v `.env` a ten se **liší podle
větve** — na `main` je `VITE_MENU_SUPPORT=false`. **Ověřuj proklikáním, ne
grepem v bundlu**: texty stránek se do balíčku zkompilují tak jako tak,
příznak rozhoduje jen o tom, jestli je položka v menu.

**Obě jazykové verze.** Přepni na angličtinu a projdi totéž. Hledej české
řetězce, které zůstaly nepřeložené, a čísla zapsaná českou konvencí (desetinná
čárka, mezera před `%`) tam, kde má být anglická.

**Mobil i desktop.** Podstatná část návštěv chodí z Instagramu, tedy
z telefonu. `resize_window` na preset `mobile` (375×812) a `desktop`
(1280×800). Na mobilu si všímej vodorovného přetékání, uříznutých tabulek
a prstenců, které se nevejdou.

**Světlý i tmavý režim.** `resize_window` s `colorScheme`. Barvy stavů jsou
definované jako CSS proměnné a tmavý režim je přepisuje — legenda, odznaky
i prstence musí zůstat rozlišitelné v obou.

## Na co se dívat

**Čísla se nesmí dát přečíst špatně.** Nejdražší vada téhle oblasti.
Prstence jsou skládané oblouky a jejich délka je záměrně zkrácená o šířku
tahu, aby zaoblený konec segment nenafoukl — 5,7 % vykreslené jako 9,1 % je
lež, i když je v datech pravda. Ověř, že **legenda sedí na to, co je
namalované**, a že segment, který je v číslech nejmenší, je i opticky
nejmenší. Podrobnosti a proč to tak je má `CLAUDE.md`.

**Pomlčka místo nuly.** Když není co hodnotit, web ukazuje `–`, ne `0 %`.
Nula tvrdí „nic nesplněno“, pomlčka tvrdí „nevíme“ — a to je rozdíl, kvůli
kterému to tak je.

**Přiznaný rozpor je vidět.** U bodů s `evidenceMissing` stojí nad komentářem
odznak „částečně splněno“, ačkoli komentář mluví o splnění. Web to vysvětluje
textem „Model uvedl «splněno». Automatická kontrola dokladu ho nepotvrdila:“
plus konkrétním důvodem. Ověř, že to vysvětlení je opravdu vidět a čitelné,
ne schované pod rozbalovátkem — bez něj to vypadá, že si stránka protiřečí.

**Navigace dává smysl.** Dostane se návštěvník z libovolné stránky zpátky?
Pozná, kde je? Vede pořadí položek v menu od „co to je“ k „jak to funguje“,
jak zamýšlí komentář u `MENU_ORDER`?

**Vyhledávání a filtry.** Najde hledání slovo s diakritikou i bez ní? Co
udělá prázdný výsledek — řekne to, nebo jen zmizí obsah? Jde filtr zrušit?

**Zdroje a odkazy.** Každý odkaz ven se otevírá do nové karty a je u něj vidět,
kam vede (doména). Mrtvý odkaz je nález pro oblast `fakta`, ale odkaz, u kterého
není poznat, kam míří, je nález sem.

## Přístupnost

Není to formalita: čitelnost čísel je celý smysl tohohle webu.

- **Kontrast.** Barvy stavů proti pozadí v obou režimech. Zvlášť si všímej
  stavu „nezahájeno“ — používá proměnnou `--muted`, tedy tlumenou barvu
  určenou pro vedlejší text, ne pro nosnou informaci.
- **Barva nesmí být jediný nositel významu.** Každý stav má vedle barvy i znak
  a název. Ověř, že to platí všude, i v legendě a v grafu.
- **Klávesnice.** Projdi hlavní cestu tabulátorem. Je vidět, na čem stojíš?
  Jdou modály (metodika, stránky menu) zavřít Escapem a vrátí focus tam,
  odkud se otevřely?
- **Struktura.** `read_page` vrátí strom — nadpisy mají jít po úrovních,
  obrázky mají mít alternativní text, tlačítka mají mít název.

## Výkon

`public/evaluations.json` má přes 250 kB a stahuje se při každém načtení
stránky, spolu s `history.json` a `news.json`. Na mobilním připojení to je
znát. `audit.json` (přes 800 kB) se za běhu **nenačítá** — kdyby se to někdy
změnilo, je to vážný nález.

Změř, co stránka opravdu stahuje (`read_network_requests`), a řekni to
číslem. Návrhy typu „rozdělit data“ ale patří do kategorie **námět**: web má
fungovat i bez serveru a jednoduchost je tu vědomá cena.

## Konzole a chyby

`read_console_messages` musí být čistá. Varování Reactu o klíčích nebo
o neplatných atributech jsou drobné nálezy, výjimka je vážný. Zkontroluj
i `read_network_requests` na požadavky, které skončily chybou — typicky
soubor, který se přejmenoval a nikdo si toho nevšiml.

## Co nenavrhovat

Přepis na komponentovou strukturu, návrhový systém nebo knihovnu komponent.
`src/App.jsx` je jeden velký soubor záměrně a v `CLAUDE.md` je to napsané.
Nálezy v téhle oblasti se opravují bodově.
