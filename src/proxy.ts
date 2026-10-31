import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySession } from "@/lib/auth";

/** Keeps the whole journal behind the password, except the login page and the files an installed app needs. */
export function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "open") return NextResponse.next();
  if (mode === "password" && verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: mode === "misconfigured" ? "APP_PASSWORD is not set" : "Sign in first" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except static assets, the login page, and the manifest and icons
  // (browsers fetch those without cookies when installing the app).
  matcher: ["/((?!_next/static|_next/image|login|manifest\\.webmanifest|favicon\\.ico|icon|apple-icon|pwa-icon).*)"],
};
