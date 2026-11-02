import { BRAND } from "../brand/tokens.js";
import { parseColor, toCss, toHex, withAlpha } from "../core/color.js";
import { round } from "./cover.js";
import type { CoverPalette } from "./cover-look-types.js";

/** `oklch(L C H)` as hex; the hue is written to 2 decimals, as the glows cover writes it. */
const oklch = (l: number, c: number, h: number): string =>
  toHex(parseColor(`oklch(${l} ${c} ${round(((h % 360) + 360) % 360)})`));

/** A hex colour at `alpha`, as an `rgba()` string any spec accepts. */
export function withA(hex: string, alpha: number): string {
  return toCss(withAlpha(parseColor(hex), alpha));
}

/**
 * The colours of a cover, derived from its hue `h` (degrees, brand red is 25.3): a near
 * black or white page, a deep tint, an ink, the accent red, a warm highlight (towards
 * orange: the ember) and a desaturated teal counter. Dark covers are deep reds on near
 * black; light covers are crisp deep-red accents and pale tints on white, never a pink
 * wash.
 */
export function coverPalette(h: number, theme: "light" | "dark"): CoverPalette {
  if (theme === "dark")
    return {
      base: BRAND.background.dark,
      deep: oklch(0.22, 0.09, h),
      ink: oklch(0.38, 0.17, h),
      accent: oklch(0.55, 0.22, h),
      highlight: oklch(0.74, 0.15, h + 12),
      cool: oklch(0.32, 0.07, h + 170),
      line: oklch(0.74, 0.15, h + 12),
      foreground: BRAND.foreground.dark,
    };
  return {
    base: BRAND.background.light,
    deep: oklch(0.96, 0.02, h),
    ink: oklch(0.86, 0.07, h),
    accent: oklch(0.55, 0.2, h),
    highlight: oklch(0.97, 0.02, h + 12),
    cool: oklch(0.93, 0.03, h + 170),
    line: toHex(parseColor(BRAND.mark)),
    foreground: BRAND.foreground.light,
  };
}
