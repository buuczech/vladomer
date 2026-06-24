import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DATES, CHAPTERS, ALL_ITEMS, TOTAL_ITEMS } from "./data.js";

/* =========================================================================
   VLÁDOMĚR — production build.
   The weekly AI evaluation runs server-side (GitHub Actions cron) and writes
   public/evaluations.json. The browser just fetches that file — no API key is
   ever shipped to the client. See README and scripts/evaluate.js.
   ========================================================================= */

const T = {
  appTitle: { cs: "Vládoměr", en: "Govern-o-meter" },
  appSubtitle: { cs: "Sledování plnění programového prohlášení vlády", en: "Tracking delivery of the government's programme statement" },
  govLabel: { cs: "Vláda Andreje Babiše · ANO + SPD + Motoristé sobě", en: "Babiš cabinet · ANO + SPD + Motoristé sobě" },
  daysInPower: { cs: "Ve funkci", en: "In office" },
  daysToElection: { cs: "Do voleb (odhad)", en: "To election (est.)" },
  overall: { cs: "Plnění programu", en: "Programme delivery" },
  days: { cs: "dní", en: "days" },
  evaluated: { cs: "hodnoceno", en: "evaluated" },
  ofItems: { cs: "z", en: "of" },
  lastUpdated: { cs: "Naposledy aktualizováno", en: "Last updated" },
  nextUpdate: { cs: "Další hodnocení", en: "Next evaluation" },
  never: { cs: "zatím neproběhlo", en: "not yet run" },
  refresh: { cs: "Obnovit", en: "Refresh" },
  loading: { cs: "Načítám…", en: "Loading…" },
  expandAll: { cs: "Rozbalit vše", en: "Expand all" },
  collapseAll: { cs: "Sbalit vše", en: "Collapse all" },
  searchPlaceholder: { cs: "Hledat v bodech programu…", en: "Search the programme…" },
  filterAll: { cs: "Vše", en: "All" },
  source: { cs: "Zdroj: programové prohlášení vlády", en: "Source: government programme statement" },
  methodology: { cs: "Jak se hodnotí", en: "How this is scored" },
  items: { cs: "bodů", en: "items" },
  noResults: { cs: "Žádné body neodpovídají hledání.", en: "No items match your search." },
  scope: { cs: "Oblastí", en: "Areas" },
  evalNote: {
    cs: "Každý bod hodnotí jazykový model na základě aktuálních zpráv. Hodnocení je orientační, ne oficiální. Stav i komentář se přepíší při příštím týdenním běhu.",
    en: "Each item is assessed by a language model using current news. Assessments are indicative, not official, and are overwritten on the next weekly run.",
  },
  archNote: {
    cs: "Hodnocení běží automaticky každý pátek na serveru (GitHub Actions) a zapisuje se do souboru, který tato stránka jen načítá.",
    en: "The assessment runs automatically every Friday on the server (GitHub Actions) and is written to a file this page just reads.",
  },
};

const STATUS = {
  fulfilled: { cs: "Splněno", en: "Done", color: "var(--ok)", score: 1, glyph: "✓" },
  in_progress: { cs: "Probíhá", en: "In progress", color: "var(--prog)", score: 0.5, glyph: "◐" },
  not_started: { cs: "Nezahájeno", en: "Not started", color: "var(--muted)", score: 0, glyph: "○" },
  stalled: { cs: "Uvázlo / opuštěno", en: "Stalled / dropped", color: "var(--bad)", score: 0, glyph: "✕" },
  pending: { cs: "Nehodnoceno", en: "Unrated", color: "var(--pending)", score: null, glyph: "–" },
};

function daysBetween(a, b) { return Math.floor((b - a) / 86400000); }
function fmtDate(d, lang) {
  return new Date(d).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function nextFriday(from) {
  const d = new Date(from); const day = d.getDay(); const add = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + add); d.setHours(9, 0, 0, 0); return d;
}

