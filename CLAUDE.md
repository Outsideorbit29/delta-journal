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

It is becoming **Edgebook**, a multi-user product for Indian traders (see "Status and roadmap").
Accounts are Clerk users, and every row of data belongs to one user (`user_id`). The owner's
pre-accounts data belongs to the placeholder user `legacy` until `npm run claim-legacy` moves it.

The trader mostly trades perpetual futures, especially **XAUTUSD** (tokenized gold), plus
BTC, SOL and ETH. History goes back to July 2024 (about 135 trades at the time of writing).
The goal is to show *why* they lose, not just what happened. The main finding so far:
fees dwarf gross P&L, scalps lose, and moving a stop while still losing is the costliest habit.

## Live setup

| Part | Where | Notes |
|---|---|---|
| Web app (PWA) | https://delta-journal-three.vercel.app | Vercel project `delta-journal` (team `anish-kumars-projects`), Hobby plan, region `bom1` (Mumbai). Git-connected: **every push to `main` deploys to production.** |
| Database | Turso (libSQL), free plan | `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. Both the hosted app and the PC use it. |
| Sync + Telegram bot | **AWS Lightsail server** `delta-journal`, Mumbai, static IP `15.206.227.0` | systemd service `delta-journal-bot`, running 24/7 since 2026-10-31. See "Always-on server". The PC no longer runs the bot. |
| Code | https://github.com/Outsideorbit29/delta-journal (private) | Branch `main`. |
| Local backups | `data/journal-backup-before-cloud.db`, `data/turso-backup-before-edgebook.db` | Snapshots taken just before moving to Turso, and of Turso just before the multi-user migration (both 2026-10-31). |
| Owner account | Clerk user `user_3LT1ntUygNbHxmyfsYO9QBzM95P` (Google sign-in) | Owns all the original data since the claim on 2026-10-31; this is `OWNER_USER_ID` on the PC and the server |

Syncing with Delta **never runs on Vercel**: Delta keys must be IP-whitelisted, and Vercel's IPs
are not fixed. The hosted app hides the Sync button and `/api/sync` returns 403 there
(`canSyncHere()` in `src/lib/runtime.ts`). The server syncs every minute with its own key. The PC's
key still works for `npm run sync` / `npm run dev` while the PC's IP is whitelisted. Both keys are
the owner's, so they only ever sync into `OWNER_USER_ID`; other users get per-user keys on Day 3.

## Stack

- **Next.js 16.4** (App Router, Turbopack, **Cache Components on**, `src/` dir), React 19.3,
  TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using Next APIs (see AGENTS.md).
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
| `npm run keys:generate` | Create the key pair that locks users' Delta keys and write it into `.env.local` (refuses to replace an existing pair) |
| `npm run claim-legacy -- user_xxx` | Move all `legacy` rows to that Clerk user (who must have signed in once and have no synced data) |
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
| `DELTA_API_KEY`, `DELTA_API_SECRET` | PC + server (different keys) | Delta **Read Data** key for sync. On the server it is the server's own key, whitelisted to its IPs |
| `DELTA_SERVER_API_KEY`, `DELTA_SERVER_API_SECRET` | PC only | Holds the server's key on the PC so it can be copied to the server as its `DELTA_API_*` (see "Always-on server") |
| `DELTA_BASE_URL` | optional | Defaults to `https://api.india.delta.exchange` |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | PC + Vercel | Turso `libsql://…` + token. Unset = `file:data/journal.db` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | PC + Vercel | Clerk accounts. On Vercel they come from the Marketplace integration (type "Config"); on the PC they were pulled once into `.env.local`. Currently a Clerk **development** instance (`pk_test`) on both |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | PC + Vercel | `/sign-in`, `/sign-up` (not secret) |
| `DELTA_KEYS_PUBLIC_KEY` | PC + Vercel + server | Locks (seals) users' Delta keys. Not secret |
| `DELTA_KEYS_PRIVATE_KEY` | PC + server, **never Vercel** | Unlocks them; only the sync server uses it. The PC copy is the backup: losing it means every user reconnects |
| `SYNC_SERVER_IPS` | optional | Comma-separated IPs users whitelist; defaults to the Lightsail IPv4 and IPv6 |
| `OWNER_USER_ID` | PC + server | The owner's Clerk user id. `DELTA_API_KEY`, `npm run sync`, the bot and the local Sync button act for this account only. Unset = `legacy` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | PC only | Bot `@Jornalling_bot`; only that chat is answered |
| `TELEGRAM_SYNC_SECONDS` | optional | Bot sync interval, default 60, minimum 15 |
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
  lib/telegram/            api.ts (minimal Bot API client), render.ts (cards, callbacks, review text; pure), bot.ts (handlers)
  lib/ai/                  models.ts (ids, aiConfigured, explainAiError), suggest.ts, review.ts
  lib/session.ts           requireUserId() (pages; redirects to /sign-in) and currentUserId() (actions, routes; null);
                           both create the user's `users` row on first visit (plan "founder", 90 days free)
  lib/runtime.ts           canSyncHere(), ownerUserId()
  lib/isolation.test.ts    Two users in one database: every query, save, rebuild, sync, AI and push path stays inside its user
  lib/push.ts              Web push: save/remove subscriptions, sendPush() (drops 404/410 and 5-failure devices)
  lib/candles.ts           Candle window choice + per-trade cache
  lib/queries.ts, format.ts, tags.ts, range.ts, app-icon.tsx
  app/                     page.tsx (dashboard), trades/, trades/[id]/, journal/ (queue), review/ (AI), settings/,
                           sign-in/[[...sign-in]], sign-up/[[...sign-up]] (Clerk),
                           manifest.ts, icon.tsx, apple-icon.tsx, pwa-icon/[size]/, api/trades, api/sync,
                           actions.ts (sync), journal-actions.ts, ai-actions.ts, push-actions.ts, delta-actions.ts (connect/disconnect a key),
                           loading.tsx files
  components/              charts/ (equity, calendar, cost breakdown, candlestick, scale), journal-form, journal-section,
                           trade-price-chart, review-view, review-buttons, push-settings, filter-bar, nav-links, sync-button,
                           tag-chip, hide-on-login, delta-key-form
