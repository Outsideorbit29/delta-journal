// Single-user password login. The session is a signed, expiring token in an
// httpOnly cookie; nothing is stored server-side.
//
// Login is on whenever APP_PASSWORD is set. When hosted on Vercel it is
// required: without APP_PASSWORD every request is refused, so the journal can
// never be published unprotected by accident.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "dj_session";
export const SESSION_DAYS = 30;

export type AuthMode = "open" | "password" | "misconfigured";

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  if (env.APP_PASSWORD) return "password";
  return env.VERCEL ? "misconfigured" : "open";
}

/** The signing key. Changing APP_PASSWORD (or APP_SESSION_SECRET) signs everyone out. */
function key(env: NodeJS.ProcessEnv): Buffer {
  return createHash("sha256").update(`delta-journal-session:${env.APP_SESSION_SECRET ?? ""}:${env.APP_PASSWORD ?? ""}`).digest();
}

const sign = (payload: string, env: NodeJS.ProcessEnv) => createHmac("sha256", key(env)).update(payload).digest("base64url");

export function createSession(now = Date.now(), env: NodeJS.ProcessEnv = process.env): { token: string; expires: Date } {
  const expires = now + SESSION_DAYS * 86_400_000;
  const payload = `v1.${expires}`;
  return { token: `${payload}.${sign(payload, env)}`, expires: new Date(expires) };
}

export function verifySession(token: string | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  if (!token || !env.APP_PASSWORD) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= now) return false;
  return safeEqual(parts[2], sign(`v1.${expires}`, env));
}

/** Compares in constant time, so the response time does not leak how much matched. */
export function checkPassword(attempt: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.APP_PASSWORD) return false;
  return safeEqual(attempt, env.APP_PASSWORD);
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so both sides have the same length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Only allow redirects back into this app after login. */
export function safeNextPath(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
