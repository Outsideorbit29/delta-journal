// Small helpers for Hardwon's few motions (design.md → Motion). Pure, so they are tested.

/** How long a figure takes to count up to its value. */
export const COUNT_UP_MS = 900;

/** Fast at first, settling at the end, like a price coming to rest. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** The value a counting figure shows `elapsed` ms after it started. Exactly `value` once the time is up. */
export function countAt(value: number, elapsed: number, duration = COUNT_UP_MS): number {
  if (elapsed >= duration) return value;
  return value * easeOutCubic(elapsed / duration);
}

/**
 * Where a pinned story stands: which step is lit and how far its bar has grown, from the scroll progress
 * through the story (0 at its start, 1 at its end). Each of `steps` steps gets an equal share of the scroll.
 */
export function storyStep(progress: number, steps: number): { index: number; grown: number[] } {
  const p = Math.min(1, Math.max(0, progress)) * steps;
  const grown = Array.from({ length: steps }, (_, i) => Math.min(1, Math.max(0, p - i)));
  return { index: Math.min(steps - 1, Math.floor(p)), grown };
}
