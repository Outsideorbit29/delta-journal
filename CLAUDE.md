@AGENTS.md

# Delta Journal: project guide

> **Standing rule: update this file, or the doc in `docs/` it points to, with every change to the project.** Any change
> that adds, removes or changes behaviour, setup, environment variables, commands, data model or conventions must update
> the matching section (here or in docs/how-it-works.md, docs/server.md, docs/roadmap.md), and add a line to
> [docs/CHANGELOG.md](docs/CHANGELOG.md), ideally in the same commit and **never later than the same push**.
> If something here is wrong, fix it. These files are the source of truth for how the project works.

## What this is

A trading journal and habit-insight app for one trader's own **Delta Exchange India**
account. It syncs fills, orders and the wallet ledger from Delta's API, rebuilds them into
round-trip trades, tags each trade with behaviour patterns, lets the trader journal each
trade (web or Telegram), and uses AI for weekly coaching reviews, note tagging and voice
notes. It is installable on a phone as a PWA. Since 2026-11-16 it also syncs **Dhan** (Indian stocks and F&O, in
rupees) as a separate trading account; Groww (file upload) is next (plan: docs/roadmap.md).

It is becoming **Hardwon** (hardwon.in; planned as Edgebook until 2026-11-07), a multi-user product for Indian traders (see docs/roadmap.md).
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
| Sync + Telegram bot | **AWS Lightsail server** `delta-journal`, Mumbai, static IP `15.206.227.0` | systemd service `delta-journal-bot`, running 24/7 since 2026-10-31. See docs/server.md. The PC no longer runs the bot. |
| Code | https://github.com/Outsideorbit29/delta-journal (private) | Branch `main`. |
| Local backups | `data/journal-backup-before-cloud.db`, `data/turso-backup-before-edgebook.db` | Snapshots taken just before moving to Turso, and of Turso just before the multi-user migration (both 2026-10-31). |
| Owner account | Clerk **production** user `user_3LkR63D4DdWaDtygu9qXjfOdJIy` (email code sign-in on hardwon.in) | Owns all the original data since the claim on 2026-11-07 (moved from the development user `user_3LT1ntUygNbHxmyfsYO9QBzM95P`); this is `OWNER_USER_ID` on the PC and the server |

Syncing with Delta **never runs on Vercel**: Delta keys must be IP-whitelisted, and Vercel's IPs
are not fixed. The hosted app hides the Sync button and `/api/sync` returns 403 there
(`canSyncHere()` in `src/lib/runtime.ts`). The server syncs every minute with its own key. The PC's
key still works for `npm run sync` / `npm run dev` while the PC's IP is whitelisted. Both keys are
the owner's, so they only ever sync into `OWNER_USER_ID`; other users get per-user keys on Day 3.

## Stack

Versions are in `package.json`. What it doesn't tell you:
- **Next.js 16.4 with Cache Components on.** Read `node_modules/next/dist/docs/` before using Next APIs (see AGENTS.md).
- **Design system:** Hallmark's Editorial theme, locked in `design.md`. Tokens in `src/app/tokens.css` (a Tailwind `@theme`
  block, so `bg-paper`, `text-ink`… are utilities) and `src/app/base.css`; money, chart and dark-mode tokens in `globals.css`.
- **AI SDK 7 through Vercel AI Gateway** with plain `provider/model` strings (free tier: see docs/how-it-works.md → AI).
- **lightweight-charts 5** (Apache-2.0): keep its attribution logo on. Other charts are hand-drawn SVG.
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
| `DELTA_SERVER_API_KEY`, `DELTA_SERVER_API_SECRET` | PC only | Holds the server's key on the PC so it can be copied to the server as its `DELTA_API_*` (see docs/server.md) |
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

## Data model (`src/db/schema.ts`)

Trading accounts: `accounts` (random `acc_…` id, `broker` `delta` | `dhan` | `groww`, `label`, `currency` `USD` | `INR`;
unique per (user, broker) for now; since 2026-11-16, migration 0014). `fills`, `orders`, `wallet_transactions` and `trades`
carry `account_id`: positions are matched per account, and money is only ever summed within one account. `""` marks a row
written by code from before accounts; `rebuildTrades` first hands those to the user's Delta account (`adoptUnassigned`).

