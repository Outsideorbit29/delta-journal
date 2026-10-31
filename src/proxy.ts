import { clerkMiddleware } from "@clerk/nextjs/server";

// Reads the Clerk session for every request. It does not decide who may see
// what: every page, server action and API route that touches user data calls
// requireUserId() or currentUserId() from src/lib/session.ts itself, as Clerk
// recommends, so a route can never slip past a path pattern.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
