import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** The site's one public address. Clerk's production sign-in only works on this domain. */
const CANONICAL_HOST = "hardwon.in";

// Reads the Clerk session for every request. It does not decide who may see
// what: every page, server action and API route that touches user data calls
// requireUserId() or currentUserId() from src/lib/session.ts itself, as Clerk
// recommends, so a route can never slip past a path pattern.
//
// In production, a visit to the old *.vercel.app address goes to the same page on
// hardwon.in. Preview deployments keep their own addresses.
export default clerkMiddleware((_auth, req) => {
  const host = req.headers.get("host") ?? "";
  if (process.env.VERCEL_ENV === "production" && host.endsWith(".vercel.app")) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 308);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
