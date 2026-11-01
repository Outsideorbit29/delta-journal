"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonSecondary } from "@/components/ui";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/demo", label: "Live demo" },
];

/** The slab for visitors: section links and the join action on wide screens, a menu on phones. */
export function SiteMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav aria-label="Site" className="hidden items-center gap-6 text-sm md:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="py-2 text-muted no-underline transition-colors duration-(--dur-short) hover:text-ink">
            {l.label}
          </Link>
        ))}
        <Link href="/sign-in" className="py-2 text-muted no-underline transition-colors duration-(--dur-short) hover:text-ink">
          Sign in
        </Link>
        <Link href="/waitlist" className={buttonSecondary}>
          Join the waitlist
        </Link>
      </nav>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="face-label flex min-h-11 items-center border border-ink px-4 text-sm text-ink"
        >
          {open ? "Close" : "Menu"}
        </button>
        {open && (
          <div id="site-menu" className="absolute inset-x-0 top-full border-b-4 border-ink bg-paper">
            <ul className="container divide-y divide-rule py-2">
              {[...LINKS, { href: "/sign-in", label: "Sign in" }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="face-label block py-4 text-lg text-ink no-underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="container pb-6">
              <Link href="/waitlist" onClick={() => setOpen(false)} className={`${buttonSecondary} min-h-12 w-full`}>
                Join the waitlist
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
