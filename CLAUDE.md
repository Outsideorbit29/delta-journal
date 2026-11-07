@AGENTS.md

# Delta Journal: project guide

> **Standing rule: update this file with every change to the project.** Any change that
> adds, removes or changes behaviour, setup, environment variables, commands, data model or
> conventions must update the matching section here, and add a line to the
> [Changelog](#changelog), ideally in the same commit and **never later than the same push**.
> If something here is wrong, fix it. This file is the source of truth for how the project works.

## What this is

A trading journal and habit-insight app for one trader's own **Delta Exchange India**
account. It syncs fills, orders and the wallet ledger from Delta's API, rebuilds them into
round-trip trades, tags each trade with behaviour patterns, lets the trader journal each
trade (web or Telegram), and uses AI for weekly coaching reviews, note tagging and voice
notes. It is installable on a phone as a PWA.

It is becoming **Hardwon** (hardwon.in; planned as Edgebook until 2026-11-07), a multi-user product for Indian traders (see "Status and roadmap").
Accounts are Clerk users, and every row of data belongs to one user (`user_id`). The owner's
pre-accounts data belongs to the placeholder user `legacy` until `npm run claim-legacy` moves it.

The trader mostly trades perpetual futures, especially **XAUTUSD** (tokenized gold), plus
BTC, SOL and ETH. History goes back to July 2024 (about 135 trades at the time of writing).
The goal is to show *why* they lose, not just what happened. The main finding so far:
fees dwarf gross P&L, scalps lose, and moving a stop while still losing is the costliest habit.

## Live setup

| Part | Where | Notes |
|---|---|---|
| Web app (PWA) | **https://hardwon.in** (since 2026-11-07; `delta-journal-three.vercel.app` redirects there in production, `proxy.ts`) | Vercel project `delta-journal` (team `anish-kumars-projects`), Hobby plan, region `bom1` (Mumbai). Git-connected: **every push to `main` deploys to production.** |
| Database | Turso (libSQL), free plan | `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. Both the hosted app and the PC use it. |
| Sync + Telegram bot | **AWS Lightsail server** `delta-journal`, Mumbai, static IP `15.206.227.0` | systemd service `delta-journal-bot`, running 24/7 since 2026-10-31. See "Always-on server". The PC no longer runs the bot. |
| Code | https://github.com/Outsideorbit29/delta-journal (private) | Branch `main`. |
| Local backups | `data/journal-backup-before-cloud.db`, `data/turso-backup-before-edgebook.db` | Snapshots taken just before moving to Turso, and of Turso just before the multi-user migration (both 2026-10-31). |
| Owner account | Clerk **production** user `user_3LkR63D4DdWaDtygu9qXjfOdJIy` (email code sign-in on hardwon.in) | Owns all the original data since the claim on 2026-11-07 (moved from the development user `user_3LT1ntUygNbHxmyfsYO9QBzM95P`); this is `OWNER_USER_ID` on the PC and the server |

Syncing with Delta **never runs on Vercel**: Delta keys must be IP-whitelisted, and Vercel's IPs
are not fixed. The hosted app hides the Sync button and `/api/sync` returns 403 there
(`canSyncHere()` in `src/lib/runtime.ts`). The server syncs every minute with its own key. The PC's
key still works for `npm run sync` / `npm run dev` while the PC's IP is whitelisted. Both keys are
the owner's, so they only ever sync into `OWNER_USER_ID`; other users get per-user keys on Day 3.

## Stack

- **Next.js 16.4** (App Router, Turbopack, **Cache Components on**, `src/` dir), React 19.3,
  TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using Next APIs (see AGENTS.md).
- **Design system:** Hallmark's Editorial theme, locked in `design.md` (root). Tokens in `src/app/tokens.css` (a Tailwind
  `@theme` block, so `bg-paper`, `text-ink`… are utilities) and `src/app/base.css`, both written by Hallmark's scaffold;
  money, chart and dark-mode tokens in `globals.css`. Faces from `next/font`: Bricolage Grotesque and Source Serif 4.
- **Drizzle ORM** + **@libsql/client** (SQLite locally, Turso in the cloud). Migrations in `drizzle/`.
- **Clerk** (`@clerk/nextjs` 7) for accounts, installed through the Vercel Marketplace.
- **AI SDK 7** (`ai`) through **Vercel AI Gateway** with plain `provider/model` strings; `zod` for schemas.
- **lightweight-charts 5** (TradingView, Apache-2.0: keep its attribution logo on) for candles;
  other charts are hand-drawn SVG.
- **Vitest** for tests, **tsx** for scripts, **Vercel CLI** (local dev dependency) for deploys,
  `vercel.ts` (`@vercel/config`) for platform config.
- Node 24 on Windows 11. Git Bash and PowerShell are both available.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local app on http://localhost:3000 (loopback only, on purpose; `localhost` rather than `127.0.0.1` because Clerk's dev handshake rewrites to `localhost`). **It migrates `DATABASE_URL` on start**: to try unreleased migrations, run it with `DATABASE_URL=file:data/dev.db` |
| `npm run bot` | Telegram bot + Delta sync every 60 s (+ weekly AI review), acting for `OWNER_USER_ID`. Runs on the server, not the PC. |
| `npm run sync` | One sync of the owner's account (`OWNER_USER_ID`); prints rows written, and rebuilds trades only if something changed |
| `npm run rebuild` | Recompute trades and auto tags from stored data for every user (after changing `src/lib/config.ts`) |
| `npm run demo:seed` | Replace the public demo account's made-up trades with a fresh set ending yesterday (same figures, dates moved). Runs daily on the server |
| `npm run keys:generate` | Create the key pair that locks users' Delta keys and write it into `.env.local` (refuses to replace an existing pair) |
| `npm run claim-legacy -- user_xxx [--from user_old]` | Move all `legacy` rows (or a whole account, with `--from`, e.g. the Clerk development user to the production one) to that Clerk user, who must have signed in once and have no synced data. Carries the founder dates over; a stored Delta key cannot move (sealed to its owner) and is dropped |
| `npm run db:generate` | New migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (the hosted app never migrates) |
| `npm run db:backup` | Copy the whole `DATABASE_URL` database into `data/backups/hardwon-<UTC time>.db.gz`, row counts and integrity checked; prunes backups older than `BACKUP_KEEP_DAYS` (30). Runs daily on the server |
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
| `DELTA_API_KEY`, `DELTA_API_SECRET` | PC + server (different keys) | Delta **Read Data** key for sync. On the server it is the server's own key, whitelisted to its IPs |
| `DELTA_SERVER_API_KEY`, `DELTA_SERVER_API_SECRET` | PC only | Holds the server's key on the PC so it can be copied to the server as its `DELTA_API_*` (see "Always-on server") |
| `DELTA_BASE_URL` | optional | Defaults to `https://api.india.delta.exchange` |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | PC + Vercel | Turso `libsql://…` + token. Unset = `file:data/journal.db` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | PC + Vercel | Clerk accounts, from the Marketplace integration (type "Config"). **Vercel production uses Clerk's production instance** (domain hardwon.in, set 2026-11-07); the PC keeps the **development** instance's keys, so local sign-ins are separate accounts |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | PC + Vercel | `/sign-in`, `/sign-up` (not secret) |
| `DELTA_KEYS_PUBLIC_KEY` | PC + Vercel + server | Locks (seals) users' Delta keys. Not secret |
| `DELTA_KEYS_PRIVATE_KEY` | PC + server, **never Vercel** | Unlocks them; only the sync server uses it. The PC copy is the backup: losing it means every user reconnects |
| `SYNC_SERVER_IPS` | optional | Comma-separated IPs users whitelist; defaults to the Lightsail IPv4 and IPv6 |
| `OWNER_USER_ID` | PC + server | The owner's Clerk user id. `DELTA_API_KEY`, `npm run sync`, the bot and the local Sync button act for this account only. Unset = `legacy` |
| `TELEGRAM_BOT_TOKEN` | PC + server | Bot **`@Hardwon_bot`** (since 2026-11-07; `@Jornalling_bot` before), shared by every user (each links their chat in Settings) |
| `TELEGRAM_CHAT_ID` | PC + server, optional | The owner's chat from before accounts; linked to `OWNER_USER_ID` on the bot's first start |
| `TELEGRAM_BOT_USERNAME` | Vercel + server (+ PC) | `Hardwon_bot`: the bot's @name for the t.me link in Settings (also the code's default) |
| `TELEGRAM_SYNC_SECONDS` | optional | Bot sync interval, default 60, minimum 15 |
| `BACKUP_KEEP_DAYS` | optional | Days of daily backups `db:backup` keeps, default 30 |
| `AI_GATEWAY_API_KEY` | PC + Vercel | AI Gateway (free tier, see AI section) |
| `AI_REVIEW_MODEL`, `AI_FAST_MODEL`, `AI_TRANSCRIBE_MODEL` | optional | Model overrides |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | PC + Vercel | Web push signing (generated with `web-push`). Subject is the app URL, not an email |
| `VERCEL_OIDC_TOKEN` | added by `vercel link` | Unused by the app's own logic except as an AI-configured signal |