Raw (upserted by Delta ids, `raw` keeps the full API record): `fills`, `orders`,
`wallet_transactions`, `sync_state`.
Derived (rebuilt from raw; trade id = id of the opening fill, or `<fillId>-flip`, so it is
stable): `trades`, `trade_fills` (legs), `trade_tags` (`source` = `auto` | `user`).
User data (never touched by sync/rebuild): `journal_entries` (keyed by trade id).
AI reviews (`ai_reviews`) carry `account_id` too: one review covers one account.
Caches/state: `trade_candles`, `telegram_messages` (message → trade, kinds `trade` |
`note_prompt` | `suggestion` with `payload`), `app_state` (key/value), `ai_reviews`,
`push_subscriptions` (endpoint, keys, device label, failure count).
Errors: `app_errors` (process-wide, no user id: website server errors for the owner's alerts).
Feedback: `feedback` (per user: message, source `web` | `telegram`, `delivered_at` once the bot forwarded it to the owner).
Accounts: `users` (Clerk user id, email from Clerk on first visit or backfilled once, `""` if none; `plan` default
`founder`, `access_until`). Limits: `rate_limits` (subject = user id or `chat:<id>`, action, window start, count).
Keys: `delta_credentials` (one per user: `key_hint` = last 4 characters, `sealed` key and secret, `status`
`pending` | `ok` | `error`, `last_error`, `checked_at`). Other brokers: `broker_credentials` (per user and broker: Dhan
client id + token sealed with context `edgebook:dhan:<userId>`, `expires_at`, same statuses; migration 0015).
Dhan fills have ids `dhan:<orderId>:<exchangeTradeId>`; shares are matched on the ISIN (NSE and BSE ids differ).
Telegram: `telegram_links` (one per user: unique `chat_id`, `chat_name`, `linked_at`, and a pending one-time
`code_hash` (SHA-256) with `code_expires_at`).

**Every table except `users`, `trade_candles`, `rate_limits` and `app_errors` has `user_id`** (default `legacy`; `telegram_links` and
`delta_credentials` are keyed by it). Delta ids
are globally unique, so primary keys stay as they were. Ownership is enforced by filtering on
`user_id` in every query, and an upsert only updates a row the same user owns (`setWhere`), so a
record can never move between users. `sync_state` has the primary key (user, resource).
`app_state` has (user, key), with `user_id` `''` for process-wide state (`telegram.update_offset:<bot id>`, one per bot, so a new bot starts from zero; `bot.heartbeat`).
Per-user state (`telegram.notify_since`, `telegram.weekly_review_for`, `telegram.reminder_for`, `telegram.reminders_off`) sits under the user.

There are no foreign keys. Rebuild deletes `auto` tags only, and only the rebuilt user's rows.
`OWNED` in `src/db/claim.ts` lists every per-user table; claim, export and account deletion all use it, so **a new
per-user table must be added there** (and to the isolation test).

## Invariants worth knowing before touching code

Details in docs/how-it-works.md; these break things silently if forgotten:
- Sync writes only new or changed rows (canonical JSON) and rebuilds trades only if something was written: this keeps a
  60 s sync inside Turso's free write quota. Orders are always read unwindowed (a time window drops orders).
- Trades must keep matching Delta's realized P&L and the wallet ledger to the cent; check reconciliation after changing
  `reconstruct.ts` or `analyze.ts`.
- Any change to what data we hold or who processes it must update `/privacy` (not reviewed by a lawyer).
- The sealed-key labels in `lib/keys/` say `edgebook` on purpose: every stored key depends on them.
- Migration 0008 (multi-user) had its table rebuilds fixed by hand: never regenerate it.

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

## Status

Hardwon (hardwon.in) is live in private beta (Day 7 of the launch week, since 2026-11-07): Clerk production, @Hardwon_bot,
two real users syncing, daily backups, uptime monitor and website error alerts. **Left for launch:** Delta's written
consent before charging, a lawyer's read of the legal pages, Vercel Pro and payments, a full CSP.
Full history and decisions: docs/roadmap.md.

## More docs (read when the task touches them)

| File | What's in it |
|---|---|
| `docs/how-it-works.md` | Sync, trades, charges/stops/tags, journal, Telegram bot, public pages and demo, behaviour score, per-user keys, data/legal/limits/monitoring, push, AI, auth and PWA |
| `docs/server.md` | The AWS Lightsail server: SSH, services, timers, backups and restore, update.sh, its `.env.local` |
| `docs/roadmap.md` | Status and roadmap: Hardwon plan, Delta's terms and limits, the week plan day by day |
| `docs/CHANGELOG.md` | Every change, newest first |
