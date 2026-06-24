# Vládoměr

Bilingual (CS/EN) tracker of how the Czech government's programme statement is being delivered. Live counters (days in office / days to the estimated election), an expandable chapter → sub-group → item checklist mirroring the official document, per-item progress, dark mode, and a weekly AI evaluation.

- **Data source:** [Programové prohlášení vlády](https://vlada.gov.cz/cz/vlada/programove-prohlaseni/programove-prohlaseni-vlady-224629/) (approved 5 Jan 2026)
- **Stack:** React + Vite, deployed as a static site to GitHub Pages
- **Weekly evaluation:** GitHub Actions cron → Anthropic API (Haiku) → `public/evaluations.json`

## How it fits together

The browser **never** calls a model and **never** sees an API key. A scheduled job runs `scripts/evaluate.js` on the server every Friday, writes `public/evaluations.json`, and the static site just fetches that file.

```
push / Friday cron ─▶ GitHub Actions
                        ├─ (Fri only) npm run evaluate  ──▶ public/evaluations.json
                        └─ npm run build ──▶ deploy to GitHub Pages ──▶ your site
```

## Local development

```bash
npm install
npm run dev            # http://localhost:5173

# optional: generate real evaluations locally
ANTHROPIC_API_KEY=sk-ant-... npm run evaluate
```

## Deploy to GitHub Pages (recommended)

1. **Create the repo.** On GitHub create a repo (e.g. `vladomer`) under your account, then push these files to `main`:
   ```bash
   git init && git add . && git commit -m "init: vladomer"
   git branch -M main
   git remote add origin https://github.com/buuczech/vladomer.git
   git push -u origin main
   ```
2. **Add the API key as a secret.** Repo → **Settings → Secrets and variables → Actions → New repository secret**: name `ANTHROPIC_API_KEY`, value your key from <https://console.anthropic.com>.
3. **Turn on Pages.** Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **First deploy** happens automatically on push. Your site will be at:
   ```
   https://buuczech.github.io/vladomer/
   ```
5. **Populate the first evaluation.** Repo → **Actions → Deploy Vládoměr → Run workflow** (the manual run executes the evaluation step). After that it runs by itself every Friday.

That's it — the site is online and updates itself weekly.

## Cost

Each weekly run is 18 API calls (one per chapter) on Haiku with web search enabled — a few cents per week. Change the model with the `EVAL_MODEL` env var (e.g. `claude-sonnet-4-6` for deeper analysis).

## Editing the checklist

All commitments live in `src/data.js` as `{ id, cs, en }`. Add, reword, or regroup freely — just keep the `id` values stable, since the evaluations are keyed by them.

## Alternative: Vercel / Netlify

Import the repo, framework preset **Vite**, build `npm run build`, output `dist`. Hosting works instantly, but keep the **GitHub Actions** workflow for the Friday evaluation (free-tier cron on these hosts is more limited) — it commits `evaluations.json` back to the repo, which triggers a redeploy.

## Notes

- The election counter targets an **estimated** early-October 2029 date (regular four-year term); update `DATES.electionEstimate` in `src/data.js` once the date is set.
- AI assessments are **indicative, not official**, and are overwritten on each run.
- Item text is condensed for tracking; full wording is on vlada.gov.cz.
