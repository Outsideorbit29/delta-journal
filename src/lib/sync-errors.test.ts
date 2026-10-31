import { describe, expect, it } from "vitest";
import { KEY_UNREADABLE } from "@/lib/keys/sync-users";
import { explainSyncError, formatAgo } from "./sync-errors";

describe("explainSyncError", () => {
  it("turns Delta's errors into a fix the user can act on", () => {
    expect(
      explainSyncError("Delta API error: ip_not_whitelisted_for_api_key (HTTP 401). Whitelist this IP for your API key: 2401:4900::1"),
    ).toMatch("Add both addresses shown in Settings");
    expect(explainSyncError("Delta API error: invalid_api_key (HTTP 401)")).toMatch("didn't accept your key");
    expect(explainSyncError("Delta API error: Signature Mismatch (HTTP 401)")).toMatch("didn't accept your key");
    expect(explainSyncError(KEY_UNREADABLE)).toBe(KEY_UNREADABLE);
    expect(explainSyncError("fetch failed")).toMatch("retries every minute");
    expect(explainSyncError("Delta API error: internal (HTTP 503)")).toMatch("retries every minute");
    expect(explainSyncError("something odd")).toBe("Syncing with Delta failed: something odd");
  });
});

describe("formatAgo", () => {
  const now = Date.UTC(2026, 10, 1, 12);
  it("counts minutes and hours, then falls back to a date", () => {
    expect(formatAgo(now - 20_000, now)).toBe("just now");
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(formatAgo(now - 3 * 86_400_000, now, () => "29 Oct")).toBe("29 Oct");
  });
});
