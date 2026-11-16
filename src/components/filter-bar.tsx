import Link from "next/link";
import type { Account } from "@/lib/accounts";
import { filterHref, RANGES, SEGMENTS, type Filters, type SegmentKey } from "@/lib/range";
import { tagLabel } from "@/lib/tags";

/**
 * One row of filters that scopes everything below it on the page. With more than one trading account, the first
 * group picks the account (one at a time: their money is in different currencies).
 */
export function FilterBar({
  path,
  filters,
  symbols,
  accounts = [],
  account = null,
  segments = [],
}: {
  path: string;
  filters: Filters;
  symbols: string[];
  accounts?: Pick<Account, "id" | "label">[];
  account?: Pick<Account, "id"> | null;
  /** The segments this account has (Indian accounts); the filter shows when there are two or more. */
  segments?: SegmentKey[];
}) {
  return (
    <nav aria-label="Filters" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      <AccountPicker accounts={accounts} account={account} href={(id) => filterHref(path, filters, { account: id, segment: undefined, symbol: undefined, tag: undefined })} />
      {segments.length > 1 && (
        <div className={row} role="group" aria-label="Segment">
          <Chip href={filterHref(path, filters, { segment: undefined, symbol: undefined })} active={!filters.segment}>
            Everything
          </Chip>
          {SEGMENTS.filter((s) => segments.includes(s.key)).map((s) => (
            <Chip key={s.key} href={filterHref(path, filters, { segment: s.key, symbol: undefined })} active={filters.segment === s.key}>
              {s.label}
            </Chip>
          ))}
        </div>
      )}
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
        {shownSymbols(symbols, filters.symbol).map((s) => (
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

/** Chips to switch between trading accounts, one at a time; nothing when the user has only one. */
export function AccountPicker({
  accounts,
  account,
  href,
}: {
  accounts: Pick<Account, "id" | "label">[];
  account: Pick<Account, "id"> | null;
  href: (accountId: string) => string;
}) {
  if (accounts.length < 2) return null;
  return (
    <div className={row} role="group" aria-label="Account">
      {accounts.map((a) => (
        <Chip key={a.id} href={href(a.id)} active={account?.id === a.id}>
          {a.label}
        </Chip>
      ))}
    </div>
  );
}

/** The most traded symbols (the list comes most traded first), plus the chosen one if it is further down. */
const MAX_SYMBOLS = 8;
function shownSymbols(symbols: string[], chosen: string | undefined): string[] {
  const top = symbols.slice(0, MAX_SYMBOLS);
  return chosen && !top.includes(chosen) && symbols.includes(chosen) ? [...top, chosen] : top;
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
