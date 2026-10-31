import { describe, expect, it } from "vitest";
import { authMode, checkPassword, createSession, safeNextPath, verifySession } from "./auth";

const env = { APP_PASSWORD: "correct horse" } as unknown as NodeJS.ProcessEnv;
const NOW = Date.UTC(2026, 9, 31);

describe("auth", () => {
  it("is open locally, password-protected when set, and refuses to run unprotected on Vercel", () => {
    expect(authMode({} as unknown as NodeJS.ProcessEnv)).toBe("open");
    expect(authMode(env)).toBe("password");
    expect(authMode({ VERCEL: "1" } as unknown as NodeJS.ProcessEnv)).toBe("misconfigured");
    expect(authMode({ VERCEL: "1", APP_PASSWORD: "x" } as unknown as NodeJS.ProcessEnv)).toBe("password");
  });

  it("checks the password exactly", () => {
    expect(checkPassword("correct horse", env)).toBe(true);
    expect(checkPassword("correct horse ", env)).toBe(false);
    expect(checkPassword("", env)).toBe(false);
    expect(checkPassword("anything", {} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("accepts its own sessions until they expire", () => {
    const { token, expires } = createSession(NOW, env);
    expect(verifySession(token, NOW + 1000, env)).toBe(true);
    expect(verifySession(token, expires.getTime() + 1, env)).toBe(false);
  });

  it("rejects tampered, foreign and old-password sessions", () => {
    const { token } = createSession(NOW, env);
    const [v, exp, sig] = token.split(".");
    expect(verifySession(`${v}.${Number(exp) + 86_400_000}.${sig}`, NOW, env)).toBe(false);
    expect(verifySession(`${v}.${exp}.${sig.slice(0, -1)}A`, NOW, env)).toBe(false);
    expect(verifySession(token, NOW, { APP_PASSWORD: "new password" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(verifySession(undefined, NOW, env)).toBe(false);
    expect(verifySession("garbage", NOW, env)).toBe(false);
  });

  it("only redirects back into the app after login", () => {
    expect(safeNextPath("/trades?tag=no_stop")).toBe("/trades?tag=no_stop");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    // Some browsers treat a backslash like a slash, so "/\host" would leave the app.
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
