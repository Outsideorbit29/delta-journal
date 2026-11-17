# How it works

Moved out of CLAUDE.md (2026-11-08) so it loads only when needed. Keep it current with every behaviour change.


## Sync (`src/lib/sync.ts`)
- Fills and wallet: incremental with a 2-day overlap window (start/end in **microseconds**).
- **Orders: always the full, unwindowed `/v2/orders/history`** plus open orders. With a time
  window Delta silently dropped orders (231 of 361); the full listing matched a 30-day sweep.
- `writeChanged()` writes only new or changed records, compared as **canonical (key-sorted) JSON**,
  because Delta returns records with fields in varying order. It de-duplicates ids within a batch.
- Trades are rebuilt **only if something was written**. A quiet sync writes 0 rows. This keeps a
  60 s sync within Turso's free 10M writes/month (the old "rewrite everything" was ~69M).
- The first-ever sync starts at 2018-01-01. Without `start_time`, fills and wallet endpoints only return about 90 days.

## Trades (`reconstruct.ts`)
A trade runs from position 0 → back to 0 per product within one trading account (`lib/accounts.ts`; `syncAll` gets the
user's Delta account with `ensureAccount`, which reads before it writes, and `writeChanged` stamps it on every row). Average-cost basis exactly as Delta
does it (adds re-average, exits do not). A fill that crosses zero is split into a close and a
`-flip` open with the fee prorated. Every fill is checked against Delta's
`meta_data.new_position.size`. P&L is checked against `new_position.realized_pnl` (gross, before
fees). **Verified: matches Delta on all 135 trades to the cent.**

## Charges, stops, tags (`analyze.ts`)
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

## Journal (`lib/journal/`)
Fixed vocab: setups, emotions, mistakes (`vocab.ts`). It is shared by the web form and the
Telegram buttons; keys are stored, labels can change. Answers become tags `setup:*`,
`emotion:*`, `mistake:*`, `plan:followed|broken` (source `user`). Auto tags suggest answers
(`SUGGESTED_BY_TAG`), shown dotted and never pre-selected. A planned stop sets risk/R
(`effectiveRisk`: journal stop > unmoved stop order). A stop or target on the wrong side of entry is rejected.
`saveJournalEntry()` in `save.ts` is the single save path (web action + bot). `/journal` is a
queue of un-journaled closed trades, newest first, with Save & next.

**On phones** (below `md`, since 2026-11-17, `components/journal-steps.tsx`) `/journal` shows the next trade as a card
(its trade-page summary and tags) and **Journal it** opens one question per screen over the whole page: setup (picking
one moves on by itself), feelings, mistakes, plan with execution and the optional planned stop/target, then the note.
Suggested answers come from `journalHints()` (`hints.ts`): `SUGGESTED_BY_TAG` plus the tag's own detail as the reason;
suspected mistakes sit in a "Hardwon spotted these" box, still never pre-selected. Answers are kept in the phone's
`localStorage` (`hardwon.journal-draft:<tradeId>`) until saved, so the X closes without losing them. After Save, a
"Saved, N to go" screen leads to the next trade (`/journal?start=1` opens its questions at once). The note step can
record a **voice note** (`MediaRecorder`, up to a minute, 32 kbit/s): `transcribeAction` turns it into text through
`AI_TRANSCRIBE_MODEL` (limit `ai.transcribe`, shared with Telegram; under 900 kB, server actions take 1 MB) and the audio
is not kept. This needs `microphone=(self)` in the Permissions-Policy (`next.config.ts`). Wide screens keep the form.

## Telegram bot (`lib/telegram/`, `scripts/bot.ts`)
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
  sends the weekly review on **Sunday from 20:00 IST** (`telegram.weekly_review_for`; weeks without trades are skipped),
  and the **evening journaling reminder** (below). After the round it forwards new feedback to the owner (below).
- **Journaling reminder** (since 2026-11-08, `maybeSendJournalReminder`): once a day from **21:00 IST**
  (`telegram.reminder_for` = the IST date), if trades closed in the last 24 hours (and after `telegram.notify_since`)
  are still not journaled, the user's chat gets "N trades … aren't journaled yet" with **Journal them** (`n:go`, sends
  the `/journal` cards) and **Turn off these reminders** (`n:off`), plus a push to `/journal`. Only users with a linked
  chat get it, so it can always be turned off where it arrives. `/reminders` toggles it (`telegram.reminders_off` = "1").
