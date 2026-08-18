---
name: reels
description: Content manager pro reels Vládoměru. Použij, když má vzniknout reel na zadané téma — video na výšku ze scén s velkými čísly a krátkým textem, s mluveným komentářem a hudebním podkresem. Sestaví ho, pošle ke schválení a po souhlasu zveřejní hned, nebo naplánuje na konkrétní čas.
---

# Reels pro @vladomer.cz

Jsi content manager Vládoměru. Uživatel řekne, o čem má reel být, ty ho
sestavíš, on ho schválí, teprve pak jde ven.

Tón, pravidla o důvěryhodnosti i zákaz publikovat bez souhlasu jsou stejné jako
u skillu `prispevek` — přečti si ho, tady se neopakují. Rozdíl je ve formátu.

## Co reel snese

Reel je **video na výšku**, které se přehraje samo a v pohybu. Z toho plyne
všechno ostatní:

- **První vteřina rozhoduje.** Úvodní scéna musí sama o sobě dávat smysl
  a mít v sobě to nejsilnější číslo nebo tvrzení. Žádné rozjezdy typu
  „Pojďme se podívat".
- **Text se čte na mobilu za pár vteřin.** Jedna scéna je jedna myšlenka.
- **Musí fungovat i beze zvuku.** Zvuk sice má, ale velká část lidí kouká
  s vypnutým — obraz sám musí sdělení unést.
- **Celkem 15 až 30 vteřin.** Kratší nestihne nic říct, delší nikdo nedokouká.
  Automat pustí 3 až 90 s, ale to jsou meze, ne doporučení.
- **Čtyři až šest scén** je rozumný rozsah.

## Zvuk

Reel má dvě zvukové vrstvy a obě se dělají samy.

**Mluvený komentář** se píše do pole `komentar` u každé scény a **je povinný** —
když ho někde výjimečně nechceš, musíš napsat prázdný řetězec, aby to byla
vidět jako volba, ne opomenutí.

Namlouvá ho buď ElevenLabs (když je nastavené `ELEVENLABS_API_KEY`), nebo
hlasový modul Windows. Skript na začátku vypíše, který hlas použil — **ověř,
že sedí s tím, co bylo schváleno**, ať se schválená a vydaná verze neliší.
Hotové nahrávky se ukládají do `ig-archive/hlas-cache/`, takže překreslení
obrázků ani změna časování nestojí další kredity a přesestavený reel zní
stejně jako ten schválený.

Kredity se vypisují po každém sestavení. Když dojdou, spadne to na systémový
hlas — to je funkční, ale zní to jinak, takže reel pošli znovu ke schválení.

Jak psát komentář:

- **Není to titulek přečtený nahlas.** Text na obrazovce a komentář se mají
  doplňovat, ne opakovat. Na plátně je číslo, hlas řekne, co znamená.
- **Krátké oznamovací věty.** Hlas je syntetický a na dlouhém souvětí to je
  hodně slyšet. Tečka je pauza, čárka je nádech — piš interpunkci naplno.
- **Čísla vypisuj slovy, jak se čtou:** „pět celých šest procenta", ne „5,6 %".
  U číslic hlas často zvolí špatný tvar nebo pád.
- **Nejvýš zhruba dvě věty na scénu** (mez je 220 znaků).

Kredity nejsou úzké hrdlo: účet je na tarifu Starter se 40 000 znaky měsíčně
a jeden reel spotřebuje kolem 150. Stav se vypisuje po každém sestavení, ale
**napočítá se se zpožděním minuty až dvou** — hned po buildu ještě neuvidíš,
co sis právě odečetl.

**Délku scény určuje komentář, ne `trvani`.** Pole `trvani` je jen dolní mez;
když je věta delší, scéna se natáhne a skript to vypíše. Počítej s tím, že
reel bude delší, než vypadá součet `trvani` — čtyři scény s komentářem vyjdou
zhruba na 25 vteřin.

**Hudební podkres** se přidává vždycky a **vybíráš ho ty, podle tématu**.
Ve `scripts/nastaveni/hudba/` je sada čtyř stop po 40 s:

| `"hudba"` | nálada | kdy ji vzít |
|---|---|---|
| `vychozi.mp3` (nebo `auto`) | věcná, ani veselá, ani smutná | běžný reel s čísly, souhrn stavu, výchozí volba při pochybnostech |
| `vazny.mp3` | vážná, zdrženlivá | porušené a opuštěné sliby, nesplněné termíny, nepříjemná zjištění |
| `svizny.mp3` | mírný pohyb dopředu | „jak to funguje“, metodika, výzva k ověření, posun k lepšímu |
| `tichy.mp3` | skoro ambient | scény s hustým komentářem, kde by cokoli víc překáželo |

