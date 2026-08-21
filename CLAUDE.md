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
npm run prispevek -- --zadani ig-posts/….json     # ad-hoc carousel
npm run reel -- --zadani ig-posts/….json          # ad-hoc reel (needs ffmpeg)
```

There is no test runner and no linter. Three free offline checks stand in for them and should be run after touching what they cover:

```bash
node scripts/dev/test-korektura.js      # proofreading guard: forged corrections must be rejected
node scripts/dev/test-zabrany.js        # evidence bar for "fulfilled", against real past evidence
node scripts/dev/test-konzistence.js    # published data against itself and against the five metric sites
ANTHROPIC_API_KEY=x CHAPTER_LIMIT=18 \
  node --import ./scripts/dev/dump-prompts.js scripts/evaluate.js   # prints every prompt, sends nothing
```

All three run in CI on every push (`deploy.yml`, `dev-eval.yml`), and `test-konzistence.js` runs again on the weekly run's fresh data *before* it is committed: a failure there uploads the produced JSON as an artifact and stops the job, so the site keeps last week's data rather than publishing something that contradicts itself. It separates **CHYBA** (exit 1 — the site is inconsistent now) from **VAROVÁNÍ** (exit 0 — one data value away from being inconsistent); a warning is a finding, not noise. It imports its rules from `lib/dukaz.js`, `lib/korektura.js` and `src/data.js` rather than restating them, for the same reason `prepocet-degradaci.js` does.

`dump-prompts` is the tool for any change that could alter what the model receives: capture its output before and after and diff. An empty diff is the proof. It restores `public/*.json` on exit, so it cannot clobber live data.

The `/kontrola` skill (`.claude/skills/kontrola/`) drives a wider audit — data consistency, fact-check, UI, code, security — on top of those three. Its reports go to `kontroly/`, which is gitignored on purpose: a security finding in a public repo is a disclosure.

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

**The gauges are a stack, and a rounded cap overstates a segment.** The four arcs are cumulative from twelve o'clock, longest painted first, so the colours run into one another instead of meeting at a pinch — and therefore **no arc may use `opacity`**, or overlapping colours blend and stop matching the legend. `stroke-linecap="round"` adds half the stroke width beyond each end, which on the Instagram gauge is 3.4% of the circle per segment and on the site's `Ring` almost 4% — enough to draw 5.7% as 9.1%. Both gauges therefore shorten each arc by the stroke width and shift its offset by half, so the *painted* span equals the true share, and both fall back to butt caps for a segment shorter than the stroke, which cannot be rounded without inflating it. The geometry is deliberately duplicated in `src/App.jsx` (`Ring`) and `scripts/instagram/post.js` (`oblouk`) rather than shared across the src/scripts boundary; if you change one, change the other. `scripts/og-image.js` is exempt — its arcs are cumulative from a common origin, so only the outer cap is ever visible.

**`vite.config.js` `base: "./"` must stay.** It keeps the build working from both the domain and the github.io project path.

**`scripts/nastaveni/` is owner-editable plain text** — prompts, tunable numbers, source whitelists — deliberately outside `public/` so it is not published, and pinned to LF by `.gitattributes` because it is read at runtime. `scripts/nastaveni/NAVOD.md` documents it for a non-programmer; keep that promise.

**`render()` in `scripts/lib/nastaveni.js` is strict on purpose**: an unknown placeholder, an unused value, or any leftover `{{` all abort the run — including a `{{` written inside an HTML comment. That is what stops a broken template reaching the public site or a social profile.

**A chapter that is too big silently truncates its own answer.** The reply grows with both the item count and the length of the comments; past `max_tokens` the JSON is cut mid-object and surfaces as `Expected ',' or '}'`, which looks like a model failure but is a budget failure — retrying cannot help, because the ceiling is the same every time. Chapter 2 (15 items) passed for four runs and then started failing on 2026-08-21. `evaluate.js` therefore splits any chapter over `MAX_BODU_DAVKA` items into even batches; a chapter counts as failed if **any** of its batches fails, so a chapter is never half fresh and half a week old. Splitting changes the item list in the prompt and nothing else — prove it with `dump-prompts` before and after.

**A failed chapter keeps its previous ratings** (the merge never overwrites), so the site would otherwise claim a freshness it does not have for those items. Both `src/App.jsx` and `scripts/lib/prehled.js` compute the stale chapters the same way — no item in the chapter carries the run's date — and say so, in the header and in the listing. Change one, change the other.

**Error message strings are load-bearing.** `withBackoff` decides whether to retry by matching `/API (429|5\d\d)/`, `/JSON/` or the `[opakovat]` marker in the message text.

**Dead ends, already paid for:** structured outputs (`output_config.format`) and assistant prefill each silently suppress the `web_search` tool, leaving the model with no sources. JSON stays prompt-enforced. Raising `vyhledavani_zpravy` makes the headline step worse, not better — search rounds consume the same output budget the JSON needs.

**Guards belong in code, not prompts.** The model has repeatedly produced true-but-irrelevant facts that instructions alone did not stop: `evaluate.js` therefore drops invented URLs, downgrades a `fulfilled` claim with no citation, and refuses evidence dated before the cabinet took office. The rule itself lives in `scripts/lib/dukaz.js`, not in `evaluate.js`, because already-published data has to be recomputable by exactly the same rule (`scripts/dev/prepocet-degradaci.js`); two copies would drift.

**A guard that is too eager is as damaging as no guard.** The date check used to compare the year inside a cited act number against the evidence date, which quietly demoted the single most common way a promise gets delivered here — an amendment to an older act ("novela zákona č. 117/1995 Sb., schválená 8. 7. 2026"). It cost two `fulfilled` items in one week and made the site *understate* delivery, which for a watchdog is the worst direction to be wrong in. Comparing years cannot work: this cabinet took office on 15 December, so "2025" is ambiguous. The rule now asks whether the *only* thing tying the claim to the term is the day an older rule took effect. Any change here needs `test-zabrany.js`, whose fixtures are verbatim evidence strings from real runs.

**`audit.json` is append-only and the site says so in three places** (methodology, FAQ, "how do I know you're not making this up"). Corrections are appended as new entries carrying an `oprava` field — never written over the original row. Breaking that promise to fix a number would cost more than the number is worth.

### Branches and flags

**Secrets.** Instagram and Anthropic keys live only in GitHub Actions secrets. The one key that must exist locally is `ELEVENLABS_API_KEY`, because reels are built on the owner's machine — it belongs in `.env.local`, covered by `*.local` in `.gitignore`. Vite reads that file too, but only exposes `VITE_`-prefixed vars, so the key does not reach the bundle (verified by grepping `dist/`). A pre-commit hook in `scripts/dev/hooks/` refuses to commit anything key-shaped; enable it in a fresh clone with `git config core.hooksPath scripts/dev/hooks`. The hook reports line numbers only and never echoes the matching line — hook output ends up in CI logs and session transcripts, where printing the secret would just move the leak.

`.env` **is committed** and holds `VITE_MENU_*` feature flags — never secrets. It differs per branch by design (dev: everything on; main: only what is public), so a conflict when merging `dev → main` is expected: **keep main's version**, and keep main's `public/*.json` too, so published data comes only from production runs. `eval-log.txt` is dev-only and must not reach main.

Flags must be written out statically in `MENU_FLAGS`; Vite substitutes `import.meta.env.VITE_*` at build time, so a computed key silently yields `undefined`.

Verify a flag by clicking through the built site, not by grepping the bundle — page titles are compiled in either way; the flag only governs whether the menu renders them.

### Instagram

`.github/workflows/instagram.yml`, Fridays 17:00 UTC. Modes: `verify`, `dry`, `zkouska` (everything except the final publish), `post`, plus `adhoc` and `reel` for approved one-off content. Instagram fetches the media from a public URL itself, so build and publish are separate steps with a commit in between; files land in `ig-archive/` (outside `public/`, committed with `[skip ci]`) and are published from `raw.githubusercontent.com`. Images must be JPEG. `zkouska` exists because publishing is the one irreversible step — use it rather than testing by posting.

Three producers, one publisher: `post.js` (weekly, from site data, unattended), `adhoc.js` (carousel from an `ig-posts/*.json` spec) and `reel.js` (9:16 video from the same folder, distinguished by `"typ": "reel"`). Only `scripts/lib/instagram.js` calls `media_publish`, so the duplicate-post guard and the wait after `FINISHED` cannot be bypassed. Spec validation lives in `scripts/lib/zadani.js` because the hourly scheduler in `adhoc.js --rezim naplanovane` handles both kinds and must not carry its own copy of the rules.

**Approved content is published byte-for-byte, never re-rendered.** The runner has DejaVu where Windows has Segoe UI, so re-drawing on CI would rewrap text the owner already signed off on. Corollary: do not rebuild an already-published archive locally — it produces a spurious diff against what actually went out.

**Formats follow Instagram's 2026 defaults.** Posts and carousels are 1080×1440 (3:4), not the old 1080×1080 square — `SIRKA`/`VYSKA` in `lib/instagram.js`. Every slide in one carousel must share the ratio; Instagram rejects a mixed set. Rows inside a slide are `flex:none` with the container centring them, because at 3:4 a `flex:1` row stretches across half the canvas when there are only two of them.

Reels: each scene is one Chrome screenshot at 1080×1920 and ffmpeg supplies the motion (`zoompan` over a 2× supersample, `xfade` between scenes). The safe zone is **285 px top, 510 px bottom** and the arithmetic behind it is worth keeping straight, because three constraints stack: Instagram's own UI (no-go 220 top / 450 bottom), the 3:4 window it crops for the profile grid (leaving 240–1440 whichever way that window is aligned), and then the zoom, which magnifies distance from centre by up to 6% and pushes anything sitting on the boundary past it — measured at 212/1457 before this was compensated. Hence 960 − 720/1.06 ≈ 285 and 960 + 480/1.06 ≈ 1412. **Change `ZOOM` in `reel.js` and these numbers must be recomputed.** Sides stay at 90 px though the official minimum is 35. The tricolour sits next to the logo rather than bleeding to the edge, where the zoom would crop it. Video needs `in_range=full:out_range=tv` and `-color_range tv`, otherwise it is tagged `yuvj420p` and looks blown out. Instagram takes minutes to transcode a reel, hence the ten-minute container wait. A reel published through the API cannot carry catalogue music — that is app-only.

Reel audio is two layers, both generated: narration — ElevenLabs when `ELEVENLABS_API_KEY` is set (in `.env.local`, never `.env`, which is committed), otherwise the Windows OneCore voice (`lib/hlas.js` → `hlas.ps1`) — and a music bed picked from the four Eleven Music tracks in `scripts/nastaveni/hudba/` (`lib/hudba.js` still synthesises a sine-wave loop, but only as a fallback for an empty folder), ducked under the speech by `sidechaincompress` and mastered to −14 LUFS. The bed is loudness-normalised to a fixed −26 LUFS rather than given a fixed gain, because the four tracks differ by 11 dB between themselves and a user-supplied MP3 could differ by far more. Generated speech is cached by hash of text+voice+settings in `ig-archive/hlas-cache/` (gitignored): that caps the credit cost of iterating, and it means a rebuilt reel sounds identical to the approved one, which a fresh API call would not. Four things here are easy to get wrong. The system Czech voice is WinRT-only (System.Speech sees just the English Zira, and re-registering the voice would mean editing the registry), so without an ElevenLabs key a reel can only be built on Windows — fine, since the runner never encodes, only publishes. `sidechaincompress` ends with the *shorter* of its two inputs, so the narration mix must be `apad`ded to the full length or the music stops at the last word. **Scene length is derived from the narration**, with `trvani` only a floor, so the finished reel runs longer than the sum of `trvani` in the spec. And ElevenLabs' *stock* voices are recorded by English speakers and carry the accent into Czech — take voices from `GET /v1/shared-voices?language=cs` instead, whose ids work directly in a TTS call without being added to the account first.

Two ElevenLabs quirks worth knowing before debugging anything: the credit counter on `/v1/user/subscription` lags a minute or two behind, so a reading taken right after a build understates the spend; and music costs about 12.5 credits per second (a 40 s bed is ~500) against ~150 credits for a whole reel's narration, which is why beds are generated once and reused rather than per reel. Music licensing differs from speech: commercial use including social video is fine from Starter up, but distribution to music streaming services and to TV/radio is not.

## Gotchas

- Czech quotes in JS strings: `„…"` needs the curly closing quote `"` (U+201C). A straight `"` terminates the string literal and the build error points somewhere unhelpful.
- Never move image bytes through the conversation. A base64 round-trip silently truncated once and produced a corrupt PNG that still had a valid header and correct dimensions. Generate on disk.
- `git pull --rebase` on a branch with a merge commit will flatten it and can drop changes folded into that commit. Use plain `git pull`.
