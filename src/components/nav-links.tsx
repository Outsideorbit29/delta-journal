"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
  { href: "/trades", label: "Trades", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/journal", label: "Journal", icon: "M6 3h11a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2zm3 5h7m-7 4h7" },
  { href: "/review", label: "AI review", icon: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" },
];

const isActive = (pathname: string | null, href: string) =>
  pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Desktop navigation in the header. The current page is only known at request time, so it streams in. */
export function NavLinks() {
  return (
    <Suspense fallback={<TopLinks pathname={null} />}>
      <Current render={(p) => <TopLinks pathname={p} />} />
    </Suspense>
  );
}

/** Phone navigation: a tab bar fixed to the bottom of the screen, plus a spacer so content clears it. */
export function BottomNav() {
  return (
    <Suspense fallback={<TabBar pathname={null} />}>
      <Current render={(p) => <TabBar pathname={p} />} />
    </Suspense>
  );
}

function Current({ render }: { render: (pathname: string | null) => React.ReactNode }) {
  return render(usePathname());
}

function TopLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="hidden gap-1 text-sm md:flex">
      {LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${active ? "bg-zinc-800/80 font-medium text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabBar({ pathname }: { pathname: string | null }) {
  return (
    <>
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" aria-hidden="true" />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "text-brand" : "text-zinc-500"}`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={l.icon} />
                  </svg>
                  {l.label === "AI review" ? "Review" : l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
