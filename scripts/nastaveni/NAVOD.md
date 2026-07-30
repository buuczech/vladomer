# Návod: co se tu dá měnit

V této složce je všechno, co ovlivňuje týdenní hodnocení a nevyžaduje zásah
do programu. Soubory jsou obyčejný text — otevři, uprav, ulož.

**Ukládej vždy v kódování UTF-8.** V Poznámkovém bloku: *Uložit jako →
Kódování: UTF-8*. Jinak se rozbije diakritika a běh se zastaví chybou.

| Soubor | Co obsahuje |
|---|---|
| `prompt-hodnoceni.md` | Zadání pro model, který hodnotí jednotlivé body programu |
| `prompt-zpravy.md` | Zadání pro výběr „Hlavních zpráv týdne" |
| `prompt-korektura.md` | Zadání pro jazykovou korekturu hotových textů |
| `nastaveni.txt` | Čísla a model — kolik zdrojů, jak přísné hodnocení, kolik zpráv |
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
