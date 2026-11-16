import type { NextConfig } from "next";
import { clerkFrontendHost, contentSecurityPolicy } from "./src/lib/csp";

// Report-only for now (see src/lib/csp.ts): rename the header to "Content-Security-Policy" to enforce it.
const csp = contentSecurityPolicy({
  clerkHost: clerkFrontendHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  dev: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Every page: no framing (clickjacking), no MIME sniffing, no full URLs leaking to other sites,
        // and no camera, microphone or location. HTTPS-only (HSTS) is already sent by Vercel.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
      {
        // The service worker must never be cached, or phones keep an old one.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
