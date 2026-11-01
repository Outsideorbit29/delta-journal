import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/** Shared layout for the Privacy Policy and Terms: readable width, headings, the effective date. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">In effect from {LEGAL.effective}.</p>
      <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-zinc-300 [&_a]:text-brand [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-zinc-100 [&_ul]:space-y-1.5">
        {children}
      </div>
      <p className="mt-12 border-t border-zinc-800 pt-6 text-sm text-zinc-500">
        <Link href="/privacy" className="hover:text-zinc-300">Privacy Policy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-zinc-300">Terms of Service</Link>
        {" · "}
        <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-zinc-300">{LEGAL.contactEmail}</a>
      </p>
    </main>
  );
}
