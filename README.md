# Delta Journal

A local trading journal for Delta Exchange India. It syncs your fills, orders and
wallet ledger, rebuilds them into round-trip trades, and tags each trade with
behaviour patterns (after a loss, oversized, no stop, moved stop, overtrading, and so on).

- **Dashboard** (`/`): net P&L, key stats, equity curve with drawdown, daily P&L
  calendar, where the P&L went (fees, liquidation fees, funding), results by symbol,
  side and tag. One filter row (date range, symbol) scopes the whole page.
- **Trades** (`/trades`): every trade with its tags; each trade page has a price
  chart with the fills, entry, exit and stop marked, and your journal entry.
- **Journal** (`/journal`): a queue of closed trades without a journal entry, newest
  first. Pick a setup, emotions, mistakes, whether you followed your plan, a 1-5
  execution rating, notes, and your planned stop and target. Choices come from the
  fixed lists in `src/lib/journal/vocab.ts`; they become tags (`setup:*`, `emotion:*`,
  `mistake:*`, `plan:*`) so the dashboard analyses them like the automatic ones. A
  planned stop sets the trade's risk and R-multiple.

- **Telegram bot** (`npm run bot`): messages you when a trade closes, with buttons to
  journal it in a few taps (setup, feelings, mistakes, followed plan, rating). Reply to
  a trade message to add a note. Commands: `/journal`, `/today`, `/sync`.

- **AI review** (`/review`, optional): a coach reads your trades, tags and journal notes
  and writes up the costliest habits with numbers, plus rules for next week. Also: suggested
  journal answers from your notes (web and Telegram) and transcribed Telegram voice notes.
  Uses Vercel AI Gateway (`AI_GATEWAY_API_KEY`). The default models (`google/gemini-2.5-flash` and
  `openai/gpt-4o-mini-transcribe`) work on the free tier; set
  `AI_REVIEW_MODEL` / `AI_FAST_MODEL` to use others with paid credits.

By default everything runs on your machine except the optional AI calls, with data in
`data/journal.db` (SQLite). It can also live in the cloud (see below) so you can open it
on your phone as an installed app.

## Setup

1. Create a Delta API key with only the **Read Data** permission, whitelisted to your IP.
2. `cp .env.example .env.local` and fill in `DELTA_API_KEY` and `DELTA_API_SECRET`.
3. `npm install`
4. `npm run sync` for the first full sync, then `npm run dev` and open http://127.0.0.1:3000.

After that, use the **Sync from Delta** button, or `npm run sync`.

### Telegram bot (optional)

1. In Telegram, message **@BotFather**, send `/newbot`, and add the token it gives you
   to `.env.local` as `TELEGRAM_BOT_TOKEN=...`.
2. Run `npm run bot` and send `/start` to your bot. It replies with your chat id; add it
   as `TELEGRAM_CHAT_ID=...` and run `npm run bot` again. The bot only answers that chat.
3. Keep `npm run bot` running. It syncs Delta every minute (`TELEGRAM_SYNC_SECONDS`)
   and sends each newly closed trade. Trades closed before its first run are not sent;
   use `/journal` for the last 7 days.

### On your phone (cloud setup, optional)

The app is hosted on Vercel (free Hobby plan) and the data lives in Turso (free plan).
Syncing with Delta stays on your PC, because the Delta key is whitelisted to its IP: keep
`npm run bot` running there and it writes to the same cloud database.

1. Create a Turso database (Mumbai, `ap-south-1`) and add `DATABASE_URL=libsql://...` and
   `DATABASE_AUTH_TOKEN=...` to `.env.local`, plus `APP_PASSWORD=...` for the login.
2. `npm run db:copy-to-cloud` copies your local journal into it (the cloud database must be
   empty) and checks every table's row count.
3. `npx vercel login`, then `npx vercel link`, add `APP_PASSWORD`, `DATABASE_URL`,
   `DATABASE_AUTH_TOKEN` and `AI_GATEWAY_API_KEY` as production environment variables, and
   `npx vercel deploy --prod`. Pushes to `main` deploy automatically once the repo is connected.
4. On your phone, open the site, sign in, and choose **Add to Home Screen**.

The hosted app refuses every request if `APP_PASSWORD` is missing, so it cannot be
published unprotected. It never gets your Delta or Telegram keys (`.vercelignore` keeps
`.env.local` out of uploads). Schema migrations run from your PC (`npm run db:migrate`, or
any sync), not from the hosted app. A sync writes only new or changed records and rebuilds
trades only when something changed, so syncing every minute stays inside Turso's free
write quota.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on 127.0.0.1:3000 (not visible to other devices) |
| `npm run sync` | Pull new fills, orders and wallet records; rebuild trades if anything changed |
| `npm run db:migrate` | Apply database migrations to `DATABASE_URL` |
| `npm run db:copy-to-cloud` | Copy the local journal into an empty Turso database |
| `npm run bot` | Run the Telegram journaling bot (needs `TELEGRAM_BOT_TOKEN`) |
| `npm run rebuild` | Rebuild trades and auto tags from stored data (after changing `src/lib/config.ts`) |
| `npm test` | Unit tests for trade reconstruction and tagging |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |

## How it works

- **Sync** (`src/lib/sync.ts`): signed requests to `/v2/fills`, `/v2/orders/history`,
  `/v2/orders` and `/v2/wallet/transactions`. The first run fetches all history; later
  runs re-read a short overlap window and upsert by Delta's ids.
- **Trades** (`src/lib/trades/reconstruct.ts`): a trade runs from the fill that opens a
  position to the fill that brings it back to zero. Average cost is tracked the way Delta
  does it, and a fill that flips long to short is split across two trades. Each trade is
  checked against the position size and realized P&L Delta reports on the fills.
- **Charges and tags** (`src/lib/trades/analyze.ts`): funding, liquidation fees and fee
  credits from the wallet ledger are attached to trades; stops come from order history;
  behaviour tags use the thresholds in `src/lib/config.ts`.
- **Charts** use public candles from `/v2/history/candles`, cached per trade in the
  `trade_candles` table. Chart colours are CSS variables in `src/app/globals.css`.
- **Delta API quirks handled:** order history is read without a time window, because
  windowed queries silently drop orders. Moved stops are detected from
  `meta_data.edit_timestamp`; Delta keeps only the final stop price, so planned risk
  and R are only computed for stops that were never moved.
- Net P&L = gross − fees − liquidation fees + funding. Summed over all trades, this
  equals the trading lines of your wallet ledger.

## API

- `GET /api/trades?symbol=XAUTUSD&tag=no_stop` returns stats and trades as JSON
- `POST /api/sync` runs a sync
