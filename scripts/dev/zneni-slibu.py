"""scripts/dev/zneni-slibu.py — doslovné znění slibů z programového prohlášení
ke každému bodu Vládoměru (vývojový nástroj, spouští se jednou; výsledek se
commituje).

    curl -sSL <ZDROJ> -o programove-prohlaseni.html
    python scripts/dev/zneni-slibu.py --html programove-prohlaseni.html --stazeno 2026-10-23

Zapíše:
  scripts/nastaveni/programove-prohlaseni.txt  text prohlášení: „# N. kapitola“,
                                               „## podnadpis“, odstavce po řádcích
  scripts/nastaveni/zneni-slibu.json           bod → podnadpis a doslovné znění

Proč: body v src/data.js jsou zkratky („Digitalizace stavebního řízení“) a model
podle zkratky hodnotí jiný slib, než vláda dala. 15.2 slibuje digitalizaci
„založenou na modulovém řešení … včetně adekvátního pilotního ověření“, a model
ve čtyřech měřeních uznal starý Portál stavebníka jako část slibu (M8); 3.2
„příspěvek na bydlení“ je pod podnadpisem „…pro policisty a hasiče“.

Přiřazení: ke každému bodu nejpodobnější věta téže kapitoly (shoda kořenů slov),
a kde nestačí, ruční výběr v RUCNE — seznam začátků vět, které slib tvoří.
Ruční výběr prošel člověk proti celému textu (23. 10. 2026). test-zneni.js
hlídá, že každé znění v textu prohlášení doslova stojí.
"""
import argparse, html, json, re, subprocess, unicodedata
from html.parser import HTMLParser

ZDROJ = "https://vlada.gov.cz/cz/vlada/programove-prohlaseni/programove-prohlaseni-vlady-224629/"

