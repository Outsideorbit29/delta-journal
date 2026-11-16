import { createHash } from "node:crypto";

// The Content Security Policy: which sites a page may load scripts, styles, images and connections from.
// It ships as Content-Security-Policy-Report-Only first: browsers report what it would block to
// /api/csp-report (filed with the website's errors, so the owner hears of it) without blocking anything.
// Once no reports arrive for a while, it can be enforced by renaming the header (next.config.ts).

/**
 * Clerk's Frontend API host, from the publishable key ("pk_live_" + base64 of "clerk.hardwon.in$").
 * Null when the key is missing or unreadable.
 */
export function clerkFrontendHost(publishableKey: string | undefined): string | null {
  const encoded = publishableKey?.replace(/^pk_(test|live)_/, "");
  if (!encoded) return null;
  try {
    const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

export const CSP_REPORT_PATH = "/api/csp-report";

/** The policy for every page. `dev` allows eval, which Next uses for fast refresh. */
export function contentSecurityPolicy({ clerkHost, dev = false }: { clerkHost: string | null; dev?: boolean }): string {
  const clerk = clerkHost ? [`https://${clerkHost}`] : [];
  // Clerk's bot protection: a script from its CDN that talks to per-visitor hosts on several ports (seen 2026-11-16).
  const clerkProtect = ["https://cdn.protect.clerk.com", "https://*.protect.clerk.com:*"];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js adds small inline scripts to every page; Clerk loads its UI from its Frontend API and runs a Cloudflare check.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...clerk, ...clerkProtect, "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...clerk, ...clerkProtect, "https://clerk-telemetry.com", ...(dev ? ["ws:"] : [])],
    "frame-src": ["https://challenges.cloudflare.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** One violation from a browser report, in either format (report-uri's csp-report, or the Reporting API's body). */
interface Violation {
  directive: string;
  blocked: string;
  page: string;
}

/** The violations in a report body, at most `max`. Anything unreadable is skipped. */
export function readViolations(body: unknown, max = 5): Violation[] {
  const items = Array.isArray(body) ? body : [body];
  const out: Violation[] = [];
  for (const item of items.slice(0, max)) {
    const r = (item as { "csp-report"?: Record<string, unknown>; body?: Record<string, unknown> }) ?? {};
    const v = r["csp-report"] ?? r.body;
    if (!v || typeof v !== "object") continue;
    const directive = String(v["effective-directive"] ?? v["violated-directive"] ?? v.effectiveDirective ?? "").split(" ")[0];
    const blocked = String(v["blocked-uri"] ?? v.blockedURL ?? "");
    const page = String(v["document-uri"] ?? v.documentURL ?? "");
    if (directive) out.push({ directive: directive.slice(0, 40), blocked: blocked.slice(0, 200), page: page.slice(0, 200) });
  }
  return out;
}

/** Keeps only the origin of a blocked address ("inline", "eval" and "data" stay as they are). */
function originOf(uri: string): string {
  try {
    return new URL(uri).origin;
  } catch {
    return uri.split(/[?#]/)[0].slice(0, 60) || "(none)";
  }
}

/** A violation as a website error: grouped by directive and blocked origin, without query strings. */
export function violationError(v: Violation) {
  const blocked = originOf(v.blocked);
  let path = "?";
  try {
    path = new URL(v.page).pathname;
  } catch {}
  const message = `CSP (report-only) would block ${blocked} for ${v.directive}`;
  return {
    key: createHash("sha256").update(`csp\n${v.directive}\n${blocked}`).digest("hex").slice(0, 32),
    message,
    routePath: "csp",
    routeType: "csp",
    method: "REPORT",
    path,
  };
}
