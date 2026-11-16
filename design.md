# Design: Hardwon

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: editorial
- Shape of the first page: Bento Grid (`/`); the signed-in screens are app screens; `/privacy` and `/terms` a Long Document
- Theme: Editorial (warm white stock, printed black ink, one printer's green)
- Axes: light/display-condensed/chromatic-green · posture: restrained · modes: light and dark (dark re-derived in `src/app/globals.css`)

## Tokens
`src/app/tokens.css` is the source of truth; money and chart tokens, and the dark mode, are in `src/app/globals.css`. The roles:
```css
:root {
  --color-paper: oklch(97% 0.007 86);  --color-paper-2: oklch(94% 0.010 86);  --color-paper-3: oklch(91% 0.012 84);
  --color-ink: oklch(16% 0.012 280);  --color-ink-2: oklch(29% 0.011 280);  --color-muted: oklch(48% 0.010 75);
  --color-rule: oklch(85% 0.009 85);  --color-rule-2: oklch(64% 0.010 80);
  --color-accent: oklch(49% 0.130 152);  --color-accent-ink: oklch(98% 0.005 88);  --color-focus: oklch(52% 0.135 152);
  --color-gain: oklch(45% 0.11 150);  --color-loss: oklch(50% 0.17 27);  --color-warn: oklch(50% 0.11 65);
  --font-display: Bricolage Grotesque (heads at "wdth" 75, 800; labels at 500);  --font-body: Source Serif 4;
  --radius-card: 0;  --radius-pill: 0;  --rule-hair: 1px;  --rule-heavy: 4px;  --shadow-card: none;
}
```
The spacing scale, the type scale, the easings and the durations are the scaffold's and live in `tokens.css`.

## Rules that hold on every page
- Heads in the condensed display face (`h1` to `h3`, `.figure-display` for big numbers); labels, controls, table heads and nav in the label face (`.face-label`); reading text in the serif.
- A section or table opens with the heavy ink rule (`.opens`); rows part by 1px hairlines; depth is a paper step (`bg-paper-2`), never a shadow or a box in a box.
- Profit and loss text is `text-gain` / `text-loss` with its sign. Charts use the blue/red diverging `--viz-*` tokens, never green against red.
- The accent marks the active nav item, the focus ring, a link underline on hover and the one bar that matters; it never fills a band or a rule.
- No eyebrows, no uppercase labels, no middle-dot strings, no rounded corners.

## Controls
- Primary: ink block (`buttonPrimary` in `src/components/ui.ts`), square, 40px in the app, 48px on marketing pages; one per screen.
- Secondary: 1px ink outline, same height. Inputs: square, 1px `--color-rule-2` edge that turns ink on focus.

## Motion
- Character: quiet and purposeful (changed 2026-11-16 from "still"). Motion only where it carries meaning, each move once or tied to scroll, never looping in the app:
  - **Figures count up** (`components/motion/count-up.tsx`): net P&L, the Today strip and the landing tiles count to their value once, ~0.9 s, ease-out, when first in view. The final value is always in the markup.
  - **Opening rules draw in**: the 4px `.opens` rule draws from the left as its section enters (CSS scroll timeline).
  - **Chart lines trace themselves** as the chart scrolls in (`.chart-timeline` + `.draw-line`); areas and end dots fade in after. The landing sparkline reveals left to right.
  - **The landing's leak story** (`landing/leak-story.tsx`) pins on wide screens: each leak lights, its bar grows, its fix appears.
  - **The landing's ticker tape** of demo trades runs slowly, pausing under the pointer or focus.
  - Otherwise state only (colour steps, a 1px press); the pinned run on `/` crossfades its visual.
- Scroll-linked moves use CSS scroll timelines (`animation-timeline`), no script; browsers without them show the finished state. No hover tricks that need a mouse, no 3D, no smooth-scroll hijacking.
- Under reduced motion everything is still and finished at once: no counting, rules and lines drawn, the story a plain list, the tape scrollable by hand. Phones get the same moves except the pinned story, which is a plain list below 60rem.

## Exports
`src/app/tokens.css` is a Tailwind v4 `@theme` block, so every token is a utility (`bg-paper`, `text-ink`, `border-rule-2`, `text-gain`).
