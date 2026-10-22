"""scripts/dev/plan-legislativy.py — Plán legislativních prací vlády a Výhled
z PDF do scripts/nastaveni/plan-legislativy.json (spec 006, T008). Vývojový
nástroj, spouští se jednou za rok (a při změně plánu); výsledek se commituje.

    pip install pypdf          (a pdftotext z balíku poppler)
    python scripts/dev/plan-legislativy.py \\
        --plan  <Plán legislativních prací … .pdf>  --plan-url  <odkaz na vlada.gov.cz> \\
        --vyhled <Výhled legislativních prací … .pdf> --vyhled-url <odkaz> \\
        --usneseni "usnesení vlády ze dne 23. března 2026 č. 175"

Proč z PDF a proč Python: vláda plán zveřejňuje jen jako PDF (tabulka po
resortech, název úkolu tučně, pod ním cíl). Tučné písmo a sloupce přečte jen
knihovna, která vidí písma a souřadnice — pypdf ano. pypdf ale občas rozdělí
slovo na dva kusy („M ístopředseda“); pdftotext dělí slova správně, takže
jeho slovník rozhoduje, kdy kusy spojit bez mezery. Běh pipeline Python
nepotřebuje: čte hotový JSON.

Co se čte: hlavní tabulka každého resortu (číslo, předkladatel, název, cíl,
termín předložení vládě, nabytí účinnosti) a tabulka „Vztah výše uvedených
úkolů k programovým prioritám vlády a ke koaliční smlouvě“, ve které vláda
SAMA uvádí, ke kterému slibu programového prohlášení úkol patří. Kapitola
Vládoměru (= bod programového prohlášení 1–18) se bere z čísla ve vazbě
(„Bod 17.“, „Kapitola 10:“, „(část 2)“), a když vazba číslo nemá a jen
cituje slib, podle resortu (RESORT_KAPITOLA). Tabulky „Časové členění“
a „Vztah … k právu EU“ se přeskakují.
"""
import argparse, hashlib, json, re, subprocess, sys
from pypdf import PdfReader

# Resort → kapitola Vládoměru, když vazba na program nemá číslo kapitoly.
# Předseda vlády má úkoly napříč kapitolami, a tak výchozí kapitolu nemá.
RESORT_KAPITOLA = [
    ("ministr průmyslu a obchodu", 7), ("Rady pro výzkum", 17), ("ministryně financí", 2),
    ("ministr obrany", 4), ("Ministr dopravy", 8), ("Ministr kultury", 14),
    ("Ministr práce a sociálních věcí", 10), ("pro místní rozvoj", 15), ("pro sport, prevenci a zdraví", 16),
    ("Ministr spravedlnosti", 6), ("Ministr školství", 9), ("Ministr vnitra", 3),
    ("Ministr zdravotnictví", 11), ("Ministr zemědělství", 12), ("Ministr životního prostředí", 13),
]
STRATEGICKY_SMER = re.compile(r"strategick\w*\s+směr", re.I)
CISLO_KAPITOLY = re.compile(r"(?:\bbod\w*|\bkapitol\w*|\bčást\w*)\s*(\d{1,2})\b", re.I)

def slovnik(cesta):
    text = subprocess.run(["pdftotext", "-enc", "UTF-8", cesta, "-"], capture_output=True, check=True).stdout.decode("utf-8")
    return set(re.findall(r"\w+", text))

def spoj(kusy, slova):
    """Kusy jednoho řádku a sloupce do textu: mezera, ledaže by spojení dalo slovo z pdftotextu."""
    out = ""
    for k in kusy:
        t = k["text"]
        if out and not out[-1].isspace() and t and not t[0].isspace() and not re.match(r"[,.;:)“]", t):
            w1 = re.search(r"(\w+)$", out); w2 = re.match(r"(\w+)", t)
            # Spojit jen rozdělené slovo: spojení je slovo a aspoň jeden kus sám slovem není
            # („M“ + „ístopředseda“ ano, „práv“ + „a“ ne). Totéž u čísel („03“ + „.26“).
            rozdelene = w1 and w2 and (w1.group(1) + w2.group(1)) in slova and not (w1.group(1) in slova and w2.group(1) in slova)
            cislo = (re.search(r"(?<!\d)\d$", out) and re.match(r"\d", t)) or (re.search(r"\d$", out) and re.match(r"\.\d", t))
            if not rozdelene and not cislo:
                out += " "
        out += t
    return re.sub(r"\s+", " ", out).strip()

