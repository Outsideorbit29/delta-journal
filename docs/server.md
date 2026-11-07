# Always-on server (AWS Lightsail, Mumbai)


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

