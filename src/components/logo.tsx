/** The Edgebook mark (a rising line on a teal tile) and, unless `markOnly`, the wordmark. */
export function Logo({ markOnly = false }: { markOnly?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="8" fill="var(--brand)" />
        <path d="M7.5 21.5 L13 16 L17 19.5 L24.5 11.5" fill="none" stroke="var(--brand-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19.5 11.5 H24.5 V16.5" fill="none" stroke="var(--brand-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!markOnly && <span className="font-semibold tracking-tight">Edgebook</span>}
    </span>
  );
}