# Ruční výběr: bod → začátky vět (nebo „¶začátek“ = celý odstavec), v pořadí textu.
RUCNE = {
    "1.3": ["¶Bydlení jako veřejný zájem:"],
    "1.4": ["¶Spravedlivé důchody a funkční sociální systém:"],
    "2.2": ["Díky masivním investicím", "V delším horizontu pak i fakticky vyrovnaného"],
    "2.5": ["Rozšíříme kompetence Celní správy", "Celníkům zvýšíme platy", "Zajistíme nástupní plat 50 tisíc korun."],
    "2.14": ["Zavazujeme se, že naše vláda nepřijme euro", "Navrhneme parlamentu ukotvit českou korunu"],
    "2.15": ["Nabídneme státní dluhopisy", "Českým domácnostem umožníme zhodnotit úspory"],
    "3.3": ["Vrátíme policii do ulic", "Zastavíme rušení služeben"],
    "3.4": ["Posílíme kapacity NÚKIB", "Posílíme ochranu kritické infrastruktury"],
    "3.6": ["Odmítneme migrační pakt", "Nový zákon o azylu bude jasný"],
    "3.8": ["Podpoříme jednotky dobrovolných hasičů", "Budeme pracovat na modernizaci jejich vybavení", "Budeme modernizovat výstroj, výzbroj a techniku"],
    "4.1": ["Součástí tohoto procesu bude provedení auditu"],
    "4.4": ["Mezi prioritní úkoly vlády zařadíme posílení protivzdušné", "Pořídíme a rozvineme komplexní systémy protidronové"],
    "4.5": ["Prosadíme důsledné zapojení českého průmyslu", "Při nákupech ze zahraničí budeme trvat"],
    "4.7": ["Počet vojáků z povolání navýšíme.", "Posílíme aktivní zálohy"],
    "5.1": ["Důležitou prioritou naší zahraniční politiky je obnova", "Budeme rozvíjet strategický dialog se sousedními"],
    "5.2": ["Budeme posilovat strategické vztahy se Spojenými státy", "Důležitá je i kontinuita tradičního přátelství se Státem Izrael."],
    "5.4": ["V zájmu České republiky je nepřesunovat", "Nepřipustíme oslabování principu jednomyslnosti."],
    "5.5": ["Pro zajištění efektivní koordinace evropské agendy", "Evropská agenda bude v gesci předsedy vlády"],
    "5.6": ["Jedním z hlavních nástrojů prosazování českých zájmů", "Budeme podporovat aktivní diverzifikaci"],
    "6.5": ["Zmodernizujeme trestní řád a občanský soudní řád"],
    "6.6": ["Příslušníkům vězeňské služby zvýšíme platy", "Zajistíme nástupní plat 50 tisíc korun."],
    "6.8": ["Zákon nesmí vágními formulacemi", "Proto zrušíme trestný čin neoprávněné činnosti"],
    "6.9": ["Připravíme zákon o celostátním referendu", "Zároveň jasně stanovíme, že členství České republiky"],
    "7.6": ["Zrychlíme výstavbu nových flexibilních zdrojů", "Zavedeme proto kapacitní mechanismy"],
    "7.9": ["Ve spojení se zástupci podnikatelů", "Změna nebude na bázi dílčích opatření"],
    "7.10": ["Předložíme střednědobý výhled", "Základem bude Hospodářská strategie"],
    "9.5": ["Provedeme zásadní revizi a zrušíme neefektivní prvky současného inkluzivního", "Podpoříme kapacity speciálních škol"],
    "9.9": ["Budeme prosazovat navýšení kapacit programu Erasmus+", "Zaměříme se na zvýšenou podporu studentů ze sociálně slabších"],
    "10.1": ["Zastropujeme věk odchodu do důchodu na 65 letech a obnovíme"],
    "10.5": ["Obnovíme přídavky na děti", "Obnovíme školkovné a slevu na dani"],
    "10.6": ["Zrevidujeme „superdávku“.", "Změníme nevyhovující a diskriminační parametry"],
    "10.7": ["Připravíme nový zákon o sociálních službách.", "Ve spolupráci s kraji, obcemi a poskytovateli sociálních služeb navrhneme"],
    "10.9": ["Zrušíme povinné hlášení zaměstnanců", "Zrušíme povinné pracovnělékařské prohlídky"],
    "10.10": ["Zpřísníme kontrolu agentur práce.", "Zajistíme, aby agentury práce nezneužívaly"],
    "12.1": ["Přijmeme soubor opatření ke zvýšení konkurenceschopnosti a potravinové"],
    "12.2": ["Zajistíme transparentnost v potravinovém řetězci", "Pro tyto účely zřídíme funkci potravinového ombudsmana"],
    "14.3": ["Dokončíme rekonstrukci Nové scény", "Podpoříme výstavbu budovy Vltavské filharmonie", "Podpoříme například rekonstrukci Invalidovny"],
    "15.1": ["Připravíme nový stavební zákon", "Zákonem stanovíme bydlení jako veřejný zájem."],
    "15.2": ["V návaznosti na nový stavební zákon zajistíme efektivní digitalizaci", "Zabezpečíme kvalitní personální řízení a dostatečnou metodickou podporu"],
    "17.4": ["Funkci ministra pro vědu zrušíme.", "Posílíme pozici Rady vlády pro vědu"],
    "18.6": ["Provedeme audit státních IT organizací", "Zavedeme transparentní rámec spolupráce veřejného a soukromého sektoru"],
}

class Parser(HTMLParser):
    def __init__(s):
        super().__init__(); s.radky, s.buf, s.tag = [], [], None
    def handle_starttag(s, tag, attrs):
        if tag in ("h2", "h3", "h4", "p", "li"): s.flush(); s.tag = tag
        if tag == "br": s.buf.append(" ")
    def handle_endtag(s, tag):
        if tag in ("h2", "h3", "h4", "p", "li"): s.flush()
    def handle_data(s, d):
        if s.tag: s.buf.append(d)
    def flush(s):
        t = re.sub(r"\s+", " ", html.unescape("".join(s.buf))).strip()
        if t and s.tag: s.radky.append({"h2": "# ", "h3": "# ", "h4": "## "}.get(s.tag, "") + t)
        s.buf, s.tag = [], None

def text_prohlaseni(cesta_html):
    p = Parser(); p.feed(open(cesta_html, encoding="utf-8").read()); p.flush()
    r = p.radky
    start = next(i for i, x in enumerate(r) if i > 5 and re.match(r"# 1\.?\s", x))
    konec = r.index("# Připojené dokumenty")
    r = [("## " + x[2:] if x.startswith("# ") and not re.match(r"# \d+\. ", x) else x) for x in r[start:konec]]
    # Odstavec rozdělený uprostřed věty (v HTML jsou dva <p>) se spojí.
    out = []
    for x in r:
        if out and not out[-1].startswith("#") and not x.startswith("#") and not re.search(r"[.!?:“\")]$", out[-1]) and re.match(r"[a-zá-ž0-9]", x):
            out[-1] += " " + x
        else:
            out.append(x)
    return out

