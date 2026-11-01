import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/** Shared layout for the Privacy Policy and Terms: a long document at reading width, the effective date under the title. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main id="main" className="container pt-12 pb-24">
      <div className="mx-auto max-w-[44rem]">
        <h1 className="text-[clamp(2.75rem,6vw,4.5rem)]">{title}</h1>
        <p className="face-label mt-4 border-b-4 border-ink pb-6 text-base text-muted">In effect from {LEGAL.effective}.</p>
        <div className="mt-10 space-y-5 text-lg leading-[1.7] text-ink-2 [&_a]:text-ink [&_a]:underline [&_a]:decoration-rule-2 [&_a]:underline-offset-4 [&_a:hover]:decoration-accent [&_h2]:mt-14 [&_h2]:max-w-none [&_h2]:border-t [&_h2]:border-rule-2 [&_h2]:pt-6 [&_h2]:text-2xl [&_li]:ml-6 [&_li]:list-disc [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:space-y-2">
          {children}
        </div>
        <nav aria-label="Legal" className="face-label mt-16 flex flex-wrap gap-x-8 gap-y-2 border-t border-rule-2 pt-6 text-base">
          <Link href="/privacy" className="link">
            Privacy Policy
          </Link>
          <Link href="/terms" className="link">
            Terms of Service
          </Link>
          <a href={`mailto:${LEGAL.contactEmail}`} className="link">
            {LEGAL.contactEmail}
          </a>
        </nav>
      </div>
    </main>
  );
}