Vercel production has six "sensitive" variables: `DATABASE_URL`,
`DATABASE_AUTH_TOKEN`, `AI_GATEWAY_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, plus the two Clerk keys from the Marketplace integration, the two plain Clerk paths and `DELTA_KEYS_PUBLIC_KEY`. **Never** put Delta or Telegram keys on Vercel. Add a variable with
`node -e "<print value from .env.local>" | npx vercel env add NAME production --sensitive --force`,
so the value is never shown.

## Code map

```
src/
  proxy.ts                 clerkMiddleware() (Next 16 "proxy" = old middleware): reads the session, protects nothing by path
  db/schema.ts             All tables (see Data model)
  db/index.ts              openDatabase(url) (WAL + busy_timeout for local files; migrations unless VERCEL); getDb()
  db/copy.ts               copyDatabase(from, to) used by db:copy-to-cloud
  db/claim.ts              claimRows(db, from, to): moves one owner's rows to another (claim-legacy)
  db/backup.ts             backupDatabase(client, file): every table from sqlite_master (no table list to forget),
                           then indexes; gzipFile, pruneBackups (db:backup)
  lib/demo.ts              The demo account (user `demo`): seeded, deterministic made-up fills/orders run through the real rebuild
  lib/keys/                sealed.ts (seal/open, X25519 + AES-GCM), credentials.ts (save, status, open, mark checked),
                           sync-users.ts (sync one or every user with their stored key)
  lib/delta/               client.ts (HMAC signing, pagination, 429/5xx retry, public unsigned calls), types.ts, ingest.ts (API record -> row)
  lib/sync.ts              syncAll(): fills/orders/wallet -> writeChanged() -> rebuild if anything changed
  lib/trades/reconstruct.ts  Fills -> round-trip trades (pure)
  lib/trades/analyze.ts      Wallet charges, stops, exit reason, behaviour tags (pure)
  lib/trades/rebuild.ts      Runs both, applies journal planned stops, rewrites trades/legs/auto tags in one transaction
  lib/config.ts            Tag thresholds (tunable; then `npm run rebuild`)
  lib/stats.ts             computeStats, equityCurve, dailyPnl (IST), groupStats, tagPerformance (pure)
  lib/journal/             vocab.ts (fixed choices), entry.ts (parse/validate, journalTags, suggestionsFor, risk), save.ts (shared save)
  lib/telegram/            api.ts (minimal Bot API client), render.ts (cards, callbacks, review text; pure), bot.ts (routeUpdate
                           + per-user handlers, notifications), links.ts (link codes, chat ↔ user)
  lib/ai/                  models.ts (ids, aiConfigured, explainAiError), suggest.ts, review.ts
  lib/session.ts           requireUserId() (pages; redirects to /sign-in) and currentUserId() (actions, routes; null);
                           both create the user's `users` row on first visit (plan "founder", 90 days free)
  lib/runtime.ts           canSyncHere(), ownerUserId()
  lib/account.ts           exportAccount (JSON, secrets and raw records left out), tradesCsv, deleteAccountData; tested
  lib/rate-limit.ts        LIMITS per action, rateLimit() (fixed window in the database), tooMany(); tested
  lib/health.ts            recordHeartbeat (sync server, each round), readHealth (for /api/health); tested
  lib/app-errors.ts        errorInfo (scrubbed), recordAppError, errorsToAlert/markAlerted, renderErrorAlert; tested
  instrumentation.ts       onRequestError → app_errors (website server errors, for the owner's Telegram alerts)
  lib/legal.ts             LEGAL: operator, contact email, effective date (Privacy Policy, Terms, footer)
  lib/isolation.test.ts    Two users in one database: every query, save, rebuild, sync, AI and push path stays inside its user
  lib/push.ts              Web push: save/remove subscriptions, sendPush() (drops 404/410 and 5-failure devices)
  lib/candles.ts           Candle window choice + per-trade cache
  lib/insights.ts          biggestLeaks (costliest habit tags), whatWorks, TAG_HINTS (one line per habit); tested
  lib/score.ts             behaviourScore: six 0-100 habit dimensions, overall, label, trend; weakest(); tested
  lib/sync-errors.ts       explainSyncError (Delta errors → plain fix), formatAgo; tested
  lib/queries.ts, format.ts, tags.ts (labels, warnings, topTags), range.ts, app-icon.tsx (ink square, paper rising line)
  app/                     page.tsx (dashboard), trades/, trades/[id]/, journal/ (queue), review/ (AI), settings/,
                           sign-in/[[...sign-in]], sign-up/[[...sign-up]], waitlist/[[...waitlist]] (Clerk), demo/ (public),
                           privacy/, terms/ (public legal pages),
                           manifest.ts, icon.tsx, apple-icon.tsx, pwa-icon/[size]/, api/trades, api/sync, api/export, api/health,
                           actions.ts (sync), journal-actions.ts, ai-actions.ts, push-actions.ts, delta-actions.ts (connect/disconnect a key), telegram-actions.ts (link/unlink a chat), account-actions.ts (delete account),
                           loading.tsx files
  components/              charts/ (equity, calendar, cost breakdown, candlestick, scale), journal-form, journal-section,
                           trade-price-chart, review-view, review-buttons, push-settings, filter-bar, nav-links, sync-button,
                           tag-chip, hide-on-login, delta-key-form, delta-connect (key steps + status, shared by Settings and
                           onboarding), auto-refresh, dashboard-view (dashboard for a user or the demo: P&L hero, "Your biggest
                           leaks" ledger, score card and ruled figures, charts), landing (+ landing/pinned, landing/steps, landing/trade-feed),
                           score-card (bars), theme-toggle (light/dark/device, Settings), skeleton (loading screens),
                           site-menu (visitor header: section links, ☰ on phones), onboarding, telegram-connect and account-data (Settings), legal-page, logo, ui.ts
                           (shared classes), sync-status (header pill: synced / problem / not connected → Settings),
                           nav-links (desktop links + phone BottomNav)
public/sw.js               Service worker: shows pushes, opens the tapped notification's URL (no offline cache)
scripts/                   sync.ts, rebuild.ts, bot.ts, db-migrate.ts, db-backup.ts, db-copy-to-cloud.ts, claim-legacy.ts, keys-generate.ts, demo-seed.ts
drizzle/                   SQL migrations 0000-0012 + meta (0008 = multi-user, its table rebuilds hand-fixed; 0009 = delta_credentials;
                           0010 = telegram_links; 0011 = rate_limits; 0012 = app_errors)
```

## Data model (`src/db/schema.ts`)

Raw (upserted by Delta ids, `raw` keeps the full API record): `fills`, `orders`,
`wallet_transactions`, `sync_state`.
Derived (rebuilt from raw; trade id = id of the opening fill, or `<fillId>-flip`, so it is
stable): `trades`, `trade_fills` (legs), `trade_tags` (`source` = `auto` | `user`).
User data (never touched by sync/rebuild): `journal_entries` (keyed by trade id).
Caches/state: `trade_candles`, `telegram_messages` (message → trade, kinds `trade` |
`note_prompt` | `suggestion` with `payload`), `app_state` (key/value), `ai_reviews`,
`push_subscriptions` (endpoint, keys, device label, failure count).
Errors: `app_errors` (process-wide, no user id: website server errors for the owner's alerts).
Accounts: `users` (Clerk user id, email from Clerk on first visit or backfilled once, `""` if none; `plan` default
`founder`, `access_until`). Limits: `rate_limits` (subject = user id or `chat:<id>`, action, window start, count).
Keys: `delta_credentials` (one per user: `key_hint` = last 4 characters, `sealed` key and secret, `status`
`pending` | `ok` | `error`, `last_error`, `checked_at`).
Telegram: `telegram_links` (one per user: unique `chat_id`, `chat_name`, `linked_at`, and a pending one-time
`code_hash` (SHA-256) with `code_expires_at`).

**Every table except `users`, `trade_candles`, `rate_limits` and `app_errors` has `user_id`** (default `legacy`; `telegram_links` and
`delta_credentials` are keyed by it). Delta ids
are globally unique, so primary keys stay as they were. Ownership is enforced by filtering on
`user_id` in every query, and an upsert only updates a row the same user owns (`setWhere`), so a
record can never move between users. `sync_state` has the primary key (user, resource).
`app_state` has (user, key), with `user_id` `''` for process-wide state (`telegram.update_offset:<bot id>`, one per bot, so a new bot starts from zero; `bot.heartbeat`).
Per-user state (`telegram.notify_since`, `telegram.weekly_review_for`) sits under the user.

There are no foreign keys. Rebuild deletes `auto` tags only, and only the rebuilt user's rows.
`OWNED` in `src/db/claim.ts` lists every per-user table; claim, export and account deletion all use it, so **a new
per-user table must be added there** (and to the isolation test).

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
- Funding and liquidation fees are booked a few ms *after* the closing fill. A charge that names its fill
  (`meta_data.fill_uuid`, which equals our fill id) goes to the trade holding that fill: **cross-margin charges have
  `product_id` null** (seen on a second user's liquidation fee, 2026-11-07). Otherwise it goes by product to the trade
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
- **One bot for every user.** Long polling (no public URL). `routeUpdate` looks up the user behind each chat
  (`telegram_links`) and runs that user's handlers (`BotContext` = user + their chat). An unlinked private chat only gets
  a "connect it in Settings" reply to commands; groups and channels are never answered or linked.
- Linking: Settings → Telegram → **Connect Telegram** makes a one-time code (16 random bytes, base64url; only its
  SHA-256 is stored; 15 minutes; replaces any earlier code) and shows `t.me/<bot>?start=<code>`. Tapping Start sends
  `/start <code>`; the chat becomes that user's (leaving any other user it was linked to) and the page, which refreshes
  every 5 s while a code is waiting, shows "Connected to @name". `/disconnect` or Settings → Disconnect unlinks.
  Linking or unlinking resets the user's notification starting point to "now", so old trades never flood in.
  On start, the bot links `TELEGRAM_CHAT_ID` to `OWNER_USER_ID` once (the pre-accounts setup), without that reset.
- Every lookup of a sent message (`telegram_messages`) also filters on the user, so an old card in a chat that moved
  to another account does nothing.
- Each minute the bot syncs the owner, then every user with a key, then for each user: tells them about a **new**
  sync problem (plain words from `explainSyncError`, Telegram + push, once per distinct error; "working again" when it
  recovers; seeded from `delta_credentials` so a restart does not repeat known problems), announces new closes
  (`notifyClosedTrades`, only after a sync wrote something, or once after a start, or while over the 10-per-run cap),
  and sends the weekly review on **Sunday from 20:00 IST** (`telegram.weekly_review_for`; weeks without trades are skipped).
- New closes since the user's starting point (`telegram.notify_since`) get a card in their chat and a push. A user with
  no chat but a subscribed phone gets the push only, and their starting point moves past each pushed trade.
  Taps walk setup → feelings → mistakes → plan → rating, saving each tap and editing the card in place.
  Callback data is short (`s:v:breakout`…), and the trade comes from the message id.
- Notes: reply to a card, or tap Add note (ForceReply). **Voice notes** are transcribed by AI.
  After a note, AI suggests new answers (`a:y` / `a:n`). AI calls run per user (`botAi(db, userId)`).
- Commands: `/journal` (last 7 days), `/today`, `/sync` (the user's own key; the owner falls back to the server's
  key), `/review`, `/disconnect`, `/help`.
- Pushes (with VAPID keys): each new close (tap → `/trades/<id>`), the weekly review (→ `/review`) and sync failures
  (→ `/settings`), only to users with a subscribed device. A push failure never blocks the Telegram message (`notifyPhone`).

### Public pages, onboarding and the demo
- The landing page (redesigned with Hallmark on 2026-11-01, Bento Grid shape): a Counter hero (head, one line, *Try the live
  demo* and *Join the waitlist*) beside a **screenshot of the demo dashboard** (`public/screens/demo-ledger.png` and
  `-dark.png`, shown by mode with `.for-light` / `.for-dark`); a bento of the demo's figures; a pinned run of four product
  views (`landing/pinned.tsx`, sticky on wide screens, inline on phones); how it works as numbered rows; the demo's latest
  trades as a ruled ledger; pricing as a ruled offer; one ink band with the actions again; an index-columns footer.
  Every number comes from the demo account. **Re-take the screenshots after `npm run demo:seed` or a dashboard change**
  (a puppeteer script forcing light and dark; `capture.mjs` from Hallmark only forces dark). No scroll animations.
- `/` decides: signed out → the landing page (`components/landing.tsx`); signed in but never synced and no working key →
  onboarding (connect Delta, auto-refreshing every 5 s while the key is `pending`); otherwise the dashboard.
- The header shows Demo / Sign in / Join the waitlist when signed out (`<Show when="signed-in">` from Clerk, inside
  `<Suspense>` because it reads the session).
- `/demo` is public and read-only: `DashboardView` for the user `demo` with `demo` set (no sync line, no journal or AI links,
  tag links stay on `/demo`). Its data is made up (`lib/demo.ts`): scalps lose to fees, stopped swings win, moved stops cost
  the most, trailed stops pay; about -$158 over 90 trades. Fill ids are `demo-…` and order ids negative, so they never clash
  with Delta's; Clerk ids start with `user_`, so no account can be `demo`. The server re-seeds it **daily at 03:00 IST**
  (`delta-journal-demo.timer`, about 1,500 row writes); the figures are seeded and identical each time, only the dates
  move, so the landing screenshots stay right. The demo is empty for a few seconds during the re-seed.

### Behaviour score (`lib/score.ts`, `components/score-card.tsx`)
Each dimension is the share of closed trades **without** a habit, from the auto tags: Risk control (no `no_stop`/`late_stop`),
Stop discipline (no `moved_stop`, among trades with a stop), Position sizing (no `oversized`/`heavy_margin`/`high_leverage`),
Emotional control (no `sized_up_after_loss`/`added_to_loser`/`liquidated`), Patience (no `overtrading`/`hold:scalp`),
Journaling (journaled). Overall = average; 80+ Strong, 60+ Solid, 40+ Needs work, else Leaking. Trend = the last ≤20 trades
vs the ≤20 before. Needs 5 closed trades. It measures process, not P&L. Shown on the dashboard (with the weakest dimension's
tip) as ruled bars, the weakest in the accent, and on the landing page (the demo trader). Owner: 53 Needs work on 2026-11-01 (journaling 1%).

### Per-user Delta keys (`lib/keys/`, `/settings`)
- On Settings → Delta Exchange a user creates a **Read Data** key on Delta, whitelists our server's IPv4 and IPv6
  (`syncServerIps()`), and pastes the key and secret. `connectDelta` checks the shape and **seals** them with
  `DELTA_KEYS_PUBLIC_KEY`: an ephemeral X25519 key agreement, HKDF-SHA256, AES-256-GCM, with the context
  `edgebook:delta:<userId>` as authenticated data, so a box copied to another user's row will not open. The website
  has no private key and can never read a key back; the page only shows the last 4 characters and the status.
- The bot on the server holds `DELTA_KEYS_PRIVATE_KEY`. Every minute, after the owner's sync, it syncs every other
  user with a stored key, one at a time; one user's failure never stops the others. Each outcome goes on the key
  (`ok`, or `error` with Delta's message, which names the IP to whitelist). A key replaced mid-sync stays `pending`.
  Failures are logged and told to the user (Telegram and push) once per distinct error, not every minute.
- The owner syncs with their own stored key once they connect one, otherwise with the server's `DELTA_API_KEY`.
- Not yet possible: refusing keys that have Trading permission (no known Delta endpoint reports a key's permissions),
  so the page tells users to choose Read Data only.

### Your data, legal pages and limits (Day 6)
- **Legal:** `/privacy` and `/terms` (public), written for India's DPDP Act 2023: data fiduciary, what is collected and
  why, consent and withdrawal, processors (Clerk, Vercel, Turso, AWS, Google/OpenAI via AI Gateway, Telegram, push
  services), retention (erased at once on deletion; provider backups within 30 days), rights (access, correction,
  erasure, nomination, grievance within 30 days, Data Protection Board), 18+. Operator and contact live in
  `src/lib/legal.ts`. Linked from the landing footer, Settings, and a consent line under sign-up and the waitlist.
  **Not reviewed by a lawyer**; any change to what data we hold or who processes it must update `/privacy`.
- **Export** (Settings → Your data, `GET /api/export`): JSON of every `OWNED` table plus the `users` row, without
  secrets (sealed key, push keys, link code) or `raw` Delta records (about 800 KB for 135 trades), gzipped when the
  browser accepts it (116 KB) to stay far under Vercel's 4.5 MB response limit. `?format=csv` = trades with their
  journal, times in IST, formula-like cells defused (`csvCell`).
- **Delete** (Settings → Your data, type DELETE): `deleteAccountData` erases the Delta key first, then every owned row,
  the candle cache for the user's trades, their rate limits and the `users` row, in one transaction; then Clerk's
  `users.deleteUser`. A sync already running when the account is deleted erases what it wrote (`ACCOUNT_DELETED`).
  The owner's account would be re-filled by the server's own key: remove `OWNER_USER_ID` first if that is ever wanted.
- **Rate limits** (`LIMITS` in `lib/rate-limit.ts`): AI review 10/day, AI suggestions 60/h, voice transcription 30/h,
  Delta key saves, Telegram links, test pushes and exports 10/h, bot `/sync` 20/h, 60 bot updates/min per user (more
  are dropped; taps get "Slow down"), 10 replies/h to an unlinked chat. Counted in the database so they hold across
  Vercel instances and the bot.
- **Monitoring:** the bot writes `bot.heartbeat` (process-wide `app_state`: time, users synced, users failing) after
  every round. `GET /api/health` (public, counts only) returns 200 while it is under 5 minutes old, else 503.
  **UptimeRobot** (free, the owner's account, signed in with GitHub) checks `https://hardwon.in/api/health` every
  5 minutes and emails the owner when it fails (set up 2026-11-07).
- **Website error alerts** (since 2026-11-07): `src/instrumentation.ts` (`onRequestError`) records every server error
  (pages, actions, API routes, proxy) in `app_errors`, one row per distinct error (route + message with numbers and ids
  ignored), with a count. Messages lose everything from `params:` on (failed queries list their parameters), paths lose
  their query string, and no user id is kept. Each round the bot Telegrams the owner about new errors, and again at most
  hourly while one keeps happening (`lib/app-errors.ts`); rows unseen for 30 days are pruned. If the database itself is
  down nothing can be recorded: UptimeRobot covers that. Full stack traces stay in Vercel → Logs.
- **Security headers** (`next.config.ts`, every path): `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `nosniff`,
  `strict-origin-when-cross-origin`, a `Permissions-Policy` denying camera/mic/location/payment/USB. Vercel already
  sends HSTS. No full CSP yet (Clerk's scripts and Next's inline scripts need a nonce setup).

### Push notifications (`lib/push.ts`, `public/sw.js`, `/settings`)
Standard Web Push with VAPID (`web-push`). On `/settings` a device taps "Turn on notifications"
→ permission → `pushManager.subscribe` with `VAPID_PUBLIC_KEY` → stored in `push_subscriptions`.
"Send a test" pushes from the hosted app. Push services' 404/410 remove a subscription, and
5 failures in a row also remove it. Verified end to end on the user's Android phone (Chrome,
installed app) on 2026-10-31. `sw.js` is public (excluded from the login proxy) and served
`no-cache` (`next.config.ts` headers). **iPhone: push only works in the installed Home Screen app
(iOS 16.4+)**; the settings page explains this when opened in Safari.

### AI (`lib/ai/`)
Through AI Gateway. **The account is on the free tier, which blocks all Claude models** and
newer GPT/Gemini. Defaults: reviews and suggestions `google/gemini-2.5-flash`, voice
`openai/gpt-4o-mini-transcribe`. `openai/gpt-5-mini` produced broken structured output
(whitespace runaway), so don't use it. Reviews: `Output.object` with `reviewSchema`, the coach is told
habits/process only (no trade/market calls), `tidyReview()` collapses whitespace and caps fields,
`maxOutputTokens` 8000. About 2.5–6k input tokens per review. Stored in `ai_reviews`.
Tests use `MockLanguageModelV4` from `ai/test`.

### Auth and PWA
**Clerk** (`@clerk/nextjs` 7, Core 3) replaced the old `APP_PASSWORD` login. `<ClerkProvider>` sits
inside `<body>` (required with Cache Components), and the header has Clerk's `<UserButton />`.
`/sign-in` and `/sign-up` render Clerk's components; `HideOnLogin` hides the app chrome there.
Following Clerk's current advice (path matchers are deprecated), **`proxy.ts` protects nothing by
path**. Each page calls `requireUserId()`, and each action and API route calls `currentUserId()`
and refuses without a user ("Sign in first." / 401). With Partial Prerendering a signed-out page
answers 200 with the static shell and then a streamed redirect to `/sign-in`: no user data is
ever sent (verified with curl). If Clerk's keys are missing, `clerkMiddleware` throws, so auth fails closed.
The local Sync button only syncs when the signed-in user is `OWNER_USER_ID`, because the PC's
Delta key is the owner's. Manifest, icons and `sw.js` need no session, so phones can install.
**Sign-ups are Waitlist** (Clerk dashboard → Configure → Access mode; set 2026-11-01): visitors join at `/waitlist`
(Clerk's `<Waitlist />`, `ClerkProvider waitlistUrl`), and the owner approves them in the Clerk dashboard → Waitlist,
or invites someone directly from Users → Invite. Reach the dashboard from Vercel → Integrations → Clerk → Open in Clerk. Install: Android Chrome → Install app; iOS Safari →
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
- Money in USD; `formatMoney`, P&L text `text-gain` / `text-loss` (via `pnlClass`) always with its sign; charts use the
  blue/red diverging `--viz-*` tokens in `globals.css`, validated with the dataviz checker on both papers (green against
  red fails colour-blind readers). The candlestick chart resolves the oklch tokens to rgb (lightweight-charts can't parse oklch).
- **Design: Hallmark Editorial, light first with a dark mode** (redesigned 2026-11-01; `design.md` is the rule). Warm
  paper, ink, one printer's green as a signal only (active nav, focus, link hover), square corners, a heavy 4px ink rule
  (`.opens`) opening each section or table, 1px hairlines between rows, paper steps (`bg-paper-2`) for depth, no shadows.
  Heads: the condensed display face; big numbers `.figure-display`; labels, controls, nav and table heads `.face-label`
  (sentence case, never uppercase); reading text in the serif. Dark mode is re-derived in `globals.css`, chosen by the
  device or by Settings → Appearance (`data-mode` on `<html>`, set before paint by a script in `layout.tsx`). Use
  `components/ui.ts` (`buttonPrimary`, `buttonSecondary`, `input`, `well`, `link`), one filled primary per screen. Phones
  get the bottom tab bar and ruled lists; check every page at 375px. Before shipping UI, run Hallmark's
  `sloplint` (see "Gotchas" for the Windows flag). Clerk's forms take the tokens through `appearance` in `layout.tsx`.
- Next 16 with Cache Components: pages reading data call `await connection()` and need a
  `loading.tsx` or `<Suspense>`; `usePathname` in the layout needs Suspense. Run `npx next typegen` for new routes.
- Never weaken security defaults: localhost binding, auth fail-closed, no secrets in code or logs.
- **Multi-user: every function that reads or writes user data takes `userId` (right after `db`, or
  first in `queries.ts`) and filters on it.** Pages and actions get it only from `lib/session.ts`,
  never from the request. Add any new query path to `src/lib/isolation.test.ts`.

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

## Always-on server (AWS Lightsail, Mumbai)

Delta requires a whitelisted IP even for Read Data keys (confirmed by the user, 2026-10-31),
and the PC's mobile IP keeps changing. So the bot and sync run on an **AWS Lightsail** server
with a fixed IP, 24/7. Oracle Cloud was tried first: its signup rejected the user's card
("billing address differs"). The user's AWS account is older, with no free credits, so plain EC2
plus an Elastic IP would cost more than Lightsail, whose plans include the static IP.

| | |
|---|---|
| Instance | Lightsail `delta-journal`, `ap-south-1` Zone A, Ubuntu 24.04 (x86_64), **$7/month** plan (1 GB RAM, 2 vCPU, 40 GB SSD), dual-stack |
| Static IPv4 | `15.206.227.0` (static IP `delta-journal-ip`, free while attached) |
| IPv6 | `2406:da1a:11d8:a300:8a23:358c:c477:aff` (stable unless IPv6 is disabled/re-enabled). **The server reaches Delta over IPv6**, so this address must be on the key's whitelist; the IPv4 is listed too |
| SSH | `ssh -i ~/.ssh/delta_journal_oracle ubuntu@15.206.227.0` (key named before the switch to AWS; it was installed by a Lightsail launch script) |
| Repo | `~/delta-journal`, cloned with a read-only GitHub deploy key (`~/.ssh/github_deploy`, "delta-journal Lightsail server (read-only)") |
| Service | `delta-journal-bot` (systemd), restarts on failure, starts on boot (reboot tested 2026-10-31). About 175 MB RAM |

- `deploy/server/setup.sh`: one-time setup (2 GB swap, Node 24 from NodeSource, `npm ci`,
  `db:migrate`, installs and starts the service). Works on any Ubuntu VM. Safe to re-run.
- **Daily backups** (since 2026-11-07): the `delta-journal-backup.timer` runs `npm run db:backup` at 21:00 UTC
  (02:30 IST) into `~/delta-journal/data/backups/` (files mode 600, 30 days kept, about 0.5 MB each). Check with
  `systemctl list-timers delta-journal-backup.timer` and `journalctl -u delta-journal-backup`; run one now with
  `sudo systemctl start delta-journal-backup`. They sit on AWS, apart from Turso. **Restore:** `gunzip` a file, then
  `~/.turso/turso db create <new-name> --from-file <file>.db`, point `DATABASE_URL`/`DATABASE_AUTH_TOKEN` (a new token
  for the new database) at it on the PC, the server and Vercel. setup.sh installs the timer.
- **Daily demo refresh:** `delta-journal-demo.timer` runs `npm run demo:seed` at 21:30 UTC (03:00 IST); setup.sh installs it.
  Logs: `journalctl -u delta-journal-demo`.
- `deploy/server/update.sh`: run on the server after pushing code (`git pull`, `npm ci`, `db:migrate`, restart).
  From the PC: `ssh -i ~/.ssh/delta_journal_oracle ubuntu@15.206.227.0 'bash ~/delta-journal/deploy/server/update.sh'`.
- Logs: `journalctl -u delta-journal-bot -f` (a successful sync logs nothing; check `sync_state` in the database).
- `.env.local` on the server (mode 600) is built from the PC's file: `DELTA_SERVER_API_*` becomes
  `DELTA_API_*`, plus `DATABASE_*`, `TELEGRAM_*`, `AI_GATEWAY_API_KEY`, `VAPID_*`, `OWNER_USER_ID` and both `DELTA_KEYS_*`. It is copied with
  `scp`, and the temporary local copy is deleted. It never holds `APP_PASSWORD` or the PC's Delta key.
- **Only one bot may run at a time** (Telegram returns 409 to a second poller). Don't run
  `npm run bot` on the PC while the server's service is running.

## Gotchas (Windows / tooling)

- Git Bash heredocs or `python -c` scripts containing quotes/backslashes sometimes fail to parse or
  lose backslashes. Prefer the file editor for code edits.
- `vercel link` appends `.env*` and `.vercel` to `.gitignore`, which breaks the `!.env.example` exception. Check after linking.
- If the dev server serves stale CSS after editing `globals.css`, restart it.
- PowerShell `.Count` on a single object can print empty: wrap in `@(...)`.
- Claude Code may kill background `npm run dev` / `npm run bot` when memory is low. Stopping a background
  `npx next dev` task can leave its `node … start-server.js` child running on port 3000; the next
  `next dev` then exits with "Another next dev server is already running". Kill that PID.
- Git Bash rewrites `/demo` arguments into Windows paths: run Hallmark's `capture.mjs` and `sloplint --url` with
  `MSYS_NO_PATHCONV=1`. The dev server sometimes keeps serving the old `globals.css`; restart it after editing the CSS.
- **Switching the Telegram bot token:** private chat ids stay the same across bots, but message ids restart, and
  `telegram_messages` is keyed by (chat, message). Delete the old bot's rows (and reset `telegram.notify_since`) before the new
  bot runs for long, or a tap on a new card can resolve to an old card's trade.
- **Turso tokens must be created with expiry "Never".** The first token had a 7-day expiry and took the whole
  site and the bot down on 2026-11-07 (every query: HTTP 401; `/api/health` says `database: unreachable`). To replace
  one: app.turso.tech → `deltajournal` → Create Token (Never, Read & Write), then update `.env.local` on the PC and the
  server (restart the bot) and Vercel's `DATABASE_AUTH_TOKEN`, then `npx vercel deploy --prod`. The Turso CLI is
  installed on the server (`~/.turso/turso`), **logged in as `outsideorbit29`** (account-wide token in its config;
  `turso auth logout` removes it), so `ssh … '~/.turso/turso db tokens create deltajournal'` makes a token. It has no
  native Windows build.
- `.env.local` points at Turso, and opening the database runs migrations: a local `npm run dev` or
  script with a new migration **migrates the live database**. Test against `DATABASE_URL=file:data/dev.db`
  (a copy of `data/journal.db`) until the rollout.

## Status and roadmap

Done (all pushed): 1 sync · 2 trades + auto tags · 3 dashboard and charts · 4 journal + R ·
5 Telegram bot · 6 AI (review, suggestions, voice) · 7 PWA + login + Turso + Vercel.

8 phone push notifications · 9 always-on server with a fixed IP (AWS Lightsail Mumbai) (2026-10-31).

### Next: Hardwon, a public multi-user product (decided 2026-10-31)

- **Name:** **Hardwon**, on **hardwon.in** (chosen 2026-11-07; the owner buys it from GoDaddy, since Vercel does not sell
  `.in`). It replaced "Edgebook", which three other trading journals already used, and "Delta Journal" (Delta is another
  company's trademark). The sealed-key labels in `lib/keys/` still say `edgebook` on purpose: every stored key depends on them.
- **Audience:** Indian traders only. The beta is Delta Exchange India only.
- **Pricing:** the first 10 users are free for 3 months (the user picks who), then three paid plans (tiers being decided).
- **Team and timeline:** the user builds solo with Claude; private beta in about one week (target ~2026-11-07).
- **Planned building blocks:** Clerk accounts; a `user_id` on every table with isolation tests;
  per-user Delta keys encrypted so only the sync server can decrypt them; the multi-user sync
  worker on the fixed-IP server (users whitelist our IPs); one shared Telegram bot with account
  linking; invite-gated sign-up for the first 10; legal pages (DPDP Act), data export and deletion.
  Payments come after the beta (an Indian seller: Stripe if it onboards, otherwise Razorpay for UPI).
- **Delta's terms and limits (researched 2026-11-07, not legal advice):**
  - Rate limits are fine: authenticated requests are throttled **per user ID**, not per IP (docs.delta.exchange): 20,000
    weight per 5 minutes; fills, order history and wallet transactions cost 10 per page, open orders 3. One sync is about
    35-65 weight (order history is read unwindowed, 200 per page), so a minute-by-minute sync uses roughly 1-2% of a
    user's quota, and many users behind our one IP do not share a quota. Public calls (candles) are throttled per IP.
    A trader with thousands of orders costs 10 per 200 orders per sync: window the order history if that ever matters.
  - The Terms of Use (delta.exchange/terms-of-use, Excelium Technologies Pvt Ltd; trademarks owned by Chainlabs DMCC;
    Indian law, DIAC arbitration) say **nothing about API keys or third-party apps**, but some clauses could be read
    against Hardwon: 20.6.1 (data, including API data, is "for your own personal use"; commercial use needs Delta's
    prior written consent), 3.1.11 (not "use the Services to provide services to third parties"), 3.1.17 (not
    "disclose the user authentication"), 20.7.5 (no commercial use of Delta's logo). Delta itself markets free APIs,
    and third-party tools (Tradetron, OpenAlgo, StockSharp, TradingView bots) already take users' keys.
  - So: **ask Delta for written consent before charging** (support / API team), keep "Independent, not affiliated with
    Delta Exchange" on the site, use the name only to describe compatibility and never Delta's logo.

Week plan and progress:
- **Day 1 (done and live, 2026-10-31): Clerk accounts and `user_id` everywhere**, isolation tests, `claim-legacy`.
  Rollout as done: back up Turso → merge to `main` (Vercel deploys) → run `deploy/server/update.sh` on the server
  (it migrates Turso to 0008 and restarts the bot) → the owner signs up on the hosted app →
  `npm run claim-legacy -- user_…` → set `OWNER_USER_ID` in `.env.local` on the PC and the server, restart the bot →
  remove `APP_PASSWORD` from Vercel (done). The old code breaks on the new `app_state` key, so deploy and migrate together.
  In practice: stop the bot first, pull + `npm ci` + `db:migrate` by hand, claim, set `OWNER_USER_ID`, then start the bot,
  so the new bot never syncs into an empty account. The owner signed in locally, so their `users` row was inserted
  into Turso with the same values before the claim.
- **Day 3 (done, 2026-10-31): sealed per-user Delta keys and the multi-user sync** (see "Per-user Delta keys").
  Migration 0009 only adds a table, so old code keeps running while it rolls out.
- **Day 4 (done, 2026-11-01): landing page, waitlist, onboarding, public demo, empty states.**
- **Day 5 (done, 2026-11-01): one shared Telegram bot with account linking** (Settings → Telegram), per-user
  notifications of closes, weekly reviews and sync problems by Telegram and push, push-only users, per-user AI.
  Migration 0010 only adds a table. Invite codes were dropped: Clerk's waitlist already gates sign-ups (the owner
  approves each person), which covers "the first 10, chosen by the owner".
- **Day 6 (done, 2026-11-01): privacy policy and terms, data export and account deletion, rate limits, a health
  check, security headers, users' emails stored.** Security review: every server action and API route checks the
  session (public routes are on purpose), `npm audit` clean, no env vars in client code, Telegram text escaped; on the
  server SSH is key-only, only port 22 listens, unattended upgrades are on, `.env.local` is 600. Open items: a lawyer's
  read of the legal pages, an uptime monitor on `/api/health`, a full CSP,
  and the server's pending security updates (67 on 2026-11-01; all installed and rebooted onto the new kernel 2026-11-07).
- **Day 7 (in progress since 2026-11-01): new name, domain, Clerk production, new bot, launch.**
  Done: the redesign is live; `claim-legacy --from` moves an account to a new Clerk id; the Telegram update offset is per bot.
  Decided by the owner: an **English-word name** (Sanskrit names were rejected), sign-in by **email code only** (no Google),
  and a **new Telegram bot** carrying the new name. Vercel does not sell `.in`.
  Waiting on the owner, in order:
  1. **Name: Hardwon, domain hardwon.in** (decided 2026-11-07, still free at the registry that day). The site, bot texts,
     legal pages, manifest and docs are renamed. Point the domain's nameservers to Vercel (`ns1.vercel-dns.com`,
     `ns2.vercel-dns.com`) so Claude can add Vercel's and Clerk's DNS records with `npx vercel dns`.
  2. **Done:** hardwon.in bought on GoDaddy (`.in` KYC passed through Digio 2026-11-07, then GoDaddy lifted its registrar
     hold), nameservers moved to Vercel (`ns1/ns2.vercel-dns.com`), site live with HTTPS; **@Hardwon_bot** is live on the server. The token goes into `.env.local` by the owner's
     own hand, never in chat, plus `TELEGRAM_BOT_USERNAME`.
  3. **Done:** Clerk's production instance (`clerk-orange-mountain`) has the domain hardwon.in (set from Vercel → Integrations →
     Clerk → product Settings → Change Configuration; Hobby plan, no add-ons); Vercel added Clerk's five DNS records itself and
     Clerk verified them. Sign-in is email verification code only (passwords off, no social connections); access mode Waitlist.
  4. **Done (2026-11-07):** the owner joined the waitlist, was invited from Clerk (production → Users → Waitlist → Invite),
     signed in, and their data moved: bot stopped, Turso backed up to `data/turso-backup-before-prod-claim.db` (data tables
     only), `claim-legacy -- user_3LkR63D4DdWaDtygu9qXjfOdJIy --from user_3LT1ntUygNbHxmyfsYO9QBzM95P` (325 fills, 140 trades,
     journal, Telegram link, push device, founder dates), the old bot's `telegram_messages` deleted, `OWNER_USER_ID` updated on
     the PC and the server, bot restarted.
     **Done (2026-11-07):** the first invited user signed up, connected their own Delta key (status `ok`, syncing
     every minute: 59 fills, 27 trades) and linked Telegram, end to end without help.
     **Done (2026-11-07):** daily database backups on the server; Vercel 2FA turned on by the owner.
     **Researched (2026-11-07):** Delta's terms and rate limits (see "Delta's terms and limits" above).
     **Left for launch:** Delta's written consent for a paid product; lawyer's read; Vercel Pro and payments
     before charging (Hobby is non-commercial).
  A linked chat keeps working on a new bot once its owner taps Start there. Local `npm run dev` stays on Clerk's
  development instance, so it signs in as a different, empty account: run it against `DATABASE_URL=file:data/dev.db`, never
  Turso, or `ensureUser` creates stray `users` rows there.
- Still open from earlier days: the owner testing Telegram (`/today`) and Settings export on the phone, a lawyer's read of the legal pages, and a full CSP.

## Changelog

- **2026-11-08**: `/privacy` mentions the website error log (page and message, no personal details, 30 days);
  the legal pages' effective date is now 8 November 2026.
- **2026-11-07**: Website error alerts: server errors are recorded in `app_errors` (migration 0012) by
  `src/instrumentation.ts`, and the bot Telegrams the owner (new errors at once, repeats at most hourly).
- **2026-11-07**: Cross-margin funding and liquidation fees (no `product_id`) now reach their trade through
  `meta_data.fill_uuid`; found when the second user's wallet ledger was $0.37 off their trades. The demo re-seeds daily.
- **2026-11-07**: Researched Delta's API rate limits (per user, ample) and Terms of Use (silent on third-party apps;
  commercial use of API data needs written consent): recorded under Status and roadmap.
- **2026-11-07**: The owner turned on two-factor authentication for the Vercel account.
- **2026-11-07**: Server updated: 35 pending packages installed (security fixes had already come through unattended
  upgrades) and rebooted onto kernel 7.0.0-1014-aws; bot and backup timer came back on their own.
- **2026-11-07**: Daily database backups: `npm run db:backup` (`src/db/backup.ts`, every table from the schema itself)
  and a systemd timer on the server (02:30 IST, 30 days kept).
- **2026-11-07**: First real second user: signed up from an invite, connected their own Delta key and Telegram; syncing.
- **2026-11-07**: UptimeRobot monitors `/api/health` every 5 minutes (email alerts); the Turso CLI on the server is logged in.
- **2026-11-07**: Outage 04:58–12:50 IST: the Turso token expired (7-day token). Replaced with a non-expiring one on
  the PC, the server and Vercel (redeployed); health back to ok.
- **2026-11-07**: The owner's data moved to their Clerk **production** account `user_3LkR63D4DdWaDtygu9qXjfOdJIy` (after a
  Turso backup); `OWNER_USER_ID` updated on the PC and the server; the old bot's Telegram message records cleared.
- **2026-11-07**: **hardwon.in is live**: nameservers on Vercel, the old vercel.app address redirects in production,
  Clerk's production instance runs on it (email code sign-in, waitlist), `VAPID_SUBJECT=https://hardwon.in`.
- **2026-11-07**: The bot is now **@Hardwon_bot** on the server; `TELEGRAM_BOT_USERNAME=Hardwon_bot` on Vercel and the server.
  hardwon.in added to the Vercel project; its nameservers wait on GoDaddy lifting the `.in` registrar hold.
- **2026-11-07**: Renamed the product **Hardwon** (domain hardwon.in, bought from GoDaddy): every page, the bot's
  messages, notifications, the manifest, legal pages and docs. The sealed-key labels keep `edgebook`.
- **2026-11-01**: End of session: Day 7 paused on the owner's choice of a new name and domain (see Status and roadmap).
- **2026-11-01**: Day 7 prep: `claim-legacy --from` moves a whole account to a new Clerk id (for the switch to Clerk's
  production instance); notifications and the server unit say Edgebook instead of Delta Journal.
- **2026-11-01**: The legal pages name Anish as the operator (data fiduciary) in `src/lib/legal.ts`.
- **2026-11-01**: Full redesign with Hallmark (Editorial theme): light first with a dark mode, Bricolage Grotesque and
  Source Serif 4, square ink-and-paper system (`tokens.css`, `base.css`, `design.md`), every page and component rebuilt;
  landing page shows real dashboard screenshots; Settings → Appearance; skeleton loading screens; the trade page's
  "All trades" link now goes to `/trades`; the score radar became bars; validated light and dark chart ramps.
- **2026-11-01**: Edgebook Day 6: `/privacy` and `/terms` (DPDP Act), Settings → Your data (JSON and CSV export,
  account deletion), database-backed rate limits (`rate_limits`, migration 0011), `bot.heartbeat` + `GET /api/health`,
  security headers, users' emails stored from Clerk, `telegram_links` added to the claim/export/delete table list.
- **2026-11-01**: Edgebook Day 5: one Telegram bot for every user. Users link their chat from Settings → Telegram
  with a one-time link (`telegram_links`, migration 0010, `TELEGRAM_BOT_USERNAME`); each user gets their own closes,
  weekly review and sync-problem messages by Telegram and push (push alone if they have no chat); `/disconnect`.
  `TELEGRAM_CHAT_ID` is now only the owner's pre-accounts chat. Fixed a prerender warning in `ensureUser`.
- **2026-11-01**: Behaviour score (six habit dimensions, trend, radar card); dashboard greeting and icon stat tiles; the
  landing page rebuilt as a full product page (bento grid, feature rows, animated steps and trade feed, pricing card,
  footer) with a ☰ visitor menu on phones.
- **2026-11-01**: UI/UX pass: dark-only theme with a teal brand and Edgebook logo (the delta-triangle icon is gone),
  phone bottom tab bar and trade cards, dashboard led by net P&L and "Your biggest leaks", calendar shows 3 months first,
  top-3 tags plus "+N", a sync status pill with plain-language errors, swipeable filters on phones, a live demo
  preview on the landing page, Clerk forms themed to match.
- **2026-11-01**: Edgebook Day 4: landing page for visitors, Clerk waitlist (`/waitlist`, access mode Waitlist), onboarding
  that guides a new user to connect Delta, a public read-only `/demo` with made-up trades (`npm run demo:seed`), the
  dashboard moved into `DashboardView`, and empty states for new accounts.
- **2026-10-31**: Edgebook Day 3: users connect their own Delta key on Settings; it is sealed so only the sync server
  can open it (`delta_credentials`, migration 0009, `npm run keys:generate`, `DELTA_KEYS_*`), and the bot syncs every
  connected user each minute.
- **2026-10-31**: The owner confirmed the live site shows their journal after signing in (Days 1-2 done).
  Removed `APP_PASSWORD` from Vercel. Clerk access mode set to **Invite-only** (sign-ups closed).
- **2026-10-31**: Multi-user rollout: Turso migrated to 0008 (backup first), all original data claimed by the owner's
  Clerk account, `OWNER_USER_ID` set on the PC and the server, Clerk sign-in/up paths added on Vercel.
- **2026-10-31**: Edgebook Day 1: Clerk sign-in/sign-up replaced the password login; `users` table and
  `user_id` on every table (migration 0008); every query, sync, rebuild, journal save, AI review, push and
  bot path is scoped to a user, with a two-user isolation test; `npm run claim-legacy`; `OWNER_USER_ID`;
  `npm run dev` now binds to `localhost`.
- **2026-10-31**: Decided to build **Edgebook**, a public multi-user version for Indian traders (beta in about a week); plan in "Status and roadmap".
- **2026-10-31**: The bot now runs 24/7 on an AWS Lightsail server in Mumbai ($7/month, static IP
  `15.206.227.0`) with its own Delta key whitelisted to the server's IPv4 and IPv6. The PC no
  longer runs the bot. Added the `DELTA_SERVER_API_*` variables on the PC.
- **2026-10-31**: Switched the always-on server plan from Oracle (card rejected at signup) to AWS
  EC2 Mumbai; renamed `deploy/oracle/` to `deploy/server/` (the scripts work on any Ubuntu VM).
- **2026-10-31**: Added `deploy/oracle/` (setup script, systemd unit, update script) to run the bot
  24/7 from an Oracle Cloud Always Free VM with a fixed IP, because Delta requires an IP whitelist even for read-only keys.
- **2026-10-31**: Phone push notifications: `/settings` page, `public/sw.js`, `push_subscriptions`
  (migration 0007), the bot pushes new closes, weekly reviews and sync failures; VAPID env vars;
  Delta IP errors now name the IP to whitelist.
- **2026-10-31**: Created CLAUDE.md documenting the whole project; standing rule to update it with every change.
- **2026-10-31**: Phase 7: PWA (manifest, icons), password login (`proxy.ts`), Turso + Vercel
  (`bom1`), sync writes only changed rows (canonical JSON), `db:copy-to-cloud`, `db:migrate`.
- **2026-10-31**: Phase 6: AI weekly review, note suggestions, Telegram voice notes; free-tier-safe default models.
- **2026-10-31**: Phase 5: Telegram bot with trade cards, notes, `/journal` `/today` `/sync`.
- **2026-10-31**: Phase 4: journal form, `/journal` queue, planned stop/target, R from journal.
- **2026-10-31**: Phase 3: dashboard, equity/drawdown, P&L calendar, cost breakdown, candlestick
  trade charts; unwindowed order history; moved-stop detection.
- **2026-10-31**: Phases 1–2: Delta sync, trade reconstruction, wallet reconciliation, auto tags.