def pripoj(a, b):
    """Další řádek téhož pole: dělení slova na konci řádku se spojí."""
    if not a: return b
    if not b: return a
    if re.search(r"\w-$", a) and re.match(r"[a-záčďéěíňóřšťúůýž]", b): return a[:-1] + b
    return a + " " + b

def kusy(stranka):
    out = []
    def v(text, cm, tm, fd, fs):
        if not text.strip(): return
        pismo = str((fd or {}).get("/BaseFont", "")) if fd else ""
        vel = fs * abs(tm[0] * cm[0] or 1)
        if vel < 7: return  # odkazy na poznámky pod čarou (6 pt)
        # Záhlaví tabulky a text poznámek pod čarou mají 8 pt, obsah tabulky 9 pt.
        out.append({"x": tm[4] * cm[0] + cm[4], "y": tm[5] * cm[3] + cm[5], "tucne": "Bold" in pismo, "maly": vel < 8.5, "text": text.replace("\n", " ")})
    stranka.extract_text(visitor_text=v)
    return out

def radky(ks, tolerance=2.5):
    ks = sorted(ks, key=lambda k: (-k["y"], k["x"]))
    rad, akt = [], []
    for k in ks:
        if akt and abs(akt[0]["y"] - k["y"]) > tolerance:
            rad.append(akt); akt = []
        akt.append(k)
    if akt: rad.append(akt)
    return [sorted(r, key=lambda k: k["x"]) for r in rad]

