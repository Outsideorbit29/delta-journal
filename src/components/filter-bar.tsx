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
        <Link href={filterHref(path, filters, { tag: undefined })} className="face-label link text-sm" aria-label={`Remove the tag filter ${tagLabel(filters.tag)}`}>
          Tag: {tagLabel(filters.tag)}, clear
        </Link>
      )}
    </nav>
  );
}

// Each group is one segmented row: squares sharing hairlines, the chosen one in ink.
const row = "-mx-(--gutter) flex overflow-x-auto px-(--gutter) [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`face-label -ml-px flex min-h-10 shrink-0 items-center border px-3 text-sm whitespace-nowrap no-underline first:ml-0 transition-colors duration-(--dur-short) ${
        active ? "relative z-(--z-raised) border-ink bg-ink text-paper" : "border-rule-2 text-ink-2 hover:bg-paper-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
