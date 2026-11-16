"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

// Icons from one set (Lucide's 24px grid, 1.75 stroke), for the phone tab bar only.
const LINKS = [
  { href: "/", label: "Dashboard", short: "Home", icon: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" },
  { href: "/trades", label: "Trades", short: "Trades", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/journal", label: "Journal", short: "Journal", icon: "M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zM8 8h6M8 12h6M18 8h2v12" },
  { href: "/review", label: "AI review", short: "Review", icon: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" },
  { href: "/settings", label: "Settings", short: "Settings", icon: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" },
];

const isActive = (pathname: string | null, href: string) =>
  pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Desktop navigation in the slab. The current page is only known at request time, so it streams in. */
export function NavLinks() {
  return (
    <Suspense fallback={<TopLinks pathname={null} />}>
      <Current render={(p) => <TopLinks pathname={p} />} />
    </Suspense>
  );
}

/** Phone navigation: a tab bar fixed to the bottom of the screen, plus a spacer so content clears it. */
export function BottomNav({ toJournal = 0 }: { toJournal?: number }) {
  return (
    <Suspense fallback={<TabBar pathname={null} toJournal={toJournal} />}>
      <Current render={(p) => <TabBar pathname={p} toJournal={toJournal} />} />
    </Suspense>
  );
}

function Current({ render }: { render: (pathname: string | null) => React.ReactNode }) {
  return render(usePathname());
}

function TopLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Sections" className="hidden items-center gap-6 text-sm md:flex">
      {LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`py-2 underline-offset-8 transition-colors duration-(--dur-short) ${
              active ? "text-ink underline decoration-accent decoration-2" : "text-muted no-underline hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabBar({ pathname, toJournal }: { pathname: string | null; toJournal: number }) {
  return (
    <>
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" aria-hidden="true" />
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-(--z-sticky-nav) border-t border-ink bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 border-t-2 text-xs no-underline ${
                    active ? "border-accent text-ink" : "border-transparent text-muted"
                  }`}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true">
                    <path d={l.icon} />
                  </svg>
                  <span>
                    {l.short}
                    {l.href === "/journal" && toJournal > 0 && (
                      <span className="ml-1 inline-block min-w-4 bg-warn px-1 text-center text-[0.7rem] leading-4 text-paper">
                        {toJournal > 99 ? "99+" : toJournal}
                        <span className="sr-only"> to journal</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