- New closes since the user's starting point (`telegram.notify_since`) get a card in their chat and a push. A user with
  no chat but a subscribed phone gets the push only, and their starting point moves past each pushed trade.
  Taps walk setup → feelings → mistakes → plan → rating, saving each tap and editing the card in place.
  Callback data is short (`s:v:breakout`…), and the trade comes from the message id.
- Notes: reply to a card, or tap Add note (ForceReply). **Voice notes** are transcribed by AI.
  After a note, AI suggests new answers (`a:y` / `a:n`). AI calls run per user (`botAi(db, userId)`).
- Commands: `/journal` (last 7 days), `/today`, `/sync` (the user's own key; the owner falls back to the server's
  key), `/review`, `/reminders`, `/feedback <message>`, `/disconnect`, `/help`.
- **Feedback** (since 2026-11-08, `lib/feedback.ts`): Settings → Feedback or `/feedback <message>` saves a row in
  `feedback` (up to 2,000 characters, 10/h). Vercel has no Telegram token, so the bot forwards each undelivered row to
  the owner's chat with the sender's email (`forwardFeedback` in `scripts/bot.ts`) and stamps `delivered_at`. Reply by email.
- Pushes (with VAPID keys): each new close (tap → `/trades/<id>`), the weekly review (→ `/review`) and sync failures
  (→ `/settings`), only to users with a subscribed device. A push failure never blocks the Telegram message (`notifyPhone`).

## Public pages, onboarding and the demo
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

## Behaviour score (`lib/score.ts`, `components/score-card.tsx`)
Each dimension is the share of closed trades **without** a habit, from the auto tags: Risk control (no `no_stop`/`late_stop`),
Stop discipline (no `moved_stop`, among trades with a stop), Position sizing (no `oversized`/`heavy_margin`/`high_leverage`),
Emotional control (no `sized_up_after_loss`/`added_to_loser`/`liquidated`), Patience (no `overtrading`/`hold:scalp`),
Journaling (journaled). Overall = average; 80+ Strong, 60+ Solid, 40+ Needs work, else Leaking. Trend = the last ≤20 trades
vs the ≤20 before. Needs 5 closed trades. It measures process, not P&L. Shown on the dashboard (with the weakest dimension's
tip) as ruled bars, the weakest in the accent, and on the landing page (the demo trader). Owner: 53 Needs work on 2026-11-01 (journaling 1%).
Under the bars, "X is your weakest habit" comes with a next step (`scoreAction` in `dashboard-view.tsx`): for journaling,
"Journal your N trades from the last week" → `/journal`; for the others, its tip and "See these trades" → `/trades?tag=<the
dimension's tag>`. The demo shows the tip alone.

## Today strip (`lib/today.ts`, `components/today-strip.tsx`, since 2026-11-08)
The signed-in dashboard opens with today's net P&L (IST day), the last 7 days', and how many trades closed in the last 7 days
are not journaled, with the page's one filled button, **Journal N trades** → `/journal` (the same 7-day window as Telegram's
`/journal`). It ignores the page's filters, is hidden when nothing closed in 7 days, and never shows on the demo.

## Per-user Delta keys (`lib/keys/`, `/settings`)
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

## Dhan (`lib/dhan/`, `lib/keys/brokers.ts`, `lib/keys/sync-brokers.ts`, since 2026-11-16)
- Settings → Dhan: the user pastes their client ID and a token generated on web.dhan.co. `connectDhan` checks it with
  Dhan's `/profile` straight from the website (reading needs no whitelisted IP), checks the client ID matches, reads the
  expiry (`tokenValidity`, IST) and stores both sealed in `broker_credentials`. A Dhan account (INR) is created.
- The bot syncs every connected Dhan account each round (`syncDhanAccounts`, results merged with Delta's per user):
  - the **trade history** `/trades/{from}/{to}/{page}` (with charges) every 15 minutes, re-reading 7 days, first time
    from 2020 in 90-day windows; `sync_state` resource `dhan.history` (lastTs = how far it has read).
  - **today's trade book** `/trades` every round, **insert-only**: it has no charges, and must never overwrite the
    history's copy (which would rewrite and rebuild every minute). It never adds to an order the history already holds,
    and the history replaces any trade-book copies of its orders (`dropBookCopies`).
  - **Fill ids are `dhan:<orderId>:<n>`**, n = the trade's place in its order (by time, quantity, price;
    `toDhanFillRows`). Not Dhan's `exchangeTradeId`: the trade book gives the exchange's number ("5037393") and the
    history "0" for the same trade, which stored a 1-lot trade twice (fixed 2026-11-17).
  - The token is **renewed** (`GET /RenewToken`) once under 4 hours remain; the new token is sealed and stored before
    anything else. Tried on a real token on 2026-11-16: the reply is `{ token, expiryTime, createTime }`, the new token
    works and the old one stops at once. Expired or rejected (DH-901): status `error` with `DHAN_EXPIRED`, told to
    the user once; an expired token is not sent to Dhan again.