public/sw.js               Service worker: shows pushes, opens the tapped notification's URL (no offline cache)
scripts/                   sync.ts, rebuild.ts, bot.ts, db-migrate.ts, db-copy-to-cloud.ts, claim-legacy.ts, keys-generate.ts
drizzle/                   SQL migrations 0000-0009 + meta (0008 = multi-user, its table rebuilds hand-fixed; 0009 = delta_credentials)
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
Accounts: `users` (Clerk user id, email, `plan` default `founder`, `access_until`).
Keys: `delta_credentials` (one per user: `key_hint` = last 4 characters, `sealed` key and secret, `status`
`pending` | `ok` | `error`, `last_error`, `checked_at`).

**Every table except `users` and `trade_candles` has `user_id`** (default `legacy`). Delta ids
are globally unique, so primary keys stay as they were. Ownership is enforced by filtering on
`user_id` in every query, and an upsert only updates a row the same user owns (`setWhere`), so a
record can never move between users. `sync_state` has the primary key (user, resource).
`app_state` has (user, key), with `user_id` `''` for process-wide state (`telegram.update_offset`).
Per-user state (`telegram.notify_since`, `telegram.weekly_review_for`) sits under the user.

There are no foreign keys. Rebuild deletes `auto` tags only, and only the rebuilt user's rows.

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
- Sync failures are messaged once per distinct error. A Delta IP error names the exact IP to whitelist.
- With VAPID keys set, the same events also go out as **phone push notifications**
  (`ctx.push` → `sendPush`): each new close (tap → `/trades/<id>`), the weekly review (→ `/review`)
  and sync failures (→ `/settings`). A push failure never blocks the Telegram message (`notifyPhone`).

