import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { HideOnLogin } from "@/components/hide-on-login";
import { Logo } from "@/components/logo";
import { BottomNav, NavLinks } from "@/components/nav-links";
import { SyncButton } from "@/components/sync-button";
import { SyncStatus } from "@/components/sync-status";
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
  themeColor: "#09090b",
};

/** Clerk's sign-in, sign-up and waitlist forms in Edgebook's dark theme and teal brand. */
const clerkAppearance = {
  variables: {
    colorPrimary: "#2dd4bf",
    colorPrimaryForeground: "#042f2e",
    colorBackground: "#18181b",
    colorForeground: "#f4f4f5",
    colorMuted: "#27272a",
    colorMutedForeground: "#a1a1aa",
    colorNeutral: "#f4f4f5",
    colorInput: "#09090b",
    colorInputForeground: "#f4f4f5",
    colorBorder: "#3f3f46",
    colorDanger: "#fb7185",
    colorRing: "#2dd4bf",
    colorShadow: "#000000",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        {/* Inside <body>, as Clerk requires with Cache Components. */}
        <ClerkProvider waitlistUrl="/waitlist" appearance={clerkAppearance}>
          <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4">
              <div className="flex min-w-0 items-center gap-6">
                <Link href="/" aria-label="Edgebook home" className="shrink-0">
                  <Logo />
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
                      <SyncStatus />
                      {/* Syncing needs a whitelisted IP, so it never runs on the hosted app. */}
                      {canSyncHere() && (
                        <div className="hidden md:block">
                          <SyncButton />
                        </div>
                      )}
                      <UserButton />
                    </div>
                  </Show>
                </Suspense>
              </HideOnLogin>
            </div>
          </header>
          {children}
          <HideOnLogin>
            <Suspense fallback={null}>
              <Show when="signed-in">
                <BottomNav />
              </Show>
            </Suspense>
          </HideOnLogin>
        </ClerkProvider>
      </body>
    </html>
  );
}

function SignedOutLinks() {
  return (
    <nav className="flex shrink-0 items-center gap-4 text-sm">
      <Link href="/demo" className="text-zinc-400 hover:text-zinc-100 max-sm:hidden">
        Demo
      </Link>
      <Link href="/sign-in" className="text-zinc-400 hover:text-zinc-100">
        Sign in
      </Link>
      <Link href="/waitlist" className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-ink hover:bg-brand-strong">
        Join the waitlist
      </Link>
    </nav>
  );
}
