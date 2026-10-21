import { VisError } from "../core/errors.js";

/**
 * Dagnam.AI brand tokens. Values mirror the web app's theme (index.html
 * splash + CSS tokens): primary red, the two accent reds the wordmark uses
 * per theme, page backgrounds and the four LoadStripes bar colours.
 */
export const BRAND = {
  red: "#ef4444",
  accent: {
    dark: "oklch(52.768% 0.21534 29.097)",
    light: "oklch(67.517% 0.21256 24.87)",
  },
  background: { dark: "#0a0a0a", light: "#ffffff" },
  foreground: { dark: "#fafafa", light: "#0a0a0a" },
  stripes: ["#d42762", "#edc41c", "#1bd766", "#10abba"],
} as const;

export type PaletteName = "red" | "mono" | "stripes" | "ocean" | "ember";

export const PALETTES: Record<PaletteName, readonly string[]> = {
  red: ["#ef4444", "#7f1d1d", "#0a0a0a"],
  mono: ["#fafafa", "#737373", "#0a0a0a"],
  stripes: BRAND.stripes,
  ocean: ["#10abba", "#1bd766", "#0a0a0a"],
  ember: ["#edc41c", "#ef4444", "#7f1d1d", "#0a0a0a"],
};

export function palette(name: string): readonly string[] {
  const p = (PALETTES as Record<string, readonly string[] | undefined>)[name];
  if (!p)
    throw new VisError(
      `unknown palette: ${name} (known: ${Object.keys(PALETTES).join(", ")})`,
    );
  return p;
}
