import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { HideOnLogin } from "@/components/hide-on-login";
import { NavLinks } from "@/components/nav-links";
import { SyncButton } from "@/components/sync-button";
import { canSyncHere } from "@/lib/runtime";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Edgebook",
  description: "Trading journal and habit insights for Indian traders",
  appleWebApp: { capable: true, title: "Edgebook", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* Inside <body>, as Clerk requires with Cache Components. */}
        <ClerkProvider waitlistUrl="/waitlist">
          <header className="border-b border-zinc-200 pt-[env(safe-area-inset-top)] dark:border-zinc-800">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-6">
                <Link href="/" className="shrink-0 font-semibold tracking-tight">
                  Edgebook
                </Link>
                <HideOnLogin>
                  <Suspense fallback={null}>
                    <Show when="signed-in">
                      <NavLinks />
                    </Show>
                  </Suspense>
                </HideOnLogin>
              </div>
              <HideOnLogin>
                <Suspense fallback={null}>
                  <Show when="signed-in" fallback={<SignedOutLinks />}>
                    <div className="flex shrink-0 items-center gap-3">
                      {/* Syncing needs a whitelisted IP, so it never runs on the hosted app. */}
                      {canSyncHere() && <SyncButton />}
                      <UserButton />
                    </div>
                  </Show>
                </Suspense>
              </HideOnLogin>
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}

function SignedOutLinks() {
  return (
    <nav className="flex shrink-0 items-center gap-4 text-sm">
      <Link href="/demo" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        Demo
      </Link>
      <Link href="/sign-in" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        Sign in
      </Link>
      <Link
        href="/waitlist"
        className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Join the waitlist
      </Link>
    </nav>
  );
}
