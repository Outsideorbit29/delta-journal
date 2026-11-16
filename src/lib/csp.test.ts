import { describe, expect, it } from "vitest";
import { clerkFrontendHost, contentSecurityPolicy, readViolations, violationError } from "./csp";

describe("the content security policy", () => {
  it("reads Clerk's host from the publishable key and allows it", () => {
    const key = `pk_live_${Buffer.from("clerk.hardwon.in$").toString("base64")}`;
    expect(clerkFrontendHost(key)).toBe("clerk.hardwon.in");
    expect(clerkFrontendHost(undefined)).toBeNull();
    expect(clerkFrontendHost("pk_live_!!!")).toBeNull();
    const policy = contentSecurityPolicy({ clerkHost: "clerk.hardwon.in" });
    expect(policy).toContain("script-src 'self' 'unsafe-inline' https://clerk.hardwon.in https://cdn.protect.clerk.com https://*.protect.clerk.com:* https://challenges.cloudflare.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("report-uri /api/csp-report");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("files a browser report by directive and blocked origin, without query strings", () => {
    const [v] = readViolations({
      "csp-report": { "document-uri": "https://hardwon.in/trades?symbol=X", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?u=1" },
    });
    const e = violationError(v);
    expect(e.message).toBe("CSP (report-only) would block https://evil.example for script-src-elem");
    expect(e.path).toBe("/trades");
    expect(violationError({ ...v, blocked: "https://evil.example/other.js" }).key).toBe(e.key);
    expect(readViolations([{ body: { effectiveDirective: "img-src", blockedURL: "inline", documentURL: "https://hardwon.in/" } }])[0]).toMatchObject({ directive: "img-src" });
    expect(readViolations("junk")).toEqual([]);
  });
});
