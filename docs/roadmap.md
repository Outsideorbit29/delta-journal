# Status and roadmap


Done (all pushed): 1 sync · 2 trades + auto tags · 3 dashboard and charts · 4 journal + R ·
5 Telegram bot · 6 AI (review, suggestions, voice) · 7 PWA + login + Turso + Vercel.

8 phone push notifications · 9 always-on server with a fixed IP (AWS Lightsail Mumbai) (2026-10-31).

## Next: Hardwon, a public multi-user product (decided 2026-10-31)

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


## Indian brokers: Dhan and Groww (planned 2026-11-16)

Users can connect several accounts, kept apart (USD and INR are never summed), and choose which one the dashboard shows.
- **Phase 1, done 2026-11-16:** trading accounts under every row (`accounts`, `account_id`; migration 0014).
- **Phase 2, done 2026-11-16:** Dhan by API (free; read calls need no static IP): history with charges, token pasted once
  and renewed by the server; account chips; ₹ formatting.
- **Phase 3, Groww: parked on 2026-11-16 as a future update.** The owner has a Groww API subscription and chose the API
  over Excel upload. What the docs say (read 2026-11-16, groww.in/trade-api/docs):
  - **Only today's trades:** `GET /v1/order/list` is "the history of orders executed for the day" (no date filter), and
    `GET /v1/order/trades/{groww_order_id}` gives each fill (`trade_date_time`, `exchange_trade_id`, price, quantity,
    product, segment). No past orders, contract notes, ledger or P&L endpoint. So Groww syncs **from the day it is
    connected onwards**: the server must read each trading day before the list resets. Past history would need a
    one-time Excel import (not wanted for now).
  - **No charges in the API:** estimate them from Groww's brokerage and the statutory rates, marked "estimated".
  - **Auth:** the API key + secret flow "requires daily approval" on Groww Cloud; the UI access token expires at 6 AM.
    Use the **TOTP flow** (`POST /v1/token/api/access`, `key_type: "totp"`, the TOTP token as the bearer key): a server
    holding the TOTP token and secret can mint a token itself (the Python docs say "No Expiry"). Token endpoint limit:
    150 a day. Unverified until tried: whether TOTP really needs no daily approval.
  - **To resume:** the owner creates a TOTP key on Groww (Trading APIs → Generate API keys → TOTP) and puts
    `GROWW_TOTP_TOKEN` and `GROWW_TOTP_SECRET` in `.env.local`; then probe token minting and a trading day's orders,
    and build it like Dhan (`lib/groww/`, `broker_credentials` with broker `groww`, account currency INR).
  - Also known: positions (`/v1/positions/user`) have `realised_pnl`; holdings (`/v1/holdings/user`) for checking open
    positions; non-trading rate limit 20/s, 500/min. Static IP for reads: not stated.
- **Phase 4, done 2026-11-16:** NSE time-of-day, expiry-day, intraday/delivery and "won before charges" tags, the
  segment filter, and a score without stop dimensions for brokers that share no stops. Charts for Indian trades: see
  the Dhan data plan note in docs/how-it-works.md.
- Before a public launch: apply to Dhan's partner programme (consent sign-in instead of pasting a personal token).
