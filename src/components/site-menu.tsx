"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/demo", label: "Live demo" },
];

/** The header for visitors: section links on wide screens, a ☰ menu on phones. */
export function SiteMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className="hidden items-center gap-5 text-sm md:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-zinc-400 hover:text-zinc-100">
            {l.label}
          </Link>
        ))}
        <Link href="/sign-in" className="text-zinc-400 hover:text-zinc-100">
          Sign in
        </Link>
        <Link href="/waitlist" className="rounded-full bg-brand px-4 py-1.5 font-medium text-brand-ink hover:bg-brand-strong">
          Join the waitlist
        </Link>
      </nav>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-9 items-center justify-center rounded-md border border-zinc-800 text-zinc-300"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
          </svg>
        </button>
        {open && (
          <div className="absolute inset-x-0 top-full border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <ul className="space-y-1">
              {[...LINKS, { href: "/sign-in", label: "Sign in" }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2.5 text-zinc-300 hover:bg-zinc-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/waitlist"
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-full bg-brand py-2.5 text-center font-medium text-brand-ink"
            >
              Join the waitlist
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
