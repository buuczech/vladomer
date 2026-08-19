# Datová konzistence

Ptáš se jedinou otázkou: **sedí web sám se sebou?** Jestli je tvrzení pravdivé
ve světě, řeší oblast `fakta` — sem to nepatří a nemíchej to.

## Co už udělal skript, a ty to nedělej znovu

`node scripts/dev/test-konzistence.js` deterministicky ověřuje:

- všech 143 bodů z `src/data.js` má hodnocení a nic navíc
- povinná pole, platné stavy, tvar `evidenceDate`
- zdroje: nejvýš `maximalne_zdroju`, s titulkem, platná http(s) adresa,
  doména ve `weby-hodnoceni.txt`
- každé „splněno“ projde laťkou na doklad (`lib/dukaz.js`), každá degradace
  má platný důvod a ten důvod má vysvětlivku v `App.jsx` i `prehled.js`
- texty jsou v obou jazycích a neprojde jimi `ocisti()` — tedy nezůstal
  v nich `<cite>` ani syrový klíč stavu
- historie sedí s aktuálními daty, `audit.json` je setříděný a bez
  neoprávněných duplicit, zprávy jsou z povolených domén a v časovém okně
- přísná metrika vychází stejně v JSON-LD i v textovém přehledu a všech pět
  míst počítá jmenovatel ze stejných stavů
- `audit.json` je append-only proti předchozí verzi v gitu

Když skript projde, tohle všechno je hotové. **Varování (kód 0) přepiš do
reportu** — nespadne z něj běh, ale je to nález.

## Co zůstává na tobě

Tohle skript neumí, protože to není otázka tvaru, ale smyslu.

**Stav proti vlastnímu komentáři.** Nejcennější kontrola v téhle oblasti.
Mluví komentář o hotovém zákonu u bodu, který má stav „probíhá“? Nebo naopak
popisuje návrh, který teprve někam míří, u bodu se stavem „splněno“? Web,
který nad odstavcem „zákon nabyl účinnosti“ ukáže odznak „nezahájeno“,
ztrácí důvěru rychleji než web, který o té položce mlčí.

Jedna výjimka, kterou musíš znát: **rozpor mezi odznakem „částečně splněno“
a komentářem tvrdícím splnění je u položek s `evidenceMissing` v pořádku
a záměrný.** Model napsal „splněno“, automatická kontrola dokladu ho
nepotvrdila a web ten rozpor přiznává textem „Model uvedl «splněno». Automatická
kontrola dokladu ho nepotvrdila:“ plus důvodem. Přiznaná neshoda je lepší než
skrytá. Nález je jen tehdy, když to vysvětlení chybí nebo není vidět.

**Popis změny proti tomu, co se opravdu stalo.** Pole `change` má popisovat
posun mezi `previousStatus` a `status`. Když se stav nezměnil, nemá `change`
tvrdit, že se něco pohnulo, a naopak.

**Doklad proti komentáři.** `evidence` a `comment` mají mluvit o téže věci.
Doklad o jednom zákoně pod komentářem o jiném tématu znamená, že se model
někde přepnul.

**Obě jazykové verze říkají totéž.** Že angličtina existuje, skript ověří; že
je to překlad a ne jiné tvrzení, ne. Zvlášť si všímej čísel a dat — když se
v české větě píše o roce 2026 a v anglické o 2025, je to vážný nález.

**Neměřitelné body.** U položek s `unverifiable: true` má komentář vysvětlit,
proč to ověřit nejde. Bod, který je vyřazený ze jmenovatele bez zdůvodnění,
vypadá jako schované nepohodlné číslo.

**Zdroj podpírá to, co se u něj tvrdí.** Tady jsi na hranici s `fakta`. Sem
patří jen levná verze: sedí titulek zdroje tématicky k bodu? Odkaz na článek
o důchodech pod závazkem o školství je nález i bez otevírání stránky.

## Jak to projít, když je bodů 143

Nečti všech 143 pozorně, nedopadne to dobře. Pořadí podle výnosu:

1. **Všechny `fulfilled` a `broken`** — nejsilnější tvrzení, nejdražší omyl.
2. **Všechno, co změnilo stav** proti předposlednímu snímku v `history.json` —
   tam vzniká rozpor mezi novým odznakem a starým komentářem.
3. **Všechny `unverifiable`** a všechny s `evidenceMissing` — je jich pár.
4. **Zbytek vzorkem**, jedna kapitola za běh, a v reportu napiš která, aby se
   příště pokračovalo další.

Užitečné jednorázové výpisy:

```bash
node -e "const e=require('./public/evaluations.json').evals;for(const[k,v]of Object.entries(e))if(v.status==='fulfilled'||v.status==='broken')console.log(k,v.status,'|',v.evidence.slice(0,90))"
```

```bash
node -e "const e=require('./public/evaluations.json').evals;for(const[k,v]of Object.entries(e))if(v.previousStatus&&v.previousStatus!==v.status)console.log(k,v.previousStatus,'->',v.status,'|',v.change.cs.slice(0,90))"
```

## Tvar dat

`public/evaluations.json` je `{ evals: { "1.1": {…} }, lastUpdated }`, klíčem
je id závazku z `src/data.js`. Jeden bod:

```json
{
  "status": "partial",
  "evidence": "zákon č. 117/1995 Sb., schválený Sněmovnou 8. 7. 2026",
  "evidenceDate": "2026-07-29",
  "evidenceMissing": "date-mismatch",
  "unverifiable": false,
  "comment": { "cs": "…", "en": "…" },
  "change":  { "cs": "…", "en": "…" },
  "sources": [{ "url": "https://…", "title": "…" }],
  "previousStatus": "in_progress",
  "updatedAt": "2026-08-14T09:58:53.569Z"
}
```

Stavy jsou `fulfilled`, `partial`, `in_progress`, `declared`, `not_started`,
`broken`. Navíc existuje `stalled` — stará hodnota škály, kterou web pořád umí
vykreslit kvůli starým snímkům v historii, a `pending` je syntetický stav pro
bod bez hodnocení. `evidenceDate` a `evidenceMissing` jsou volitelné.

`public/audit.json` má jiný tvar než zbytek: `snake_case`, `comment_cs` místo
`comment.cs`, `sources` jsou holé adresy bez titulků. **Je append-only**, což
web slibuje na třech místech; oprava se přidává jako nový záznam s polem
`oprava`, nikdy se nepřepisuje původní řádek. Do prohlížeče se nenačítá.

## Když se něco nesejde

Přepočítat degradace podle aktuálního pravidla nad už publikovanými daty jde
zdarma a bez modelu — nasucho:

```bash
node scripts/dev/prepocet-degradaci.js
```

Zápis dělá až s `--zapsat` a opravy připojuje do `audit.json` jako nové
záznamy. **Nespouštěj to se zápisem bez schválení** — mění publikovaná čísla.
