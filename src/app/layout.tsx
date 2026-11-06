import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { HideOnLogin } from "@/components/hide-on-login";
import { SiteMenu } from "@/components/site-menu";
import { Logo } from "@/components/logo";
import { BottomNav, NavLinks } from "@/components/nav-links";
import { SyncButton } from "@/components/sync-button";
import { SyncStatus } from "@/components/sync-status";
import { canSyncHere } from "@/lib/runtime";
import "./globals.css";

// Heads and labels: Bricolage Grotesque (condensed for heads through font-variation-settings).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  display: "swap",
});

// Reading text, standfirsts and quotations.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hardwon",
  description: "A trading journal for Delta Exchange India that shows which habits cost you money.",
  appleWebApp: { capable: true, title: "Hardwon", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The browser bar takes the paper colour of each mode (the tokens' sRGB equivalents).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#110f0a" },
  ],
};

/** Clerk's sign-in, sign-up and waitlist forms in the site's paper, ink and square corners. */
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-ink)",
    colorPrimaryForeground: "var(--color-paper)",
    colorBackground: "var(--color-paper)",
    colorForeground: "var(--color-ink)",
    colorMuted: "var(--color-paper-2)",
    colorMutedForeground: "var(--color-muted)",
    colorNeutral: "var(--color-ink)",
    colorInput: "var(--color-paper)",
    colorInputForeground: "var(--color-ink)",
    colorBorder: "var(--color-rule-2)",
    colorDanger: "var(--color-error)",
    colorRing: "var(--color-focus)",
    colorShadow: "transparent",
    borderRadius: "0",
    fontFamily: "var(--font-display)",
  },
  // Clerk draws its own fields; give them the site's control height and a visible hairline.
  elements: {
    // Clerk draws its field edge as a faint shadow over its own rule, so ours has to win outright.
    formFieldInput: { minHeight: "2.75rem", border: "1px solid var(--color-muted) !important", boxShadow: "none !important", background: "var(--color-paper)" },
    formButtonPrimary: { minHeight: "2.75rem", boxShadow: "none" },
    card: { boxShadow: "none", border: "1px solid var(--color-rule-2)" },
  },
};

/** Sets the saved light or dark mode before the first paint, so the page never flashes the wrong one. */
const MODE_SCRIPT = `try{var m=localStorage.getItem("mode");if(m==="light"||m==="dark")document.documentElement.dataset.mode=m}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${sourceSerif.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper text-ink-2 antialiased">
        {/* Inside <body>, as Clerk requires with Cache Components. */}
        <ClerkProvider waitlistUrl="/waitlist" appearance={clerkAppearance}>
          <a href="#main" className="face-label absolute -top-24 left-4 z-[500] bg-ink px-4 py-2 text-sm text-paper focus-visible:top-4">
            Skip to content
          </a>
          {/* The slab: one heavy bar across the top, wordmark, sections and account on one line. */}
          <header className="sticky top-0 z-[300] border-b-4 border-ink bg-paper pt-[env(safe-area-inset-top)]">
            <div className="container flex h-16 items-center justify-between gap-6">
              <div className="flex min-w-0 items-center gap-8">
                <Link href="/" aria-label="Hardwon home" className="shrink-0">
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
                  <Show when="signed-in" fallback={<SiteMenu />}>
                    <div className="flex shrink-0 items-center gap-4">
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
