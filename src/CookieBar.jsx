/* Cookie consent for Google Analytics.
 *
 * Analytics cookies are not "technically necessary", so under zák. 127/2005 Sb.
 * § 89 odst. 3 they need consent BEFORE they are set — an opt-out banner is not
 * enough. That has one hard consequence for the implementation: gtag.js must not
 * be in index.html. It is injected here, and only after the visitor accepts.
 * Nothing about the visitor reaches Google until then.
 *
 * Refusal is stored too, so it is not asked again on every visit, and the
 * decision can be changed from the footer — withdrawing consent has to be as
 * easy as giving it.
 */
import React, { useCallback, useEffect, useState } from "react";

const GA_ID = "G-CLX7WP6R4X";
const KEY = "vm-cookie-consent"; // "yes" | "no"

const T = {
  text: {
    cs: "Rádi bychom měřili návštěvnost přes Google Analytics, abychom věděli, které části webu dávají smysl. Bez vašeho souhlasu se nespustí a nic se neodesílá.",
    en: "We would like to measure traffic with Google Analytics to learn which parts of the site are useful. Without your consent it does not run and nothing is sent.",
  },
  accept: { cs: "Souhlasím", en: "Accept" },
  reject: { cs: "Odmítnout", en: "Reject" },
  settings: { cs: "Nastavení cookies", en: "Cookie settings" },
  stateYes: { cs: "měření zapnuto", en: "measurement on" },
  stateNo: { cs: "měření vypnuto", en: "measurement off" },
};

export function readConsent() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/* Loads gtag.js once. Called only from the accept path — never on module load,
   or the script would be requested before the visitor had a say. */
let loaded = false;
function loadAnalytics() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  // IP anonymisation is on by default in GA4; spelled out so it is not lost
  // in a later config edit.
  gtag("config", GA_ID, { anonymize_ip: true });
}

export default function CookieBar({ lang, openSignal }) {
  const [choice, setChoice] = useState(() => readConsent());
  const [open, setOpen] = useState(false);
  const tr = (k) => T[k][lang] || T[k].cs;

  // Start the tracker on a return visit where consent already exists.
  useEffect(() => { if (readConsent() === "yes") loadAnalytics(); }, []);

  // The footer button re-opens the bar so a decision can be changed.
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);

  const decide = useCallback((yes) => {
    try { localStorage.setItem(KEY, yes ? "yes" : "no"); } catch { /* private mode */ }
    setChoice(yes ? "yes" : "no");
    setOpen(false);
    if (yes) loadAnalytics();
    // Refusing after having accepted: the already-loaded tracker keeps running
    // until the page is reloaded, so reload to make the refusal take effect now.
    else if (loaded) window.location.reload();
  }, []);

  if (choice && !open) return null;

  return (
    <div className="vm-cookie" role="dialog" aria-label={tr("settings")}>
      <p>{tr("text")}</p>
      <div className="vm-cookie-btns">
        <button className="vm-ghost" onClick={() => decide(false)}>{tr("reject")}</button>
        <button className="vm-cookie-ok" onClick={() => decide(true)}>{tr("accept")}</button>
      </div>
    </div>
  );
}

/* Footer control. Shows the current state so the choice is visible, not buried. */
export function CookieSettingsLink({ lang, onOpen }) {
  const c = readConsent();
  const tr = (k) => T[k][lang] || T[k].cs;
  return (
    <button className="vm-link" onClick={onOpen}>
      {tr("settings")}{c ? ` (${c === "yes" ? tr("stateYes") : tr("stateNo")})` : ""}
    </button>
  );
}
