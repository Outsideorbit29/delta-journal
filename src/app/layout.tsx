import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { HideOnLogin } from "@/components/hide-on-login";
import { NavLinks } from "@/components/nav-links";
import { SyncButton } from "@/components/sync-button";
import { authMode } from "@/lib/auth";
import { canSyncHere } from "@/lib/runtime";
import { logout } from "./login/actions";
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
  title: "Delta Journal",
  description: "Trading journal and habit insights for Delta Exchange India",
  appleWebApp: { capable: true, title: "Journal", statusBarStyle: "black-translucent" },
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
        <header className="border-b border-zinc-200 pt-[env(safe-area-inset-top)] dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex min-w-0 items-center gap-6">
              <Link href="/" className="shrink-0 font-semibold tracking-tight">
                Delta Journal
              </Link>
              <HideOnLogin>
                <NavLinks />
              </HideOnLogin>
            </div>
            <HideOnLogin>
              <div className="flex shrink-0 items-center gap-3">
                {/* Syncing needs the Delta key and its whitelisted IP, so it only runs on your PC. */}
                {canSyncHere() && <SyncButton />}
                {authMode() === "password" && (
                  <form action={logout}>
                    <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                      Sign out
                    </button>
                  </form>
                )}
              </div>
            </HideOnLogin>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
