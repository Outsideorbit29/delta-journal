@AGENTS.md

# Delta Journal: project guide

> **Standing rule: update this file with every change to the project.** Any commit that
> adds, removes or changes behaviour, setup, environment variables, commands, data model or
> conventions must update the matching section here **in the same commit**, and add a line
> to the [Changelog](#changelog). If something here is wrong, fix it. This file is the
> source of truth for how the project works.

## What this is

A trading journal and habit-insight app for one trader's own **Delta Exchange India**
account. It syncs fills, orders and the wallet ledger from Delta's API, rebuilds them into
round-trip trades, tags each trade with behaviour patterns, lets the trader journal each
trade (web or Telegram), and uses AI for weekly coaching reviews, note tagging and voice
notes. It is installable on a phone as a PWA.

The trader mostly trades perpetual futures, especially **XAUTUSD** (tokenized gold), plus
BTC, SOL and ETH. History goes back to July 2024 (about 135 trades at the time of writing).
The goal is to show *why* they lose, not just what happened. The main finding so far:
fees dwarf gross P&L, scalps lose, and moving a stop while still losing is the costliest habit.

## Live setup

| Part | Where | Notes |
|---|---|---|
| Web app (PWA) | https://delta-journal-three.vercel.app | Vercel project `delta-journal` (team `anish-kumars-projects`), Hobby plan, region `bom1` (Mumbai). Git-connected: **every push to `main` deploys to production.** |
| Database | Turso (libSQL), free plan | `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. Both the hosted app and the PC use it. |
| Sync + Telegram bot | The trader's Windows PC: `npm run bot` | The only place with the Delta and Telegram keys. Must run in the user's own terminal: Claude Code kills background jobs when memory is low. |
| Code | https://github.com/Outsideorbit29/delta-journal (private) | Branch `main`. |
| Local backup | `data/journal-backup-before-cloud.db` | Snapshot taken just before moving to Turso (2026-10-31). |

Syncing with Delta **only runs on the PC**, because the Delta API key is IP-whitelisted and
Vercel's IPs are not fixed. The hosted app hides the Sync button and `/api/sync` returns 403
there (`canSyncHere()` in `src/lib/runtime.ts`).

## Stack

- **Next.js 16.4** (App Router, Turbopack, **Cache Components on**, `src/` dir), React 19.3,
  TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using Next APIs (see AGENTS.md).
- **Drizzle ORM** + **@libsql/client** (SQLite locally, Turso in the cloud). Migrations in `drizzle/`.
- **AI SDK 7** (`ai`) through **Vercel AI Gateway** with plain `provider/model` strings; `zod` for schemas.
- **lightweight-charts 5** (TradingView, Apache-2.0: keep its attribution logo on) for candles;
  other charts are hand-drawn SVG.
- **Vitest** for tests, **tsx** for scripts, **Vercel CLI** (local dev dependency) for deploys,
  `vercel.ts` (`@vercel/config`) for platform config.
- Node 24 on Windows 11. Git Bash and PowerShell are both available.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local app on http://127.0.0.1:3000 (bound to localhost on purpose) |
| `npm run bot` | Telegram bot + Delta sync every 60 s (+ weekly AI review). Keep it running on the PC. |
| `npm run sync` | One sync; prints rows written, and rebuilds trades only if something changed |
| `npm run rebuild` | Recompute trades and auto tags from stored data (after changing `src/lib/config.ts`) |
| `npm run db:generate` | New migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (the hosted app never migrates) |
| `npm run db:copy-to-cloud` | Copy `data/journal.db` into an **empty** Turso DB, checking every table's row count |
| `npm test` / `npm run typecheck` / `npm run lint` | Vitest / `tsc --noEmit` / ESLint |
| `npx next typegen` | Regenerate route types (`PageProps`, `RouteContext`) after adding routes |
| `npx vercel deploy --prod` | Manual production deploy (normally a push to `main` is enough) |

Scripts load `.env.local` via `node --env-file-if-exists=.env.local --import tsx`.

## Environment variables

`.env.local` on the PC (never committed, never uploaded: `.gitignore` + `.vercelignore`).
`.env.example` documents them all.

| Variable | Where | Purpose |
|---|---|---|
| `DELTA_API_KEY`, `DELTA_API_SECRET` | PC only | Delta **Read Data** key for sync (IP-whitelisted) |
| `DELTA_BASE_URL` | optional | Defaults to `https://api.india.delta.exchange` |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | PC + Vercel | Turso `libsql://…` + token. Unset = `file:data/journal.db` |
| `APP_PASSWORD` | PC + Vercel | Login password. On Vercel, missing = every request refused |
| `APP_SESSION_SECRET` | optional | Extra key material for session signing |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | PC only | Bot `@Jornalling_bot`; only that chat is answered |
| `TELEGRAM_SYNC_SECONDS` | optional | Bot sync interval, default 60, minimum 15 |
| `AI_GATEWAY_API_KEY` | PC + Vercel | AI Gateway (free tier, see AI section) |
| `AI_REVIEW_MODEL`, `AI_FAST_MODEL`, `AI_TRANSCRIBE_MODEL` | optional | Model overrides |
| `VERCEL_OIDC_TOKEN` | added by `vercel link` | Unused by the app's own logic except as an AI-configured signal |

Vercel production has exactly four (all "sensitive"): `APP_PASSWORD`, `DATABASE_URL`,
`DATABASE_AUTH_TOKEN`, `AI_GATEWAY_API_KEY`. **Never** put Delta or Telegram keys on Vercel.

## Code map

```
src/
  proxy.ts                 Login gate (Next 16 "proxy" = old middleware); excludes /login, manifest, icons
  db/schema.ts             All tables (see Data model)
  db/index.ts              openDatabase(url) (WAL + busy_timeout for local files; migrations unless VERCEL); getDb()
  db/copy.ts               copyDatabase(from, to) used by db:copy-to-cloud
  lib/delta/               client.ts (HMAC signing, pagination, 429/5xx retry, public unsigned calls), types.ts, ingest.ts (API record -> row)
  lib/sync.ts              syncAll(): fills/orders/wallet -> writeChanged() -> rebuild if anything changed
  lib/trades/reconstruct.ts  Fills -> round-trip trades (pure)
  lib/trades/analyze.ts      Wallet charges, stops, exit reason, behaviour tags (pure)
  lib/trades/rebuild.ts      Runs both, applies journal planned stops, rewrites trades/legs/auto tags in one transaction
  lib/config.ts            Tag thresholds (tunable; then `npm run rebuild`)
  lib/stats.ts             computeStats, equityCurve, dailyPnl (IST), groupStats, tagPerformance (pure)
  lib/journal/             vocab.ts (fixed choices), entry.ts (parse/validate, journalTags, suggestionsFor, risk), save.ts (shared save)
  lib/telegram/            api.ts (minimal Bot API client), render.ts (cards, callbacks, review text; pure), bot.ts (handlers)
  lib/ai/                  models.ts (ids, aiConfigured, explainAiError), suggest.ts, review.ts
  lib/auth.ts              Sessions, password check, safe redirect
  lib/runtime.ts           canSyncHere()
  lib/candles.ts           Candle window choice + per-trade cache
  lib/queries.ts, format.ts, tags.ts, range.ts, app-icon.tsx
  app/                     page.tsx (dashboard), trades/, trades/[id]/, journal/ (queue), review/ (AI), login/,
                           manifest.ts, icon.tsx, apple-icon.tsx, pwa-icon/[size]/, api/trades, api/sync,
                           actions.ts (sync), journal-actions.ts, ai-actions.ts, loading.tsx files
  components/              charts/ (equity, calendar, cost breakdown, candlestick, scale), journal-form, journal-section,
                           trade-price-chart, review-view, review-buttons, filter-bar, nav-links, sync-button, tag-chip, hide-on-login
scripts/                   sync.ts, rebuild.ts, bot.ts, db-migrate.ts, db-copy-to-cloud.ts
drizzle/                   SQL migrations 0000-0006 + meta
```

## Data model (`src/db/schema.ts`)

Raw (upserted by Delta ids, `raw` keeps the full API record): `fills`, `orders`,
`wallet_transactions`, `sync_state`.
Derived (rebuilt from raw; trade id = id of the opening fill, or `<fillId>-flip`, so it is
stable): `trades`, `trade_fills` (legs), `trade_tags` (`source` = `auto` | `user`).
User data (never touched by sync/rebuild): `journal_entries` (keyed by trade id).
Caches/state: `trade_candles`, `telegram_messages` (message → trade, kinds `trade` |
`note_prompt` | `suggestion` with `payload`), `app_state` (key/value), `ai_reviews`.

There are no foreign keys. Rebuild deletes `auto` tags only.

## How it works

### Sync (`src/lib/sync.ts`)
- Fills and wallet: incremental with a 2-day overlap window (start/end in **microseconds**).
- **Orders: always the full, unwindowed `/v2/orders/history`** plus open orders. With a time
  window Delta silently dropped orders (231 of 361); the full listing matched a 30-day sweep.
- `writeChanged()` writes only new or changed records, compared as **canonical (key-sorted) JSON**,
  because Delta returns records with fields in varying order. It de-duplicates ids within a batch.
- Trades are rebuilt **only if something was written**. A quiet sync writes 0 rows. This keeps a
  60 s sync within Turso's free 10M writes/month (the old "rewrite everything" was ~69M).
- The first-ever sync starts at 2018-01-01. Without `start_time`, fills and wallet endpoints only return about 90 days.

### Trades (`reconstruct.ts`)
A trade runs from position 0 → back to 0 per product. Average-cost basis exactly as Delta
does it (adds re-average, exits do not). A fill that crosses zero is split into a close and a
`-flip` open with the fee prorated. Every fill is checked against Delta's
`meta_data.new_position.size`. P&L is checked against `new_position.realized_pnl` (gross, before
fees). **Verified: matches Delta on all 135 trades to the cent.**

### Charges, stops, tags (`analyze.ts`)
- Net P&L = gross − fees − liquidation fees + funding. **Summed over all trades it equals the
  wallet ledger's trading lines exactly** (deposits − withdrawals + net = balance).
- Funding and liquidation fees are booked a few ms *after* the closing fill: they go to the trade
  that closed within 5 s before, else the one open. Fee-credit payments have no product: they go to the nearest fill.
- Stop = bracket stop on the entry order, else first `stop_loss_order` on the exit side from
  60 s before entry to close. **Delta keeps only the final stop price**; an edited order has
  `meta_data.edit_timestamp`. A moved stop means the original risk is unknown, so R comes only from
  unmoved stops or from the journal's planned stop.
- Auto tags (thresholds in `src/lib/config.ts`): `session:*` (UTC hours), `hold:*`, `weekend`
  (IST), `after_loss`, `sized_up_after_loss`, `loss_streak`, `win_streak`, `overtrading`,
  `oversized`, `high_leverage`, `heavy_margin`, `added_to_loser`, `scaled_in/out`, `flipped`,
  `no_stop`, `late_stop`, `moved_stop` (still losing side, warning), `stop_to_profit`,
  `stopped_out`, `target_hit`, `liquidated`.

### Journal (`lib/journal/`)
Fixed vocab: setups, emotions, mistakes (`vocab.ts`). It is shared by the web form and the
Telegram buttons; keys are stored, labels can change. Answers become tags `setup:*`,
`emotion:*`, `mistake:*`, `plan:followed|broken` (source `user`). Auto tags suggest answers
(`SUGGESTED_BY_TAG`), shown dotted and never pre-selected. A planned stop sets risk/R
(`effectiveRisk`: journal stop > unmoved stop order). A stop or target on the wrong side of entry is rejected.
`saveJournalEntry()` in `save.ts` is the single save path (web action + bot). `/journal` is a
queue of un-journaled closed trades, newest first, with Save & next.

### Telegram bot (`lib/telegram/`, `scripts/bot.ts`)
- Long polling (no public URL). Answers **only `TELEGRAM_CHAT_ID`**; before it is set it only
  replies to `/start` with the chat id. Strangers get no response at all.
- Each sync: new closes since the first run (`telegram.notify_since`) get a card. Taps walk
  setup → feelings → mistakes → plan → rating, saving each tap and editing the card in place.
  Callback data is short (`s:v:breakout`…), and the trade comes from the message id.
- Notes: reply to a card, or tap Add note (ForceReply). **Voice notes** are transcribed by AI.
  After a note, AI suggests new answers (`a:y` / `a:n`).
- Commands: `/journal` (last 7 days), `/today`, `/sync`, `/review`, `/help`. The weekly review is sent
  automatically on **Sunday from 20:00 IST**, once per week (`telegram.weekly_review_for`).
- Sync failures are messaged once per distinct error (e.g. a new IP to whitelist).

### AI (`lib/ai/`)
Through AI Gateway. **The account is on the free tier, which blocks all Claude models** and
newer GPT/Gemini. Defaults: reviews and suggestions `google/gemini-2.5-flash`, voice
`openai/gpt-4o-mini-transcribe`. `openai/gpt-5-mini` produced broken structured output
(whitespace runaway), so don't use it. Reviews: `Output.object` with `reviewSchema`, the coach is told
habits/process only (no trade/market calls), `tidyReview()` collapses whitespace and caps fields,
`maxOutputTokens` 8000. About 2.5–6k input tokens per review. Stored in `ai_reviews`.
Tests use `MockLanguageModelV4` from `ai/test`.

### Auth and PWA
`APP_PASSWORD` → HMAC-signed, expiring (30 d) token in the httpOnly cookie `dj_session`. Password
checks are constant-time, failures are delayed 800 ms, and redirects only go to in-app paths (`/\host` is blocked).
`authMode()`: `open` locally without a password, `password`, or `misconfigured` (on Vercel
without a password → refuse everything). Manifest + icons (generated with `next/og`, SVG
artwork) are public so phones can install. Install: Android Chrome → Install app; iOS Safari →
Add to Home Screen.

## Delta API quirks (learned the hard way)

- Signing: HMAC-SHA256 hex of `method + timestamp(s) + path(incl. /v2) + ?query + body`;
  headers `api-key`, `timestamp`, `signature`, `User-Agent`. Re-sign on every retry.
- Times: `start_time`/`end_time` in **microseconds**; candles `start`/`end` in **seconds**.
- Windowed order history drops orders → read it unwindowed.
- Field order in responses varies → compare canonically.
- Only the final stop price survives edits; `edit_timestamp` marks a move.
- Errors carry `context.client_ip`: the exact IP to whitelist.
- Candles (`/v2/history/candles`) are public, go back to 2024, newest first.
- The user's key is whitelisted to a **mobile IPv6 that keeps changing** (`ip_not_whitelisted_for_api_key`).

## Conventions

- Match the surrounding code: comment density, naming, idioms. Pure logic in `lib/`, tested.
- Times: store UTC ms; display IST (`Asia/Kolkata`); daily buckets by IST date.
- Money in USD; `formatMoney`, P&L text green/red; charts use the validated blue/red diverging
  tokens in `globals.css` (light and dark both validated).
- Next 16 with Cache Components: pages reading data call `await connection()` and need a
  `loading.tsx` or `<Suspense>`; `usePathname` in the layout needs Suspense. Run `npx next typegen` for new routes.
- Never weaken security defaults: localhost binding, auth fail-closed, no secrets in code or logs.

## Verification and git workflow (the user's expectations)

- Before committing: `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx next build`.
- **Commit in several logical commits, never one big commit.** Conventional-commit subjects
  (`feat(scope):`, `fix(scope):`, `docs:`…) with a body explaining *why*, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Order commits so **each one type-checks and passes tests on its own**. Verify in a fresh clone
  (junction `node_modules` to the real one, and remove only the junction afterwards, never the target).
- Scan changed files for every secret value in `.env.local` and the MCP config before pushing.
- Push to `main` (auto-deploys to Vercel); confirm local and remote heads match.
- Test real behaviour, not just types: live API/DB checks, the browser for UI. Clean up test data you create.

## Gotchas (Windows / tooling)

- Git Bash heredocs or `python -c` scripts containing quotes/backslashes sometimes fail to parse or
  lose backslashes. Prefer the file editor for code edits.
- `vercel link` appends `.env*` and `.vercel` to `.gitignore`, which breaks the `!.env.example` exception. Check after linking.
- If the dev server serves stale CSS after editing `globals.css`, restart it.
- PowerShell `.Count` on a single object can print empty: wrap in `@(...)`.
- Claude Code may kill background `npm run dev` / `npm run bot` when memory is low.

## Status and roadmap

Done (all pushed): 1 sync · 2 trades + auto tags · 3 dashboard and charts · 4 journal + R ·
5 Telegram bot · 6 AI (review, suggestions, voice) · 7 PWA + login + Turso + Vercel.

Next (requested 2026-10-31):
- **Push notifications** on the installed phone app (web push).
- **A Delta read key that does not depend on the changing mobile IP.**

## Changelog

- **2026-10-31**: Created CLAUDE.md documenting the whole project; standing rule to update it with every change.
- **2026-10-31**: Phase 7: PWA (manifest, icons), password login (`proxy.ts`), Turso + Vercel
  (`bom1`), sync writes only changed rows (canonical JSON), `db:copy-to-cloud`, `db:migrate`.
- **2026-10-31**: Phase 6: AI weekly review, note suggestions, Telegram voice notes; free-tier-safe default models.
- **2026-10-31**: Phase 5: Telegram bot with trade cards, notes, `/journal` `/today` `/sync`.
- **2026-10-31**: Phase 4: journal form, `/journal` queue, planned stop/target, R from journal.
- **2026-10-31**: Phase 3: dashboard, equity/drawdown, P&L calendar, cost breakdown, candlestick
  trade charts; unwindowed order history; moved-stop detection.
- **2026-10-31**: Phases 1–2: Delta sync, trade reconstruction, wallet reconciliation, auto tags.
