/** The Edgebook wordmark, set in the condensed head face. `markOnly` shows just the "E" block (small spaces). */
export function Logo({ markOnly = false }: { markOnly?: boolean }) {
  if (markOnly) {
    return (
      <span aria-hidden="true" className="figure-display inline-flex size-7 items-center justify-center bg-ink text-lg text-paper">
        E
      </span>
    );
  }
  return <span className="figure-display text-[1.75rem] leading-none text-ink">Edgebook</span>;
}
