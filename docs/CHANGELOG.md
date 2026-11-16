# Changelog

Newest first. Add a line with every change to the project (standing rule in CLAUDE.md).

- **2026-11-16**: Groww parked as a future update; what its API can do (today's trades only, no charges, TOTP sign-in)
  and how to resume are in docs/roadmap.md.
- **2026-11-16**: Journal and AI review per account: the journal queue and the review page get the account chips (Dhan
  trades were buried under newer Delta ones), AI reviews are written per account with the coach told the market and
  currency (migration 0016, existing reviews moved to Delta), and the weekly review sends one per account that traded.
- **2026-11-16**: Dhan first sync failed with "too many requests" (DH-904): the first backfill fired ~30 history requests
  at once. The Dhan client now spaces requests (350 ms) and retries a rate-limit reply after 2, 5 and 10 s.
- **2026-11-16**: **Dhan** (Phase 2): connect a Dhan token in Settings (checked with Dhan, sealed, renewed daily by the
  server); trade history with charges syncs every 15 minutes and today's trades every minute; shares matched on the ISIN.
  Analysis runs per account (no stop tags or crypto sessions for Dhan; size tags compare like with like, which removed one
  Delta tag that compared a perpetual with an option). Dashboard and trades page show one account at a time with account
  chips; money in `$` or `₹`; symbol chips capped at the 8 most traded. Telegram and CSV name the currency. AI review is
  Delta-only for now. `broker_credentials` (migration 0015). /privacy and /terms updated (effective 16 November 2026).
- **2026-11-16**: Trading accounts (Phase 1a of Groww and Dhan): table `accounts` and `account_id` on fills, orders, wallet
  and trades (migration 0014, which gives each user with data one Delta account). Positions are matched per account.
  Rebuilt trades, legs and tags were checked identical to before for every user, including after an old-code rebuild
  in the cutover window. No visible change.
- **2026-11-16**: The proxy now runs for missing file-like paths too. Bots POSTing `/favicon.ico` had made 237 Clerk
  "auth() was called but Clerk can't detect usage of clerkMiddleware()" server errors (and an owner alert every few
  hours) since 2026-11-07; they now get a plain 404.
- **2026-11-08**: The dashboard opens with a Today strip (today, last 7 days, trades to journal with a Journal button), and
  the behaviour score's weakest habit now carries a next step ("Journal now" or "See these trades").
- **2026-11-08**: Evening journaling reminder (21:00 IST, Telegram + push, `/reminders` or a button turns it off) and
  feedback (Settings → Feedback or `/feedback`, table `feedback`, migration 0013) forwarded to the owner's Telegram by the bot.
  `/privacy` mentions feedback.
- **2026-11-08**: CLAUDE.md slimmed from 62k to 20k characters (it loads into every request): the code map was cut (the
  folders show it), and How it works, the server, the roadmap and this changelog moved to `docs/`, which CLAUDE.md points to.

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
