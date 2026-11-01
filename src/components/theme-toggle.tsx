"use client";

import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const MODES: { value: Mode; label: string }[] = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** The chosen mode lives on <html data-mode>; watch it so the radios follow every change. */
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  return () => mo.disconnect();
}
const currentMode = (): Mode => {
  const m = document.documentElement.dataset.mode;
  return m === "light" || m === "dark" ? m : "system";
};

/**
 * Light, dark, or whatever the device uses. The choice is kept in this browser
 * (localStorage) and applied before the first paint by the script in the root layout.
 */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, currentMode, () => "system" as Mode);

  const choose = (next: Mode) => {
    if (next === "system") document.documentElement.removeAttribute("data-mode");
    else document.documentElement.setAttribute("data-mode", next);
    try {
      if (next === "system") localStorage.removeItem("mode");
      else localStorage.setItem("mode", next);
    } catch {
      // Private windows may refuse storage; the choice still holds for this page.
    }
  };

  return (
    <fieldset className="flex flex-wrap">
      <legend className="visually-hidden">Appearance</legend>
      {MODES.map((m) => (
        <label key={m.value} className="-ml-px first:ml-0">
          <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => choose(m.value)} className="peer visually-hidden" />
          <span className="face-label flex min-h-10 cursor-pointer items-center border border-rule-2 px-4 text-sm text-ink-2 transition-colors duration-(--dur-micro) peer-checked:relative peer-checked:z-(--z-raised) peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus hover:border-ink">
            {m.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