ZKRATKY = {"č", "tzv", "např", "atd", "tj", "resp", "mj", "tis", "mld", "mil", "odst", "písm", "min"}
def vety(odstavec):
    out, akt = [], ""
    for cast in re.split(r"(?<=[.!?])\s+", odstavec):
        akt = f"{akt} {cast}".strip() if akt else cast
        posl = re.search(r"(\w+)\.$", akt)
        if posl and (posl.group(1).lower() in ZKRATKY or posl.group(1).isdigit()): continue
        out.append(akt); akt = ""
    if akt: out.append(akt)
    return out

def koreny(t):
    t = "".join(ch for ch in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(ch) != "Mn")
    return {w[:5] for w in re.findall(r"[a-z0-9]+", t) if len(w) >= 3 and w not in {"pro", "nebo", "jako", "bude", "budeme", "jejich", "ktere", "ktery", "tak", "aby"}}

ap = argparse.ArgumentParser()
ap.add_argument("--html", required=True); ap.add_argument("--stazeno", required=True)
a = ap.parse_args()
radky = text_prohlaseni(a.html)
open("scripts/nastaveni/programove-prohlaseni.txt", "w", encoding="utf-8", newline="\n").write("\n".join(radky) + "\n")

# Segmenty: (kapitola, podnadpis, odstavec, věta)
seg, kap, nadpis = [], None, None
for i, x in enumerate(radky):
    m = re.match(r"# (\d+)\. ", x)
    if m: kap, nadpis = int(m.group(1)), None; continue
    if x.startswith("## "): nadpis = x[3:]; continue
    for j, v in enumerate(vety(x)): seg.append({"kap": kap, "nadpis": nadpis, "i": i, "j": j, "veta": v, "odstavec": x})

body = json.loads(subprocess.run(["node", "--input-type=module", "-e",
    "import {CHAPTERS} from './src/data.js'; console.log(JSON.stringify(CHAPTERS.flatMap(c => c.groups.flatMap(g => g.items.map(i => ({id: i.id, cs: i.cs, kap: Number(c.id)}))))))"],
    capture_output=True, check=True).stdout.decode("utf-8"))

SOUVISLY = re.sub(r"\s+", " ", " ".join(x for x in radky if not x.startswith("#")))
vysledek = {}
for b in body:
    v_kap = [s for s in seg if s["kap"] == b["kap"]]
    if b["id"] in RUCNE:
        vybrane = []
        for zac in RUCNE[b["id"]]:
            if zac.startswith("¶"):
                s = next(s for s in v_kap if s["odstavec"].startswith(zac[1:]))
                vybrane.append({**s, "j": -1, "veta": s["odstavec"]})
            else:
                kand = [s for s in v_kap if s["veta"].startswith(zac)]
                assert len(kand) >= 1, (b["id"], zac)
                vybrane.append(kand[0])
    else:
        kb = koreny(b["cs"])
        nej = max(v_kap, key=lambda s: len(kb & koreny(s["veta"])) / (len(koreny(s["veta"])) ** 0.15 or 1))
        vybrane = [nej]
    vybrane.sort(key=lambda s: (s["i"], s["j"]))
    # Věty, které v textu nestojí hned za sebou, odděluje výpustka — jinak by
    # spojení nebylo doslovnou citací.
    zneni = vybrane[0]["veta"]
    for s in vybrane[1:]:
        zneni += (" " if f"{zneni} {s['veta']}" in SOUVISLY else " … ") + s["veta"]
    vysledek[b["id"]] = {"nadpis": vybrane[0]["nadpis"], "zneni": zneni}

data = {
    "_popis": "Doslovné znění slibů z programového prohlášení vlády ke každému bodu Vládoměru. Vytvořeno nástrojem scripts/dev/zneni-slibu.py z textu scripts/nastaveni/programove-prohlaseni.txt; ruční výběr vět prošel člověk. „nadpis“ je podnadpis prohlášení, pod kterým věta stojí (u kapitol bez podnadpisů null). Neupravovat ručně — test-zneni.js hlídá, že každé znění v textu prohlášení doslova stojí.",
    "zdroj": ZDROJ, "publikovano": "2026-01-05", "stazeno": a.stazeno,
    "body": vysledek,
}
with open("scripts/nastaveni/zneni-slibu.json", "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=1); f.write("\n")
print(f"bodů {len(vysledek)}, ručně {len(RUCNE)}, text {sum(len(x) for x in radky)} znaků")