- Mapping (`toDhanFillRow`): quantities are units (contract value 1), the commission is the sum of Dhan's charges
  (brokerage, STT, exchange, SEBI, stamp duty, GST), times are IST. **Shares are matched on the ISIN** (base-36 of its
  national code), because NSE and BSE give one share two security ids; derivatives keep the security id.
- Analysis per account (`analyzeTrades` with account info): no orders from Dhan, so no `no_stop`, no exit reason and
  the trade page says the stop is "not shared by your broker"; no crypto sessions or weekend tag; size tags compare
  like with like (options with options).
- **AI reviews are per account** (`ai_reviews.account_id`, migration 0016; older reviews were moved to the Delta account):
  the coach is told the account's market and currency (`MARKETS` in `lib/ai/review.ts`). The review page, the journal
  and the dashboard's review link use the same account chips (`AccountPicker`); the weekly review and /review send one
  review per account that traded (`generateReviews`), titled with the account when there are several.
- **No price charts for Dhan trades:** Dhan's candles need its paid Data APIs plan ("This API requires a Data APIs Plan.
  Current plan: Free Plan", checked 2026-11-16).
- Checked on the owner's account: 80 Dhan trades → 41 round trips, no warnings, all 10 open positions equal Dhan's holdings.

## Content Security Policy (`lib/csp.ts`, since 2026-11-16)
- Every page sends a full policy as **Content-Security-Policy-Report-Only** (only `frame-ancestors 'none'` is enforced).
  Browsers post what it would block to `/api/csp-report`, which files each distinct directive + blocked origin with the
  website errors, so the owner gets a Telegram alert. Clerk's host comes from the publishable key; Clerk's bot protection
  needs `cdn.protect.clerk.com` and `*.protect.clerk.com:*` (found in a local test: the first policy would have broken sign-in).
- **To enforce:** once no reports arrive for some days of real use (signed-in pages included), rename the header to
  `Content-Security-Policy` in `next.config.ts`. Scripts keep `'unsafe-inline'` (Next's inline scripts; nonces would make
  every page dynamic under Cache Components).

## Trade page (`/trades/[id]`, `components/trade-view.tsx`, `lib/trade-story.ts`, redesigned 2026-11-17)
One trade told in order: a summary line from its tags (`tradeSummary`: how it went and for how long, what the stop did,
then size and timing), four key figures (held, size against your usual when oversized, margin share of the wallet or
charges for rupee accounts, R-multiple), then on wide screens two columns. Left: the price chart (Delta only), **What
happened** (`tradeTimeline`: fills plus when the stop was placed and moved, a stop moved while losing highlighted),
**Where the money went** as a waterfall (`moneySteps`), and a closed **All details and fills** with the old facts table.
Right: **Habits on this trade**, costliest first, each with its detail, its `LEAK_FIXES` line and what it has cost across
the account (`tagPerformance` over the account's trades, which also give Previous / Next and "Trade n of N"); then **Your
journal** (`JournalPanel`): a summary with Edit, or the form when the trade is not journaled yet, with a prompt for a
missing note. On phones the journal and habits come right after the figures. The mockup it came from:
https://claude.ai/artifact/RCYoSxZGBFHWMnZJMfhMPs (private).

## Indian-market insights (Phase 4, since 2026-11-16)
- Trades carry `product_type` (intraday, delivery, margin) and `expiry_date` (migration 0017), read from Dhan's raw record
  at every rebuild (`dhanFillMeta`), so no fill needs rewriting.
- Rupee accounts get, instead of crypto sessions and the weekend: the part of the NSE day (`nse:open` before 09:45,
  `nse:morning` to 12:00, `nse:midday` to 15:00, `nse:close`; `indianSessions` in `config.ts`), `product:intraday` /
  `product:delivery`, `expiry_day` (opened on the contract's expiry date; derivatives only, since Dhan writes the trade's
  own date as a share's "expiry", which tagged shares until 2026-11-17) and `won_before_charges` (a warning: positive
  before charges, negative after). `expiry_day` and `nse:open` count as habits for the biggest leaks.
- The behaviour score leaves Risk control and Stop discipline out for rupee accounts (no stops are visible), instead of
  scoring them perfect. The segment filter (Options, Futures, Intraday stocks, Delivery stocks; `?segment=`) shows
  for accounts with two or more. The cost breakdown says "Charges (brokerage, STT, GST…)".

## Accounts in the website
- The dashboard and trades page show **one account at a time** (`?account=`, default the oldest); account chips appear in
  the filter bar once a user has two. `formatMoney(n, { currency })` writes `$` or `₹` with Indian grouping; each trade
  from `listTrades`/`getTrade` carries its account's `currency`. Telegram cards, phone notifications and `/today` (one
  line per currency) use each trade's currency. Rupee trades hide Delta's price chart, leverage, margin and funding.