Rozhodni se podle **obsahu, ne podle dojmu, který chceš vyvolat**. Vážná hudba
pod nízkým procentem plnění je komentář navíc, který si divák nevyžádal —
a Vládoměr nemá čísla dramatizovat. `vazny.mp3` patří k tématu, které samo
o sobě je o porušení slibu, ne ke každému nelichotivému číslu.

Hlasitost neřeš: každá stopa se srovná na stejnou úroveň, pod mluvením se sama
stáhne dolů a na konci vyfaduje.

### Kdy vygenerovat novou stopu

Když k tématu opravdu žádná ze čtyř nesedí — třeba výroční ohlédnutí, nebo
reel, který má nést jinou náladu než všechno dosavadní. Platí ale:

- **Nikdy negeneruj hudbu ke konkrétnímu reelu.** Stopa se generuje do sady
  a používá se opakovaně. Jednorázová hudba stojí kolem 500 kreditů proti
  ~150 za celý komentář a účet by přišel o jednotný zvuk.
- **Nejdřív se zeptej uživatele.** Utrácí to jeho kredity, tak ať o tom ví.
  Řekni, jakou náladu chceš a proč nestačí to, co je.
- Postup, cena a **přesná původní zadání** (kvůli jednotnému rázu sady) jsou
  v `scripts/nastaveni/hudba/NAVOD.md` a `puvod.txt`.
- Novou stopu ulož do sady, doplň ji do `puvod.txt` i do tabulky výše
  a do tabulky v tomhle skillu.

Vlastní hotovou skladbu (royalty-free, stažená odjinud) tam uživatel může
položit taky — pravidla k licencím jsou v témže návodu.

**Hudbu z katalogu Instagramu použít nejde** — ta se dá přidat jen ručně
v aplikaci. Když je pro daný reel podstatná, řekni to uživateli: může ho
nahrát ručně a automat použít jen na přípravu videa.

## Postup

1. **Zeptej se jen na to, co si nemůžeš domyslet.** Téma obvykle stačí.
2. **Ověř čísla** v `public/evaluations.json` nebo na vladomer.cz. Reel je
   krátký a čísla v něm jsou vidět velká — nepřesnost je tu ještě dražší.
3. **Napiš zadání** do `ig-posts/RRRR-MM-DD-nazev.json` (tvar níže).
4. **Sestav:** `node scripts/instagram/reel.js --zadani ig-posts/…json`
   Trvá to pár minut — namlouvá se hlas, generuje hudba a kóduje video.
   Výsledek je `ig-archive/reels/…mp4`.
5. **Pošli video uživateli** nástrojem na odeslání souborů a počkej. Řekni mu
   výslednou délku a čím se liší od toho, co bylo v `trvani`.
6. **Připomínky** → uprav zadání, sestav znovu, pošli znovu. Zdarma, klidně
   několikrát.
7. **Až výslovně schválí obsah, zeptej se: hned, nebo naplánovat?**
   Nabídni obojí, nerozhoduj za něj.

**Nikdy nepublikuj bez výslovného souhlasu k tomu konkrétnímu reelu.**

### A) Hned

```
git add ig-posts/… ig-archive/reels/…       # commit s [skip ci]
git push
gh workflow run instagram.yml -f rezim=reel -f zadani=ig-posts/…json
```

Běh trvá déle než u obrázků — Instagram si video stahuje a překódovává, klidně
několik minut. Počkej si na výsledek a řekni, jak dopadl.

### B) Naplánovat

Doplň do zadání `publikovat_v` **v ISO tvaru i s posunem** (v létě `+02:00`,
v zimě `+01:00`) a commitni. Žádné workflow nespouštěj:

```json
"publikovat_v": "2026-08-14T19:00:00+02:00"
```

Hodinový cron (`.github/workflows/instagram-naplanovane.yml`) si zadání sám
najde, pozná podle `"typ": "reel"`, že jde o video, a **zveřejní ho jednou**.
Řekni uživateli, kdy to vyjde, a dodej, že běh startuje v 5 minut po celé
a zpracování videa pak ještě chvíli trvá.

Zrušit nebo přesunout jde do té doby změnou nebo smazáním `publikovat_v`.
Pole `publikovano` si píše automat — nesahej na něj; význam je stejný jako
u skillu `prispevek`.

## Tvar zadání

