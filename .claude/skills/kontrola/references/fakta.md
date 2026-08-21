# Fact-check

Ptáš se jedinou otázkou: **je to, co web tvrdí, pravda?** Jestli web sedí sám
se sebou, řeší oblast `data`.

Tohle je jediná oblast, která nemá přirozený konec. 143 závazků ověřených
proti realitě je několik hodin práce a pokaždé jiných. **Bez rozsahu to
neděláš** — buď se to nedotáhne, nebo se odbude, a odbytý fact-check je horší
než žádný, protože se o něj někdo opře.

## Rozsah: tři vrstvy

**Vrstva A — vždy, při každém běhu.** Nejdražší omyly:

- všechny body se stavem `fulfilled` (nejsilnější tvrzení, jaké web dělá)
- všechny se stavem `broken` (obvinění z porušení slibu)
- všechno, co změnilo stav proti předposlednímu snímku v `history.json`

Dohromady to bývá dvacet až třicet bodů. Vejde se to.

**Vrstva B — rotace.** Jedna kapitola z osmnácti za běh. **Do reportu napiš,
kterou jsi vzal**, aby příští běh pokračoval další. Za osmnáct běhů je
pokrytý celý web, aniž by jediný běh trval celý den.

**Vrstva C — na vyžádání.** Když uživatel řekne kapitolu, bod nebo téma, dělá
se přesně to a vrstvy A a B se přeskočí. Řekni mu, že se přeskočily.

Když z nějakého důvodu nestihneš celou vrstvu, **napiš do reportu, co jsi
neprošel.** Report, který mlčí o svých mezerách, se čte, jako by pokryl
všechno.

## Postup u jednoho bodu

Nejdřív levné a jisté, pak drahé a nejisté.

1. **Vnitřní ověření — otevři citovaný zdroj.** Nejvýnosnější krok a nic
   nehledá: říká ten článek opravdu to, co tvrdí komentář? Tady se najde
   většina nálezů — zdroj o jiném zákoně, zdroj o návrhu pod tvrzením
   o schválení, zdroj, který téma jen zmiňuje.
2. **Ověř datum.** Sedí `evidenceDate` s tím, co v článku je? Vláda nastoupila
   15. 12. 2025; cokoli staršího nepatří jí.
3. **Vnější ověření — hledej, co se stalo od té doby.** Teprve teď.
   Otázka zní „změnilo se od `evidenceDate` něco, co mění stav?“, ne „je
   to téma pravda“. Zákon mohl projít, spadnout, být vetován, novelizován.
4. **Zapiš verdikt** (níže) a u čehokoli jiného než `sedí` napiš, **z čeho to
   víš** — odkaz a jednu větu. Fact-check bez zdroje je jen druhý názor.

Zdroje si vybírej v duchu `scripts/nastaveni/weby-hodnoceni.txt`: vládní
weby, Demagog a média kategorie A podle NFNŽ. Nemusíš se ho držet otrocky —
ty nejsi vyhledávání modelu, můžeš sáhnout i do Sbírky zákonů nebo na
sněmovní tisky, a u legislativy jsou primární prameny lepší než zpravodajství.

## Verdikty

- **sedí** — tvrzení i stav odpovídají tomu, co jsi našel.
- **nesedí** — realita říká něco jiného. Napiš, jaký stav by odpovídal.
- **zastaralé** — bylo to pravda v `evidenceDate`, ale mezitím se to pohnulo.
  Nejčastější nález u týdenního webu a není to ostuda, je to práce navíc.
- **nedoložitelné** — nenašel jsi nic, co by to potvrdilo ani vyvrátilo.
  Není to totéž co „nesedí“ a nesmí se tak reportovat.
- **zdroj nežije** — odkaz je mrtvý nebo vede jinam. Drobné, pokud tvrzení
  platí, vážné, pokud to byl jediný doklad.

## Závažnost v téhle oblasti

Řiď se pravidlem ze `SKILL.md`: **podhodnocení plnění je horší směr.**

- Bod, který má být `fulfilled` a je `partial` nebo níž → **vážné.** Web
  nespravedlivě říká, že vláda něco nesplnila.
- Bod, který je `fulfilled` a neměl by být → **kritické.** To je tvrzení,
  které se nedá vzít zpět bez ztráty důvěry.
- Bod označený `broken`, který porušený není → **kritické.** Je to obvinění.
- Posun o jeden stupeň mezi `declared`, `in_progress` a `partial` → **drobné**,
  pokud komentář popisuje realitu správně. Hranice mezi nimi je měkká a je to
  přiznané v metodice.

## Výstup

Kromě běžných nálezů podle `SKILL.md` má report z téhle oblasti navíc
**tabulku po kapitolách** — uživatel ji chce jako první věc:

```
| kapitola | prověřeno | nesedí | proč |
|---|---|---|---|
| 2. Finance a daně | 9 | 2 | u 2.4 zdroj mluví o návrhu, ne o schválení; 2.11 zastaralé — Senát vrátil 5. 8. |
| 7. Zdravotnictví | 6 | 0 | — |
```

Sloupec „proč“ je to podstatné. „Nesedí“ bez důvodu se nedá ani opravit, ani
rozporovat.

## Co s nálezem dělat

**Neopravuj hodnocení ručně jen proto, že jsi našel rozpor.** Stav v
`evaluations.json` je výstup modelu, ne tvůj názor, a auditní stopa v
`audit.json` má odpovídat tomu, co běh opravdu udělal. Správné odpovědi bývají:

- **upravit prompt nebo nastavení** ve `scripts/nastaveni/`, když se stejná
  chyba opakuje napříč body — to je oprava příčiny. Po každé takové změně
  ověř, co se změnilo v tom, co model dostane:

  ```bash
  ANTHROPIC_API_KEY=x CHAPTER_LIMIT=18 node --import ./scripts/dev/dump-prompts.js scripts/evaluate.js > po.txt
  ```

  Nic to neodešle a `public/*.json` to při ukončení vrátí zpátky. Porovnej
  s výpisem pořízeným před změnou; prázdný rozdíl je důkaz, že se prompt
  nezměnil.
- **doplnit strážce do kódu**, když jde o vzor, který se dá poznat strojově.
  Zásada projektu zní „guards belong in code, not prompts“ a má za sebou
  zkušenost, že model instrukce v promptu obchází.
- **nechat to na příští páteční běh**, když jde o jednotlivost typu
  „zastaralé“. Model to obvykle opraví sám a ruční zásah do publikovaných
  čísel je horší než týden zpoždění.
- **ruční přepočet** jen u systémové vady, a přes
  `node scripts/dev/prepocet-degradaci.js --zapsat`, které opravu připojí do
  auditní stopy jako nový záznam. Nikdy ne přímou editací `evaluations.json`.

Ať zvolíš cokoli, jde to nejdřív na schválení.