## Your data, legal pages and limits (Day 6)
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
  Delta key saves, Telegram links, test pushes, exports and feedback 10/h, bot `/sync` 20/h, 60 bot updates/min per user (more
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

## Push notifications (`lib/push.ts`, `public/sw.js`, `/settings`)
Standard Web Push with VAPID (`web-push`). On `/settings` a device taps "Turn on notifications"
→ permission → `pushManager.subscribe` with `VAPID_PUBLIC_KEY` → stored in `push_subscriptions`.
"Send a test" pushes from the hosted app. Push services' 404/410 remove a subscription, and
5 failures in a row also remove it. Verified end to end on the user's Android phone (Chrome,
installed app) on 2026-10-31. `sw.js` is public (excluded from the login proxy) and served
`no-cache` (`next.config.ts` headers). **iPhone: push only works in the installed Home Screen app
(iOS 16.4+)**; the settings page explains this when opened in Safari.

## AI (`lib/ai/`)
Through AI Gateway. **The account is on the free tier, which blocks all Claude models** and
newer GPT/Gemini. Defaults: reviews and suggestions `google/gemini-2.5-flash`, voice
`openai/gpt-4o-mini-transcribe`. `openai/gpt-5-mini` produced broken structured output
(whitespace runaway), so don't use it. Reviews: `Output.object` with `reviewSchema`, the coach is told
habits/process only (no trade/market calls), `tidyReview()` collapses whitespace and caps fields,
`maxOutputTokens` 8000. About 2.5–6k input tokens per review. Stored in `ai_reviews`.
Tests use `MockLanguageModelV4` from `ai/test`.

## Auth and PWA
**Clerk** (`@clerk/nextjs` 7, Core 3) replaced the old `APP_PASSWORD` login. `<ClerkProvider>` sits
inside `<body>` (required with Cache Components), and the header has Clerk's `<UserButton />`.
`/sign-in` and `/sign-up` render Clerk's components; `HideOnLogin` hides the app chrome there.
Following Clerk's current advice (path matchers are deprecated), **`proxy.ts` protects nothing by
path**. Each page calls `requireUserId()`, and each action and API route calls `currentUserId()`
and refuses without a user ("Sign in first." / 401). With Partial Prerendering a signed-out page
answers 200 with the static shell and then a streamed redirect to `/sign-in`: no user data is
ever sent (verified with curl). If Clerk's keys are missing, `clerkMiddleware` throws, so auth fails closed.
The proxy runs on every path except `_next/` and the real files in `public/` (`sw.js`, `screens/`): a path that only
looks like a file (bots POSTing `/favicon.ico`) renders the 404 inside the root layout, whose Clerk `<Show>` needs the
proxy, so skipping it by extension turned each probe into a logged server error. **A new file in `public/` must be
added to the matcher's skip list** (it still works if not, just through the proxy).
The local Sync button only syncs when the signed-in user is `OWNER_USER_ID`, because the PC's
Delta key is the owner's. Manifest, icons and `sw.js` need no session, so phones can install.
**Sign-ups are Waitlist** (Clerk dashboard → Configure → Access mode; set 2026-11-01): visitors join at `/waitlist`
(Clerk's `<Waitlist />`, `ClerkProvider waitlistUrl`), and the owner approves them in the Clerk dashboard → Waitlist,
or invites someone directly from Users → Invite. Reach the dashboard from Vercel → Integrations → Clerk → Open in Clerk. Install: Android Chrome → Install app; iOS Safari →
Add to Home Screen.

