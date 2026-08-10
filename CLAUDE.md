# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Vládoměr (vladomer.cz) tracks how the Czech government delivers its programme statement: 143 commitments, re-assessed every Friday by a language model, published as a static site. The site's only asset is being believable, so most of the design decisions below trade convenience for verifiability.

The UI, the prompts and most code comments are in Czech. Keep it that way.

## Commands

```bash
npm run dev            # http://localhost:5173
npm run build          # also generates /prehled/, /overview/, prompty.json and the JSON-LD
npm run evaluate       # the weekly run — COSTS MONEY, needs ANTHROPIC_API_KEY
npm run og             # redraw public/og.png (needs Chrome)
npm run instagram      # build the weekly post; --rezim verify|build|publish
```

There is no test runner and no linter. Two free offline checks stand in for them and should be run after touching what they cover:

```bash
node scripts/dev/test-korektura.js      # proofreading guard: forged corrections must be rejected
ANTHROPIC_API_KEY=x CHAPTER_LIMIT=18 \
  node --import ./scripts/dev/dump-prompts.js scripts/evaluate.js   # prints every prompt, sends nothing
```

`dump-prompts` is the tool for any change that could alter what the model receives: capture its output before and after and diff. An empty diff is the proof. It restores `public/*.json` on exit, so it cannot clobber live data.

## What costs money

- **Push to `dev` touching `scripts/**`, `src/data.js` or `dev-eval.yml`** → a paid five-chapter evaluation (`.github/workflows/dev-eval.yml` path filter). Front-end work on `dev` is free.
- **Push to `main` never evaluates.** `deploy.yml` gates the evaluation step on `github.event_name != 'push'`, so merges only build and deploy. The model runs from the Friday cron or a manual dispatch. This also means `scripts/` can be edited for free on `main`.

Before running anything that calls the API, ask whether a dry-run tool answers the question instead.

## Architecture

Three separate things share one repository:

1. **The site** — React + Vite, `src/App.jsx` (one large file by choice). Fetches `public/*.json` at runtime; the browser never calls a model and never sees a key.
2. **The weekly pipeline** — `scripts/evaluate.js`, run by GitHub Actions on Fridays at 09:00 UTC. Writes `evaluations.json`, `history.json`, `news.json`, `audit.json` back into the repo, which triggers a deploy.
3. **Build-time generation** — plugins in `vite.config.js` emit the static listings at `/prehled/` and `/overview/`, `prompty.json`, and the JSON-LD injected into `index.html`. Anything containing current figures is generated, never committed by hand, because a hard-coded number is wrong within the week.

`scripts/lib/` holds what the pipeline and the build share: `nastaveni.js` (settings + strict templating), `prompty.js` (prompt assembly), `korektura.js` (proofreading), `prehled.js`, `seo.js`.

### Invariants worth knowing before editing

**The strict metric exists in five places** — `src/App.jsx` (`donePct`), `scripts/og-image.js`, `scripts/lib/seo.js`, `scripts/lib/prehled.js`, `scripts/instagram/post.js`. It is `fulfilled / rated`, with `unverifiable` excluded from the denominator; partial and in-progress are reported separately and never folded in. Change the rule in one place and the page, the share card, the structured data, the listing and the Instagram post will state different numbers for the same cabinet.

**`vite.config.js` `base: "./"` must stay.** It keeps the build working from both the domain and the github.io project path.

**`scripts/nastaveni/` is owner-editable plain text** — prompts, tunable numbers, source whitelists — deliberately outside `public/` so it is not published, and pinned to LF by `.gitattributes` because it is read at runtime. `scripts/nastaveni/NAVOD.md` documents it for a non-programmer; keep that promise.

**`render()` in `scripts/lib/nastaveni.js` is strict on purpose**: an unknown placeholder, an unused value, or any leftover `{{` all abort the run — including a `{{` written inside an HTML comment. That is what stops a broken template reaching the public site or a social profile.

**Error message strings are load-bearing.** `withBackoff` decides whether to retry by matching `/API (429|5\d\d)/`, `/JSON/` or the `[opakovat]` marker in the message text.

**Dead ends, already paid for:** structured outputs (`output_config.format`) and assistant prefill each silently suppress the `web_search` tool, leaving the model with no sources. JSON stays prompt-enforced. Raising `vyhledavani_zpravy` makes the headline step worse, not better — search rounds consume the same output budget the JSON needs.

**Guards belong in code, not prompts.** The model has repeatedly produced true-but-irrelevant facts that instructions alone did not stop: `evaluate.js` therefore drops invented URLs, downgrades a `fulfilled` claim with no citation, and refuses evidence dated before the cabinet took office.

### Branches and flags

`.env` **is committed** and holds `VITE_MENU_*` feature flags — never secrets. It differs per branch by design (dev: everything on; main: only what is public), so a conflict when merging `dev → main` is expected: **keep main's version**, and keep main's `public/*.json` too, so published data comes only from production runs. `eval-log.txt` is dev-only and must not reach main.

Flags must be written out statically in `MENU_FLAGS`; Vite substitutes `import.meta.env.VITE_*` at build time, so a computed key silently yields `undefined`.

Verify a flag by clicking through the built site, not by grepping the bundle — page titles are compiled in either way; the flag only governs whether the menu renders them.

### Instagram

`.github/workflows/instagram.yml`, Fridays 17:00 UTC. Modes: `verify`, `dry`, `zkouska` (everything except the final publish), `post`. Instagram fetches the image from a public URL itself, so build and publish are separate steps with a commit in between; images land in `ig-archive/` (outside `public/`, committed with `[skip ci]`) and are published from `raw.githubusercontent.com`. Images must be JPEG. `zkouska` exists because publishing is the one irreversible step — use it rather than testing by posting.

## Gotchas

- Czech quotes in JS strings: `„…"` needs the curly closing quote `"` (U+201C). A straight `"` terminates the string literal and the build error points somewhere unhelpful.
- Never move image bytes through the conversation. A base64 round-trip silently truncated once and produced a corrupt PNG that still had a valid header and correct dimensions. Generate on disk.
- `git pull --rebase` on a branch with a merge commit will flatten it and can drop changes folded into that commit. Use plain `git pull`.
