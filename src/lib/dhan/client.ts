// A small read-only client for Dhan's API v2 (https://dhanhq.co/docs/v2/). Reading trades needs no
// whitelisted IP (only placing orders does), so the website can test a token and the server can sync.

import type { DhanProfile, DhanTrade } from "./types";

export const DHAN_BASE_URL = "https://api.dhan.co/v2";

/** What the user sees when only a new token will help. */
export const DHAN_EXPIRED = "Your Dhan access token has expired. Generate a new one on web.dhan.co and paste it in Hardwon → Settings.";
export const DHAN_UNREADABLE = "The stored Dhan token could not be unlocked. Connect Dhan again in Settings.";

export interface DhanCredentials {
  clientId: string;
  accessToken: string;
}

/** An error reply from Dhan. `code` is Dhan's ("DH-901" is an invalid or expired token). */
export class DhanApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "DhanApiError";
  }

  /** The token is wrong or has expired: only the user can fix that, with a new token. */
  get isAuth() {
    return this.code === "DH-901" || this.status === 401;
  }
}

type Fetch = typeof fetch;

const MAX_PAGES = 200;

export class DhanClient {
  constructor(
    private readonly credentials: DhanCredentials,
    private readonly fetchImpl: Fetch = fetch,
    private readonly baseUrl = DHAN_BASE_URL,
  ) {}

  async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      headers: {
        "access-token": this.credentials.accessToken,
        "client-id": this.credentials.clientId,
        dhanClientId: this.credentials.clientId,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const error = body as { errorCode?: string; errorMessage?: string; errorType?: string } | null;
    if (!res.ok || (error && typeof error === "object" && !Array.isArray(error) && error.errorCode)) {
      const code = error?.errorCode ?? null;
      const message = error?.errorMessage || error?.errorType || `HTTP ${res.status}`;
      throw new DhanApiError(`Dhan: ${message}${code ? ` (${code})` : ""}`, res.status, code);
    }
    return body as T;
  }

  profile(): Promise<DhanProfile> {
    return this.get<DhanProfile>("/profile");
  }

  /** Today's trades, as they happen (no charges yet). */
  async todaysTrades(): Promise<DhanTrade[]> {
    return (await this.get<DhanTrade[] | null>("/trades")) ?? [];
  }

  /** Trades between two IST dates (YYYY-MM-DD, inclusive), with their charges, every page. */
  async tradeHistory(from: string, to: string): Promise<DhanTrade[]> {
    const all: DhanTrade[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = (await this.get<DhanTrade[] | null>(`/trades/${from}/${to}/${page}`)) ?? [];
      if (!rows.length) return all;
      all.push(...rows);
    }
    throw new Error(`Dhan returned more than ${MAX_PAGES} pages of trades for ${from}..${to}`);
  }

  /**
   * Swaps the token for a new one valid 24 more hours (only tokens made on Dhan Web, and only before they
   * expire; the old one stops working at once). Dhan replies { token, expiryTime, createTime } (tried 2026-11-16).
   * Returns the new token, or null when the reply carries none.
   */
  async renewToken(): Promise<string | null> {
    const body = await this.get<Record<string, unknown> | null>("/RenewToken");
    const token = body?.accessToken ?? body?.token ?? (body?.data as Record<string, unknown> | undefined)?.accessToken;
    return typeof token === "string" && token.length > 20 ? token : null;
  }
}

/** When the token stops working, from the profile's "17/11/2026 10:36" (IST), or null if unreadable. */
export function tokenExpiry(profile: Pick<DhanProfile, "tokenValidity">): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(profile.tokenValidity?.trim() ?? "");
  if (!m) return null;
  const [, d, mo, y, h, mi] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000;
}