const CSS = `
:root{
  --bg:#f5f6f8; --surface:#ffffff; --surface-2:#fafbfc; --text:#161a1f;
  --muted:#6b7480; --border:#e4e7ec; --shadow:0 1px 2px rgba(20,26,31,.05),0 8px 24px rgba(20,26,31,.04);
  --accent:#1d4ed8; --ok:#137a4b; --prog:#b76e00; --bad:#b42318; --pending:#9aa3ad;
  --cz-blue:#11457e; --cz-red:#d7141a;
}
[data-theme="dark"]{
  --bg:#0d1014; --surface:#161b21; --surface-2:#1b212a; --text:#e7ebf0;
  --muted:#8a94a1; --border:#262e38; --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.35);
  --accent:#6f9bff; --ok:#3fcf8e; --prog:#e0a23a; --bad:#f87166; --pending:#6b7480;
  --cz-blue:#3f7fd6; --cz-red:#ff5a5f;
}
*{box-sizing:border-box}
.vm-root{background:var(--bg);color:var(--text);min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif;font-feature-settings:"tnum" on,"lnum" on;line-height:1.5;transition:background .25s,color .25s}
.vm-mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Roboto Mono",monospace;font-variant-numeric:tabular-nums}
.vm-wrap{max-width:980px;margin:0 auto;padding:0 16px 64px}
.vm-tricolor{height:3px;width:100%;display:flex}
.vm-tricolor i{flex:1}
.vm-tricolor i:nth-child(1){background:#fff;border-bottom:1px solid var(--border)}
.vm-tricolor i:nth-child(2){background:var(--cz-blue)}
.vm-tricolor i:nth-child(3){background:var(--cz-red)}
.vm-top{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--border)}
.vm-topbar{max-width:980px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px}
.vm-brand{display:flex;flex-direction:column;min-width:0}
.vm-brand h1{font-size:19px;font-weight:760;letter-spacing:-.02em;margin:0;white-space:nowrap}
.vm-brand p{margin:0;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vm-spacer{flex:1}
.vm-seg{display:inline-flex;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:var(--surface-2)}
.vm-seg button{appearance:none;border:0;background:transparent;color:var(--muted);padding:6px 10px;font-size:12.5px;font-weight:620;cursor:pointer}
.vm-seg button.on{background:var(--accent);color:#fff}
.vm-icon{appearance:none;border:1px solid var(--border);background:var(--surface-2);color:var(--text);width:34px;height:32px;border-radius:9px;cursor:pointer;font-size:15px}
.vm-hero{margin:18px 0 10px}
.vm-govline{font-size:12.5px;color:var(--muted);margin:0 0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vm-dot{width:7px;height:7px;border-radius:50%;background:var(--ok)}
.vm-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.vm-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:var(--shadow)}
.vm-card .lab{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;margin-bottom:6px}
.vm-big{font-size:40px;font-weight:780;letter-spacing:-.03em;line-height:1}
.vm-sub{font-size:11.5px;color:var(--muted);margin-top:6px}
.vm-gauge-wrap{display:flex;align-items:center;gap:14px}
.vm-pct{font-size:30px;font-weight:780;letter-spacing:-.03em}
.vm-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 6px}
.vm-meta{font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}
.vm-meta b{color:var(--text);font-weight:650}
.vm-ghost{appearance:none;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:620;font-size:12.5px;padding:8px 11px;border-radius:10px;cursor:pointer}
.vm-search{flex:1;min-width:180px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:10px;padding:9px 12px;font-size:13.5px}
.vm-search::placeholder{color:var(--muted)}
.vm-filters{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px}
.vm-chip{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:12px;font-weight:620;padding:5px 10px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.vm-chip.on{color:var(--text);border-color:var(--text)}
.vm-chip .sw{width:8px;height:8px;border-radius:50%}
.vm-list{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.vm-ch{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.vm-ch-head{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;user-select:none}
.vm-ch-num{font-size:12px;font-weight:740;color:var(--muted);width:22px;flex:none;text-align:center}
.vm-ch-title{font-weight:680;font-size:15px;letter-spacing:-.01em;flex:1;min-width:0}
.vm-ch-prog{display:flex;align-items:center;gap:10px;flex:none}
.vm-ch-pct{font-size:12.5px;font-weight:720;width:38px;text-align:right}
.vm-mini{width:70px;height:6px;border-radius:6px;background:var(--border);overflow:hidden}
.vm-mini > i{display:block;height:100%;background:var(--accent)}
.vm-caret{color:var(--muted);transition:transform .2s;flex:none}
.vm-caret.open{transform:rotate(90deg)}
.vm-ch-body{border-top:1px solid var(--border);padding:6px 0}
.vm-grp-title{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;padding:12px 16px 6px}
.vm-it{padding:9px 16px;border-top:1px solid var(--border)}
.vm-it:first-of-type{border-top:0}
.vm-it-row{display:flex;align-items:flex-start;gap:11px}
.vm-box{flex:none;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;margin-top:1px}
.vm-it-main{flex:1;min-width:0}
.vm-it-text{font-size:13.6px;line-height:1.45}
.vm-it-foot{display:flex;align-items:center;gap:10px;margin-top:5px;flex-wrap:wrap}
.vm-pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;display:inline-flex;align-items:center;gap:5px}
.vm-cmt-btn{appearance:none;border:0;background:transparent;color:var(--accent);font-size:11.5px;font-weight:650;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px}
.vm-cmt{margin-top:8px;font-size:12.7px;line-height:1.5;color:var(--text);background:var(--surface-2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:0 9px 9px 0;padding:9px 11px}
.vm-cmt .when{display:block;margin-top:6px;font-size:10.5px;color:var(--muted)}
.vm-id{font-size:10.5px;color:var(--muted)}
.vm-foot{margin-top:26px;font-size:12px;color:var(--muted);line-height:1.6}
.vm-foot a{color:var(--accent)}
.vm-foot h4{color:var(--text);font-size:12.5px;margin:14px 0 4px;text-transform:uppercase;letter-spacing:.06em}
.vm-empty{padding:30px;text-align:center;color:var(--muted);font-size:13px}
@media (max-width:680px){
  .vm-cards{grid-template-columns:1fr;gap:10px}.vm-big{font-size:34px}.vm-brand p{display:none}
  .vm-ch-title{font-size:14px}.vm-mini{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

function Ring({ pct, size = 64 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="7"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .5s" }} />
    </svg>
  );
}

export default function App() {
  const [lang, setLang] = useState("cs");
  const [dark, setDark] = useState(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches : false);
  const [evals, setEvals] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openCh, setOpenCh] = useState({ "1": true });
  const [openCmt, setOpenCmt] = useState({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());

  const t = (k) => T[k][lang];

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}evaluations.json?t=${Date.now()}`);
      if (res.ok) {
        const j = await res.json();
        setEvals(j.evals || {});
        setLastUpdated(j.lastUpdated || null);
      }
    } catch (e) { /* keep empty state */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const daysIn = daysBetween(new Date(DATES.tookOffice).getTime(), now);
  const electionMs = new Date(DATES.electionEstimate).getTime();
  const daysLeft = Math.max(0, daysBetween(now, electionMs));
  const termTotal = daysBetween(new Date(DATES.tookOffice).getTime(), electionMs);
  const termPct = Math.min(100, Math.max(0, (daysIn / termTotal) * 100));

  const { overallPct, evaluatedCount } = useMemo(() => {
    let sum = 0, n = 0;
    for (const it of ALL_ITEMS) {
      const e = evals[it.id];
      if (e && STATUS[e.status] && STATUS[e.status].score !== null) { sum += STATUS[e.status].score; n++; }
    }
    return { overallPct: n ? Math.round((sum / n) * 100) : 0, evaluatedCount: n };
  }, [evals]);

  const chapterStats = useCallback((ch) => {
    let sum = 0, n = 0, tot = 0;
    for (const g of ch.groups) for (const it of g.items) {
      tot++; const e = evals[it.id];
      if (e && STATUS[e.status] && STATUS[e.status].score !== null) { sum += STATUS[e.status].score; n++; }
    }
    return { pct: n ? Math.round((sum / n) * 100) : 0, evaluated: n, total: tot };
  }, [evals]);

  const statusOf = (id) => (evals[id] ? evals[id].status : "pending");

  const matches = useCallback((it) => {
    if (query) {
      const q = query.toLowerCase();
      if (!it.cs.toLowerCase().includes(q) && !it.en.toLowerCase().includes(q) && !it.id.includes(q)) return false;
    }
    if (filter !== "all" && statusOf(it.id) !== filter) return false;
    return true;
  }, [query, filter, evals]);

  const filtering = query !== "" || filter !== "all";

  function setAllOpen(open) {
    const o = {}; if (open) CHAPTERS.forEach((c) => (o[c.id] = true)); setOpenCh(o);
  }

  const next = nextFriday(lastUpdated ? new Date(lastUpdated) : new Date(now));
  const filterOpts = ["all", "fulfilled", "in_progress", "not_started", "stalled", "pending"];

  return (
    <div className="vm-root" data-theme={dark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="vm-top">
        <div className="vm-tricolor"><i /><i /><i /></div>
        <div className="vm-topbar">
          <div className="vm-brand"><h1>{t("appTitle")}</h1><p>{t("appSubtitle")}</p></div>
          <div className="vm-spacer" />
          <div className="vm-seg" role="group" aria-label="language">
            <button className={lang === "cs" ? "on" : ""} onClick={() => setLang("cs")}>CS</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="vm-icon" onClick={() => setDark((d) => !d)} aria-label="theme">{dark ? "☀" : "☾"}</button>
        </div>
      </div>

      <div className="vm-wrap">
        <div className="vm-hero">
          <p className="vm-govline">
            <span className="vm-dot" />
            {t("govLabel")} · {lang === "cs" ? "ve funkci od" : "in office since"} {fmtDate(DATES.tookOffice, lang)}
          </p>
          <div className="vm-cards">
            <div className="vm-card">
              <div className="lab">{t("daysInPower")}</div>
              <div className="vm-big vm-mono">{daysIn.toLocaleString(lang === "cs" ? "cs-CZ" : "en")}</div>
              <div className="vm-sub">{t("days")} · {Math.round(termPct)}% {lang === "cs" ? "volebního období" : "of the term"}</div>
            </div>
            <div className="vm-card">
              <div className="lab">{t("daysToElection")}</div>
              <div className="vm-big vm-mono">{daysLeft.toLocaleString(lang === "cs" ? "cs-CZ" : "en")}</div>
              <div className="vm-sub">{t("days")} · ~{fmtDate(DATES.electionEstimate, lang)}</div>
            </div>
            <div className="vm-card">
              <div className="lab">{t("overall")}</div>
              <div className="vm-gauge-wrap">
                <Ring pct={overallPct} />
                <div>
                  <div className="vm-pct vm-mono">{overallPct}%</div>
                  <div className="vm-sub">{evaluatedCount} {t("ofItems")} {TOTAL_ITEMS} {t("evaluated")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="vm-controls">
          <button className="vm-ghost" onClick={loadData} disabled={loading}>
            ↻ {loading ? t("loading") : t("refresh")}
          </button>
          <div className="vm-meta">
            <span>{t("lastUpdated")}: <b>{lastUpdated ? fmtDate(lastUpdated, lang) : t("never")}</b></span>
            <span>{t("nextUpdate")}: <b>{fmtDate(next, lang)}</b></span>
            <span>{t("scope")}: <b>{CHAPTERS.length}</b> · {TOTAL_ITEMS} {t("items")}</span>
          </div>
        </div>

        <div className="vm-controls">
          <input className="vm-search" placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="vm-ghost" onClick={() => setAllOpen(true)}>{t("expandAll")}</button>
          <button className="vm-ghost" onClick={() => setAllOpen(false)}>{t("collapseAll")}</button>
        </div>
        <div className="vm-filters">
          {filterOpts.map((f) => (
            <button key={f} className={`vm-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f !== "all" && <span className="sw" style={{ background: STATUS[f].color }} />}
              {f === "all" ? t("filterAll") : STATUS[f][lang]}
            </button>
          ))}
        </div>

        <div className="vm-list">
          {CHAPTERS.map((ch) => {
            const st = chapterStats(ch);
            const open = !!openCh[ch.id] || filtering;
            const groups = ch.groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length > 0);
            if (filtering && groups.length === 0) return null;
            return (
              <div className="vm-ch" key={ch.id}>
                <div className="vm-ch-head" onClick={() => setOpenCh((o) => ({ ...o, [ch.id]: !o[ch.id] }))}>
                  <span className="vm-ch-num vm-mono">{ch.id}</span>
                  <span className="vm-ch-title">{ch.title[lang]}</span>
                  <span className="vm-ch-prog">
                    <span className="vm-mini"><i style={{ width: `${st.pct}%` }} /></span>
                    <span className="vm-ch-pct vm-mono">{st.evaluated ? `${st.pct}%` : "–"}</span>
                  </span>
                  <svg className={`vm-caret ${open ? "open" : ""}`} width="14" height="14" viewBox="0 0 14 14">
                    <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                {open && (
                  <div className="vm-ch-body">
                    {groups.map((g, gi) => (
                      <div key={gi}>
                        <div className="vm-grp-title">{g.title[lang]}</div>
                        {g.items.map((it) => {
                          const status = statusOf(it.id);
                          const sObj = STATUS[status];
                          const e = evals[it.id];
                          const cmtOpen = !!openCmt[it.id];
                          return (
                            <div className="vm-it" key={it.id}>
                              <div className="vm-it-row">
                                <span className="vm-box" style={{
                                  borderColor: sObj.color,
                                  color: status === "fulfilled" ? "#fff" : sObj.color,
                                  background: status === "fulfilled" ? sObj.color : "transparent",
                                }}>{status === "fulfilled" ? "✓" : sObj.glyph}</span>
                                <div className="vm-it-main">
                                  <div className="vm-it-text">{it[lang]}</div>
                                  <div className="vm-it-foot">
                                    <span className="vm-pill" style={{ color: sObj.color, border: `1px solid ${sObj.color}` }}>{sObj[lang]}</span>
                                    <span className="vm-id vm-mono">#{it.id}</span>
                                    {e && e.comment && (e.comment[lang] || e.comment.cs) && (
                                      <button className="vm-cmt-btn" onClick={() => setOpenCmt((o) => ({ ...o, [it.id]: !o[it.id] }))}>
                                        {cmtOpen ? (lang === "cs" ? "skrýt komentář" : "hide note") : (lang === "cs" ? "komentář hodnocení" : "show note")}
                                        <span>{cmtOpen ? "▴" : "▾"}</span>
                                      </button>
                                    )}
                                  </div>
                                  {cmtOpen && e && e.comment && (
                                    <div className="vm-cmt">
                                      {e.comment[lang] || e.comment.cs}
                                      {e.updatedAt && <span className="when">{t("lastUpdated")}: {fmtDate(e.updatedAt, lang)}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filtering && CHAPTERS.every((ch) => ch.groups.every((g) => g.items.every((it) => !matches(it)))) && (
            <div className="vm-empty">{t("noResults")}</div>
          )}
        </div>

        <div className="vm-foot">
          <h4>{t("methodology")}</h4>
          <p>{t("evalNote")}</p>
          <p>{t("archNote")}</p>
          <p>
            {t("source")} · <a href="https://vlada.gov.cz/cz/vlada/programove-prohlaseni/programove-prohlaseni-vlady-224629/" target="_blank" rel="noopener noreferrer">vlada.gov.cz</a>
            {" "}· {lang === "cs" ? "schváleno" : "approved"} {fmtDate(DATES.programmeApproved, lang)} · {lang === "cs" ? "důvěra" : "confidence vote"} {fmtDate(DATES.confidenceVote, lang)}
          </p>
        </div>
      </div>
    </div>
  );
}
