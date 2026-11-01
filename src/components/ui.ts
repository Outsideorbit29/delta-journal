// Shared class names, so every control and surface looks the same everywhere.
// Square corners, ink blocks, hairlines and paper steps: nothing is rounded, nothing casts a shadow.

const control =
  "face-label inline-flex items-center justify-center gap-2 border px-5 text-sm whitespace-nowrap no-underline transition-[background-color,color,transform] duration-(--dur-short) ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

/** The one filled action on a screen: an ink block. App size (40px). */
export const buttonPrimary = `${control} min-h-10 border-ink bg-ink text-paper hover:bg-ink-2`;

/** A quieter action: an ink outline. App size (40px). */
export const buttonSecondary = `${control} min-h-10 border-ink bg-transparent text-ink hover:bg-paper-2`;

/** Marketing pages stand their controls taller (48px). */
export const buttonPrimaryLarge = `${buttonPrimary} min-h-12 px-6`;
export const buttonSecondaryLarge = `${buttonSecondary} min-h-12 px-6`;

/** A destructive action stays secondary in weight, red in ink. */
export const buttonDanger = `${control} min-h-10 border-loss bg-transparent text-loss hover:bg-paper-2`;

/** A tinted well: a paper step under a hairline. Never a raised card. */
export const well = "bg-paper-2 border-t border-rule-2";

/** Kept for older call sites: a group of content on its own paper step. */
export const card = well;

/** A text link with a hairline underline that turns green on hover. */
export const link = "link";

/** Square inputs with a hairline that turns ink on focus. */
export const input =
  "w-full min-h-11 border border-rule-2 bg-paper px-3 text-base text-ink outline-2 outline-offset-[-3px] outline-transparent transition-[border-color] duration-(--dur-short) placeholder:text-muted hover:border-ink focus-visible:border-ink focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55";

/** A small label above a field or a figure: the label face, a step smaller, muted. */
export const label = "face-label text-sm text-muted";
