import { ClerkProvider, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
        <ClerkProvider>
          <header className="border-b border-zinc-200 pt-[env(safe-area-inset-top)] dark:border-zinc-800">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-6">
                <Link href="/" className="shrink-0 font-semibold tracking-tight">
                  Edgebook
                </Link>
                <HideOnLogin>
                  <NavLinks />
                </HideOnLogin>
              </div>
              <HideOnLogin>
                <div className="flex shrink-0 items-center gap-3">
                  {/* Syncing needs a whitelisted IP, so it never runs on the hosted app. */}
                  {canSyncHere() && <SyncButton />}
                  <UserButton />
                </div>
              </HideOnLogin>
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
