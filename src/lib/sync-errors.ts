import { DHAN_EXPIRED, DHAN_UNREADABLE } from "@/lib/dhan/client";
import { KEY_UNREADABLE } from "@/lib/keys/sync-users";

/** A sync failure in plain language, with what the user can do about it. Several brokers' problems come one per line. */
export function explainSyncError(raw: string): string {
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length > 1) return lines.map(explainSyncError).join(" ");
  if (raw === DHAN_EXPIRED || raw === DHAN_UNREADABLE) return raw;
  if (raw.startsWith("Dhan")) {
    if (/DH-901|invalid or expired/i.test(raw)) return DHAN_EXPIRED;
    if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|timeout|HTTP 5\d\d|DH-904|DH-90[89]/i.test(raw)) return "Couldn't reach Dhan just now. Hardwon retries every minute.";
    return `Syncing with Dhan failed: ${raw.replace(/^Dhan:\s*/, "")}`;
  }
  if (raw.includes("ip_not_whitelisted")) {
    return "Delta refused our server because your key's IP whitelist doesn't include it. Add both addresses shown in Settings to the key.";
  }
  if (/invalid_api_key|unauthori[sz]ed|signature|api key/i.test(raw) && !raw.includes("must be set")) {
    return "Delta didn't accept your key. Check the key and secret were pasted in full, or create a new Read Data key.";
  }
  if (raw === KEY_UNREADABLE) return raw;
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|HTTP 5\d\d|rate|429/i.test(raw)) {
    return "Couldn't reach Delta just now. Hardwon retries every minute.";
  }
  return `Syncing with Delta failed: ${raw}`;
}

/** "just now", "5 min ago", "3 h ago", or a date for anything older than a day. */
export function formatAgo(ts: number, now = Date.now(), date: (ts: number) => string = (t) => new Date(t).toISOString().slice(0, 10)): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return date(ts);
}
