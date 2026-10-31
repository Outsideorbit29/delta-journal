"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/journal", label: "Journal" },
  { href: "/review", label: "AI review" },
  { href: "/settings", label: "Settings" },
];

/** Top navigation. The current page is only known at request time, so it streams in. */
export function NavLinks() {
  return (
    <Suspense fallback={<Links pathname={null} />}>
      <CurrentLinks />
    </Suspense>
  );
}

function CurrentLinks() {
  return <Links pathname={usePathname()} />;
}

function Links({ pathname }: { pathname: string | null }) {
  return (
    <nav className="-mx-1 flex gap-4 overflow-x-auto px-1 text-sm whitespace-nowrap [scrollbar-width:none]">
      {LINKS.map((l) => {
        const active = pathname !== null && (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={active ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
