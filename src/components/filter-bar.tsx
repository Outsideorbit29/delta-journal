import Link from "next/link";
import { filterHref, RANGES, type Filters } from "@/lib/range";
import { tagLabel } from "@/lib/tags";

/** One row of filters that scopes everything below it on the page. */
export function FilterBar({ path, filters, symbols }: { path: string; filters: Filters; symbols: string[] }) {
  return (
    <nav aria-label="Filters" className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <Chip key={r.key} href={filterHref(path, filters, { range: r.key })} active={filters.range === r.key}>
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Symbol">
        <Chip href={filterHref(path, filters, { symbol: undefined })} active={!filters.symbol}>
          All symbols
        </Chip>
        {symbols.map((s) => (
          <Chip key={s} href={filterHref(path, filters, { symbol: s })} active={filters.symbol === s}>
            {s}
          </Chip>
        ))}
      </div>
      {filters.tag && (
        <Link href={filterHref(path, filters, { tag: undefined })} className="text-sm text-zinc-500 hover:underline">
          Tag: {tagLabel(filters.tag)} ✕
        </Link>
      )}
    </nav>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </Link>
  );
}