def cist(cesta, zdroj, url):
    slova = slovnik(cesta)
    r = PdfReader(cesta)
    ukoly, vazby = [], []
    resort = rok = tabulka = None
    sekce = 0
    sl = {"impl": 560, "vlade": 605, "ucinnost": 655, "ria": 705, "program": 300}
    ukol = vazba = None
    for strana, stranka in enumerate(r.pages, 1):
        rady = radky(kusy(stranka))
        if any("....." in k["text"] for rd in rady for k in rd):
            continue  # obsah
        for rad in rady:
            if rad[0]["y"] < 60: continue  # číslo stránky
            text = spoj(rad, slova)
            bez = re.sub(r"\s+", "", text)  # nadpisy porovnávat bez mezer — pypdf je dělí různě
            if bez.startswith("Časovéčlenění"): tabulka = "konec"
            if tabulka == "konec": continue
            m = re.match(r"Resortníčlenění(?:–rok(\d{4}))?", bez)
            if m:
                rok = m.group(1) or rok; sekce += 1; continue
            if bez.startswith("VztahvýšeuvedenýchúkolůkprávuEU"):
                tabulka = "eu"; ukol = vazba = None; continue
            if bez.startswith("Vztahvýšeuvedenýchúkolůkprogramovýmprioritám"):
                tabulka = "program"; ukol = vazba = None; continue
            if text.startswith("č.") and "legislativní úkol" in text:
                tabulka = "hlavni"; vazba = None
                for k in rad:
                    if k["text"].strip() == "RIA": sl["ria"] = k["x"] - 6
                continue
            if text.startswith("k č.") and "legislativní úkol" in text:
                for k in rad:
                    if k["text"].strip().startswith("úkol v"): sl["program"] = k["x"] - 5
                continue
            if re.match(r"^(předkl|datel|tace)", text):
                for k in rad:
                    t = k["text"].strip()
                    if t.startswith("předlož"): sl["vlade"] = k["x"] - 8
                    if t.startswith("nabytí"): sl["ucinnost"] = k["x"] - 8
                    if t == "i" or t.startswith("implemen"): sl["impl"] = k["x"] - 6
                continue
            rad = [k for k in rad if not k["maly"]]  # poznámky pod čarou
            if not rad: continue
            # Dvouciferné číslo úkolu bývá ve dvou kusech („1“ + „5“).
            while len(rad) > 1 and rad[0]["x"] < 50 and rad[1]["x"] < 55 and re.fullmatch(r"\d+", rad[0]["text"].strip()) and re.fullmatch(r"\d+", rad[1]["text"].strip()):
                rad = [{**rad[0], "text": rad[0]["text"].strip() + rad[1]["text"].strip()}] + rad[2:]
            text = spoj(rad, slova)
            prvni = rad[0]
            je_cislo = re.match(r"^\d{1,3}$", prvni["text"].strip()) and prvni["x"] < 55
            if prvni["tucne"] and prvni["x"] < 45 and not je_cislo and len(rad) <= 4:
                resort = text; tabulka = None; ukol = vazba = None; continue
            if tabulka == "hlavni":
                if je_cislo:
                    ukol = {"zdroj": zdroj, "url": url, "resort": resort, "rok": rok, "sekce": sekce, "cislo": int(prvni["text"]),
                            "strana": strana, "predkladatel": [], "nazev": "", "cil": "", "vlade": "", "ucinnost": ""}
                    ukoly.append(ukol); rad = rad[1:]
                if not ukol: continue
                pred = [k for k in rad if k["x"] < 95]
                txt = [k for k in rad if 95 <= k["x"] < sl["impl"]]
                for t in spoj(pred, slova).split():
                    if re.match(r"^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž\-]{1,7}$", t): ukol["predkladatel"].append(t)
                tucne = [k for k in txt if k["tucne"]]; obycejne = [k for k in txt if not k["tucne"]]
                if tucne: ukol["nazev"] = pripoj(ukol["nazev"], spoj(tucne, slova))
                if obycejne: ukol["cil"] = pripoj(ukol["cil"], spoj(obycejne, slova))
                vl = spoj([k for k in rad if sl["vlade"] <= k["x"] < sl["ucinnost"]], slova)
                uc = spoj([k for k in rad if sl["ucinnost"] <= k["x"] < sl["ria"]], slova)
                datum = lambda t: re.sub(r" ", "", t) if re.fullmatch(r"[\d .]+", t) else t  # „0 3.26“ → „03.26“; „2027 4. Q“ beze změny
                if vl and not ukol["vlade"]: ukol["vlade"] = datum(vl)
                if uc and not ukol["ucinnost"]: ukol["ucinnost"] = datum(uc)
            elif tabulka == "program":
                if je_cislo:
                    vazba = {"sekce": sekce, "resort": resort, "cislo": int(prvni["text"]), "text": "", "nazev": ""}
                    vazby.append(vazba); rad = rad[1:]
                if not vazba: continue
                prava = [k for k in rad if k["x"] >= sl["program"]]
                leva = [k for k in rad if 55 <= k["x"] < sl["program"]]
                if prava: vazba["text"] = pripoj(vazba["text"], spoj(prava, slova))
                if leva: vazba["nazev"] = pripoj(vazba["nazev"], spoj(leva, slova))
    podle = {(u["sekce"], u["resort"], u["cislo"]): u for u in ukoly}
    norm = lambda t: re.sub(r"[^0-9a-záčďéěíňóřšťúůýž]", "", (t or "").lower())
    for v in vazby:
        # Párovat podle názvu: číslo „k č.“ v tabulce vazeb bývá v dokumentu
        # chybné (vnitro v plánu 2026: posunuté o jedna). Číslo je jen záloha.
        nv = norm(v["nazev"])[:70]
        kandidati = [u for u in ukoly if u["sekce"] == v["sekce"] and u["resort"] == v["resort"] and nv and norm(u["nazev"]).startswith(nv)]
        u = kandidati[0] if len(kandidati) == 1 else podle.get((v["sekce"], v["resort"], v["cislo"]))
        if len(kandidati) == 1 and kandidati[0]["cislo"] != v["cislo"]:
            print(f"pozn.: {zdroj} {v['resort']}: vazba „k č. {v['cislo']}“ patří podle názvu k úkolu č. {kandidati[0]['cislo']}", file=sys.stderr)
        if not u:
            print(f"VAROVÁNÍ: vazba bez úkolu {zdroj} {v['resort']} č. {v['cislo']}", file=sys.stderr); continue
        u["program"] = pripoj(u.get("program", ""), v["text"])
    vychozi = lambda u: next((c for (s, c) in RESORT_KAPITOLA if s.lower() in (u["resort"] or "").lower()), None)
    for u in ukoly:
        u["predkladatel"] = " ".join(u["predkladatel"])
        for pole in ("nazev", "cil"): u[pole] = u[pole].strip()
        u["vazba"] = bool(u.get("program"))
        if not u["vazba"]:
            k = vychozi(u)
            u["kapitoly"], u["kapitoly_podle"] = ([k], "resort, bez vazby na program") if k else ([], "neurčeno")
        if u.get("program"):
            cisla = {int(m.group(1)) for m in CISLO_KAPITOLY.finditer(u["program"]) if 1 <= int(m.group(1)) <= 18}
            # „Hlavní strategický směr vlády č. 5“ = bod 1.5 (kapitola 1, Zásadní priority vlády).
            if STRATEGICKY_SMER.search(u["program"]): cisla.add(1)
            cisla = sorted(cisla)
            if cisla:
                u["kapitoly"], u["kapitoly_podle"] = cisla, "číslo ve vazbě"
            else:
                k = vychozi(u)
                u["kapitoly"], u["kapitoly_podle"] = ([k], "resort") if k else ([], "neurčeno")
        del u["sekce"]
    return ukoly

