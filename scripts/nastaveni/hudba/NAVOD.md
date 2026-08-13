# Hudba pod reely

Skladby, které se dají použít jako podkres pod reel.

## Co je k dispozici

| soubor | k čemu |
|---|---|
| `vychozi.mp3` | běžný reel s daty — věcné, ani veselé, ani smutné |
| `vazny.mp3` | porušené sliby a nepříjemná zjištění — vážné, ne dramatické |
| `svizny.mp3` | vysvětlovací a lehčí témata — mírný pohyb dopředu |
| `tichy.mp3` | reely s hodně mluvením — skoro ambient, drží se úplně vzadu |

Všechny jsou 40 s dlouhé, což pokryje reel do 40 vteřin bez opakování.
Vygenerovala je ElevenLabs Music; přesná zadání jsou v `puvod.txt`, takže
se dá kdykoli dogenerovat další kus ve stejném duchu.

Ani jedna nemá gradaci ani vyvrcholení — je to schválně. Reel má být
o číslech, ne o tom, jak se u nich má divák cítit.

## Jak vybrat

V zadání reelu:

```json
"hudba": "vazny.mp3"
```

Když pole vynecháš nebo napíšeš `"auto"`, použije se `vychozi.mp3`.
`"zadna"` znamená reel bez hudby.

Hlasitost se neřeší — každá stopa se automaticky srovná na stejnou úroveň
a pod mluveným slovem se sama stáhne dolů. Rozdíly mezi soubory (ty čtyři
se liší až o 11 dB) tím pádem nevadí.

Kdyby složka byla prázdná, reel si složí nouzovou smyčku ze sinusovek. Zní
lacině a je to opravdu jen záchrana, aby se dalo pracovat i bez téhle sady.

## Jak přidat vlastní skladbu

1. Sežeň skladbu, kterou **smíš použít**. To je celé to podstatné — viz níž.
2. Nakopíruj soubor sem (`mp3`, `m4a`, `wav`, `ogg` nebo `flac`).
3. Ulož k ní do `puvod.txt`, odkud je a pod jakou licencí.
4. V zadání reelu uveď její jméno.

Skladba se automaticky zopakuje dokola na délku reelu a na konci se ztiší.
Pod mluveným slovem se sama stáhne dolů, takže nemusíš nic předem tlumit.

## Na co si dát pozor s licencí

**Nestahuj sem hudbu z YouTube, Spotify ani odjinud z internetu.** Vládoměr
stojí na tom, že je všechno dohledatelné a v pořádku; nárok za užití cizí
skladby by byl trapný a zbytečný.

Použitelné jsou skladby výslovně nabízené k volnému užití — tedy pod licencí
Creative Commons, nebo takzvané royalty-free z knihoven, které to mají černé
na bílém v podmínkách. U každé skladby si ulož, odkud je a pod jakou licencí,
třeba do souboru `puvod.txt` vedle ní.

Pozor i na to, že „zdarma ke stažení" a „smím to použít na Instagramu" nejsou
totéž. Řada knihoven vyžaduje uvedení autora v popisku příspěvku.

**Hudbu z katalogu Instagramu použít nejde.** Ta se dá přidat jen ručně
v aplikaci při nahrávání a přes rozhraní, kterým reely publikujeme, se k ní
dostat nedá. Když bude pro nějaký reel hudba z katalogu důležitá, musí se ten
reel nahrát ručně a automat použít jen na jeho přípravu.

**U hudby z ElevenLabs licence sedí**, ale za jiných podmínek než u hlasu:
komerční užití včetně videí na sociálních sítích je na tarifu Starter a výš
v pořádku, vyloučené je šíření na hudební streamovací služby (Spotify a spol.)
a distribuce do TV a rozhlasu. Uvedení zdroje vyžaduje jen free plán.
