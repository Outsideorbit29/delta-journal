/** The Hardwon wordmark, set in the condensed head face. `markOnly` shows just the "H" block (small spaces). */
export function Logo({ markOnly = false }: { markOnly?: boolean }) {
  if (markOnly) {
    return (
      <span aria-hidden="true" className="figure-display inline-flex size-7 items-center justify-center bg-ink text-lg text-paper">
        H
      </span>
    );
  }
  return <span className="figure-display text-[1.75rem] leading-none text-ink">Hardwon</span>;
}
