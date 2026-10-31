import Link from "next/link";
import { filterHref, RANGES, type Filters } from "@/lib/range";
import { tagLabel } from "@/lib/tags";

/** One row of filters that scopes everything below it on the page. */
export function FilterBar({ path, filters, symbols }: { path: string; filters: Filters; symbols: string[] }) {
  return (
    <nav aria-label="Filters" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      {/* On phones each group is one row that scrolls sideways instead of wrapping. */}
      <div className={row} role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <Chip key={r.key} href={filterHref(path, filters, { range: r.key })} active={filters.range === r.key}>
            {r.label}
          </Chip>
        ))}
      </div>
      <div className={row} role="group" aria-label="Symbol">
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

const row = "-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-brand bg-brand-soft text-brand"
          : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {children}
    </Link>
  );
}