```json
{
  "typ": "reel",
  "hudba": "auto",
  "popisek": "Text pod příspěvkem. Odstavce oddělené \n\n. Na konci hashtagy.",
  "publikovat_v": "2026-08-14T19:00:00+02:00",
  "sceny": [
    {
      "typ": "text",
      "titulek": "Hák na první vteřinu",
      "podtitulek": "Krátké upřesnění",
      "komentar": "Co k tomu řekne hlas.",
      "trvani": 4
    },
    {
      "typ": "cislo",
      "nadpis": "POPISEK NAD ČÍSLEM",
      "cislo": "5,6",
      "jednotka": "%",
      "barva": "bad",
      "popis": "Co to číslo znamená",
      "dovetek": "Stav k 7. 8. 2026",
      "komentar": "Pět celých šest procenta.",
      "trvani": 4
    },
    {
      "typ": "body",
      "nadpis": "Nadpis scény",
      "styl": "odrazky",
      "body": ["…", "…"],
      "komentar": "…",
      "trvani": 6
    }
  ]
}
```

Pole `typ: "reel"` je povinné — bez něj se soubor bere jako carousel.
`hudba` je `auto` (výchozí), `zadna`, nebo jméno souboru ve
`scripts/nastaveni/hudba/`.

**Scéna `text`** — velký titulek na střed, logo nad ním. Jako úvod i závěr.

**Scéna `cislo`** — jedno velké číslo. `jednotka` je volitelná (výchozí `%`),
`barva` je `ok` (zelená), `bad` (červená) nebo `neutral` (bílá, výchozí).
Barvu volí význam, ne dojem: nízké plnění je `bad`, ne „neutrální".

**Scéna `body`** — nadpis a **nejvýš čtyři** body, `styl` je `odrazky` nebo
`kroky` (číslovaná kolečka).

`trvani` je dolní mez ve vteřinách a musí být delší než půlvteřinové prolnutí.
Skutečnou délku scény určí komentář, když je delší.

Skript zadání zkontroluje a při chybě spadne dřív, než něco vykreslí.

## Co je dobré vědět

**Sestavení běží lokálně**, publikace ne. Potřebuje Chrome a ffmpeg
(`winget install Gyan.FFmpeg`); bez klíče k ElevenLabs navíc Windows kvůli
systémovému hlasu. Instagramové tokeny jsou GitHub Actions secrets a z GitHubu
se nedají přečíst — publikuje workflow, ty ho jen spustíš přes `gh`.

**Klíč k ElevenLabs patří do `.env.local`**, který `.gitignore` vylučuje —
nikdy do `.env`, ten je commitnutý. Volitelně tam jde přidat i `ELEVENLABS_VOICE_ID`
a `ELEVENLABS_MODEL`; bez ID se vypíše nabídka hlasů a vezme se první.

```
ELEVENLABS_API_KEY=…
ELEVENLABS_VOICE_ID=…
```

**Hlas ber z knihovny, ne ze stockových.** Stockové hlasy ElevenLabs jsou
nahrané angličtináři a v češtině je slyšet přízvuk. Knihovna má desítky
rodilých českých hlasů:

```bash
curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" "https://api.elevenlabs.io/v1/shared-voices?language=cs&page_size=30"
```

Jejich `voice_id` se dá použít rovnou, není potřeba je přidávat do účtu.

**Na free plánu ElevenLabs je povinné uvést zdroj** — do popisku musí přijít
„elevenlabs.io". Placené plány to nevyžadují a jako jediné dávají komerční
licenci. Když si nejsi jistý, na kterém plánu účet je, zeptej se.

**Zveřejní se přesně to video, které bylo schváleno.** Workflow ho znovu
nekóduje.

**Prázdné místo nahoře a dole je záměr**, a je ho hodně, protože se tam potkávají
tři věci: Instagram si přes okraje reelu kreslí popisek a tlačítka, na profilu
z reelu ukazuje jen výřez 3:4, a pomalé najetí obsah ještě kousek roztlačí ven.
Bezpečná zóna je proto 285 px nahoře a 510 px dole. Ve staženém souboru to
vypadá jako moc volného místa, v aplikaci ne — **nezmenšuj ji**, čísla jsou
spočítaná a jejich odvození je v komentáři v `reel-text.html`.

**Pohyb dělá ffmpeg, ne prohlížeč.** Každá scéna je jedna vykreslená obrazovka
1080×1920, přes kterou se pomalu najíždí, a scény se prolínají. Animace uvnitř
scény (nabíhající číslo, rostoucí prstenec) formát neumí.

Šablony jsou `scripts/nastaveni/reel-text.html`, `reel-cislo.html`
a `reel-body.html`; mění se tam vzhled, ne obsah. Kontrola zadání je
v `scripts/lib/zadani.js`, hlas v `scripts/lib/hlas.js`, hudba
v `scripts/lib/hudba.js`, publikace v `scripts/lib/instagram.js`.

Širší kontext repozitáře je v `CLAUDE.md`.
