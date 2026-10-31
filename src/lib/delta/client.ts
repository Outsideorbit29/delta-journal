import { createHmac } from "node:crypto";
import type { DeltaPage } from "./types";

const DEFAULT_BASE_URL = "https://api.india.delta.exchange";
const USER_AGENT = "delta-journal/0.1";
const MAX_PAGE_SIZE = 200;

export class DeltaApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly context?: unknown,
  ) {
    // Delta reports the caller's IP on whitelist errors; saying it saves a lookup.
    const ip = (context as { client_ip?: string } | undefined)?.client_ip;
    super(`Delta API error: ${code} (HTTP ${status})${code === "ip_not_whitelisted_for_api_key" && ip ? `. Whitelist this IP for your API key: ${ip}` : ""}`);
  }
}

type Params = Record<string, string | number | undefined | null>;

/** Delta signs `method + timestamp + path + query + body` with HMAC-SHA256. */
export function sign(secret: string, method: string, timestamp: string, path: string, query: string, body: string) {
  return createHmac("sha256", secret).update(method + timestamp + path + query + body).digest("hex");
}

export class DeltaClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly apiSecret: string | undefined,
    baseUrl = DEFAULT_BASE_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  static fromEnv(): DeltaClient {
    const key = process.env.DELTA_API_KEY;
    const secret = process.env.DELTA_API_SECRET;
    if (!key || !secret) {
      throw new Error("DELTA_API_KEY and DELTA_API_SECRET must be set in .env.local");
    }
    return new DeltaClient(key, secret, process.env.DELTA_BASE_URL);
  }

  /** A client for public market data, which needs no key. */
  static public(): DeltaClient {
    return new DeltaClient(undefined, undefined, process.env.DELTA_BASE_URL);
  }

  /** GET, signed when the client has a key. `path` includes the version prefix, e.g. `/v2/fills`. */
  async get<T>(path: string, params: Params = {}): Promise<{ result: T; meta?: DeltaPage["meta"] }> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
    }
    const query = search.size ? `?${search}` : "";

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/json" };
      if (this.apiKey && this.apiSecret) {
        // Delta rejects signatures older than a few seconds, so sign on every attempt.
        const timestamp = Math.floor(Date.now() / 1000).toString();
        headers["api-key"] = this.apiKey;
        headers.timestamp = timestamp;
        headers.signature = sign(this.apiSecret, "GET", timestamp, path, query, "");
      }
      const res = await fetch(`${this.baseUrl}${path}${query}`, { headers, cache: "no-store" });

      if (res.status === 429 && attempt < 4) {
        const resetMs = Number(res.headers.get("X-RATE-LIMIT-RESET") ?? 1000);
        await sleep(Math.min(Number.isFinite(resetMs) ? resetMs : 1000, 5000));
        continue;
      }
      if (res.status >= 500 && attempt < 2) {
        await sleep(500 * 2 ** attempt);
        continue;
      }

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new DeltaApiError(body?.error?.code ?? "unknown_error", res.status, body?.error?.context);
      }
      return { result: body.result as T, meta: body.meta };
    }
  }

  /** Follows `meta.after` cursors until every page of `path` has been read. */
  async getAll<T>(path: string, params: Params = {}): Promise<T[]> {
    const rows: T[] = [];
    let after: string | undefined;
    do {
      const page = await this.get<T[]>(path, { ...params, page_size: MAX_PAGE_SIZE, after });
      rows.push(...page.result);
      after = page.meta?.after ?? undefined;
    } while (after);
    return rows;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