### Per-user Delta keys (`lib/keys/`, `/settings`)
- On Settings → Delta Exchange a user creates a **Read Data** key on Delta, whitelists our server's IPv4 and IPv6
  (`syncServerIps()`), and pastes the key and secret. `connectDelta` checks the shape and **seals** them with
  `DELTA_KEYS_PUBLIC_KEY`: an ephemeral X25519 key agreement, HKDF-SHA256, AES-256-GCM, with the context
  `edgebook:delta:<userId>` as authenticated data, so a box copied to another user's row will not open. The website
  has no private key and can never read a key back; the page only shows the last 4 characters and the status.
- The bot on the server holds `DELTA_KEYS_PRIVATE_KEY`. Every minute, after the owner's sync, it syncs every other
  user with a stored key, one at a time; one user's failure never stops the others. Each outcome goes on the key
  (`ok`, or `error` with Delta's message, which names the IP to whitelist). A key replaced mid-sync stays `pending`.
  Failures are logged once per distinct error, not every minute; telling the user by Telegram or push is Day 5.
- The owner syncs with their own stored key once they connect one, otherwise with the server's `DELTA_API_KEY`.
- Not yet possible: refusing keys that have Trading permission (no known Delta endpoint reports a key's permissions),
  so the page tells users to choose Read Data only.

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
**Sign-ups are Invite-only** (Clerk dashboard → Configure → Access mode; set 2026-10-31). Invite someone
from the Clerk dashboard → Users → Invite. Reach the dashboard from Vercel → Integrations → Clerk → Open in Clerk. Install: Android Chrome → Install app; iOS Safari →
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
- `.env.local` points at Turso, and opening the database runs migrations: a local `npm run dev` or
  script with a new migration **migrates the live database**. Test against `DATABASE_URL=file:data/dev.db`
  (a copy of `data/journal.db`) until the rollout.

## Status and roadmap

Done (all pushed): 1 sync · 2 trades + auto tags · 3 dashboard and charts · 4 journal + R ·
5 Telegram bot · 6 AI (review, suggestions, voice) · 7 PWA + login + Turso + Vercel.

8 phone push notifications · 9 always-on server with a fixed IP (AWS Lightsail Mumbai) (2026-10-31).

### Next: Edgebook, a public multi-user product (decided 2026-10-31)

- **Name:** Edgebook (replaces "Delta Journal" as the public brand; Delta is another company's trademark).
- **Audience:** Indian traders only. The beta is Delta Exchange India only.
- **Pricing:** the first 10 users are free for 3 months (the user picks who), then three paid plans (tiers being decided).
- **Team and timeline:** the user builds solo with Claude; private beta in about one week (target ~2026-11-07).
- **Planned building blocks:** Clerk accounts; a `user_id` on every table with isolation tests;
  per-user Delta keys encrypted so only the sync server can decrypt them; the multi-user sync
  worker on the fixed-IP server (users whitelist our IPs); one shared Telegram bot with account
  linking; invite-gated sign-up for the first 10; legal pages (DPDP Act), data export and deletion.
  Payments come after the beta (an Indian seller: Stripe if it onboards, otherwise Razorpay for UPI).
- **To verify:** Delta's terms for third-party apps syncing other users' accounts, and whether its rate limits are per IP or per key.

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
- Day 4: landing page, onboarding key wizard (whitelist the server's IPv4 and IPv6), demo mode.
- Day 5: shared Edgebook Telegram bot with account linking, per-user push and AI, invite codes capped at 10.
- Day 6: legal pages (DPDP Act), export and delete, monitoring, rate limits, security review. Also store each
  user's email in `users.email` (from Clerk; it is still empty) for support mail, export and deletion.
- Day 7: rebrand to Edgebook and launch. A Clerk **production** instance needs a domain we own, and its
  user ids differ from the development instance's, so the owner's data would need claiming again.

## Changelog

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
