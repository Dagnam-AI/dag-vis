import { describeValue } from "../core/describe.js";
import { VisError } from "../core/errors.js";

/**
 * Dagnam.AI brand tokens. Values mirror the web app's theme (index.html
 * splash + CSS tokens): primary red, the two accent reds the wordmark uses
 * per theme, page backgrounds and the four LoadStripes bar colours.
 */
/** Freezes `value` and everything inside it: tokens are shared by every caller. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** The dark theme's primary: the one deep red behind `BRAND.accent.dark` and `BRAND.mark`. */
const ACCENT_DARK = "oklch(52.768% 0.21534 29.097)";

export const BRAND = deepFreeze({
  red: "#ef4444",
  accent: {
    dark: ACCENT_DARK,
    light: "oklch(67.517% 0.21256 24.87)",
  },
  /**
   * The mark colour of every icon surface (favicons, apple-touch, PWA, the desktop
   * app icon): the dark theme's primary, so no icon uses a second copy of it.
   */
  mark: ACCENT_DARK,
  background: { dark: "#0a0a0a", light: "#ffffff" },
  foreground: { dark: "#fafafa", light: "#0a0a0a" },
  stripes: ["#d42762", "#edc41c", "#1bd766", "#10abba"],
} as const);

export type PaletteName = "red" | "mono" | "stripes" | "ocean" | "ember";

export const PALETTES: Readonly<Record<PaletteName, readonly string[]>> =
  deepFreeze({
    red: ["#ef4444", "#7f1d1d", "#0a0a0a"],
    mono: ["#fafafa", "#737373", "#0a0a0a"],
    stripes: BRAND.stripes,
    ocean: ["#10abba", "#1bd766", "#0a0a0a"],
    ember: ["#edc41c", "#ef4444", "#7f1d1d", "#0a0a0a"],
  });

export function palette(name: string): readonly string[] {
  // hasOwn: "constructor" and "__proto__" must not resolve to inherited members.
  if (typeof name !== "string" || !Object.hasOwn(PALETTES, name))
    throw new VisError(
      `unknown palette: ${typeof name === "string" ? name.slice(0, 80) : describeValue(name)} (known: ${Object.keys(PALETTES).join(", ")})`,
    );
  return PALETTES[name as PaletteName];
}