ap = argparse.ArgumentParser()
ap.add_argument("--plan", required=True); ap.add_argument("--plan-url", required=True)
ap.add_argument("--vyhled", required=True); ap.add_argument("--vyhled-url", required=True)
ap.add_argument("--usneseni", required=True)
ap.add_argument("--vystup", default="scripts/nastaveni/plan-legislativy.json")
a = ap.parse_args()
plan = cist(a.plan, "plan", a.plan_url)
vyhled = cist(a.vyhled, "vyhled", a.vyhled_url)
vse = plan + vyhled
s_vazbou = [u for u in vse if u.get("program")]
sha = lambda c: hashlib.sha256(open(c, "rb").read()).hexdigest()
data = {
    "_popis": "Plán legislativních prací vlády a Výhled legislativních prací, převedené z PDF nástrojem scripts/dev/plan-legislativy.py. Neupravovat ručně — při novém plánu převést znovu. „program“ je text, kterým vláda sama úkol přiřadila ke slibu programového prohlášení („vazba“); „kapitoly“ jsou čísla bodů programového prohlášení (= kapitoly Vládoměru), „kapitoly_podle“ říká, odkud se vzaly (číslo ve vazbě, nebo resort). Tabulka vazeb v dokumentu má u vnitra čísla úkolů posunutá o jedna — vazby se proto párují podle názvu úkolu.",
    "usneseni": a.usneseni,
    "zdroje": [{"druh": "plan", "url": a.plan_url, "sha256": sha(a.plan)}, {"druh": "vyhled", "url": a.vyhled_url, "sha256": sha(a.vyhled)}],
    "ukolu": len(vse), "s_vazbou_na_program": len(s_vazbou),
    "ukoly": vse,
}
with open(a.vystup, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=1); f.write("\n")
podle = {}
for u in s_vazbou: podle[u["kapitoly_podle"]] = podle.get(u["kapitoly_podle"], 0) + 1
print(f"úkolů {len(vse)} (plán {len(plan)}, výhled {len(vyhled)}), s vazbou na programové prohlášení {len(s_vazbou)}: {podle}")
for u in s_vazbou:
    if not u["kapitoly"]: print(f"  bez kapitoly: {u['zdroj']} {u['resort']} č. {u['cislo']}: {u['program'][:110]}")
