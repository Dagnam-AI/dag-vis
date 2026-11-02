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
 * orange: the ember) and a dim, desaturated teal counter. Dark covers are deep reds on
 * near black; light covers are nested red glows with a ruby core on white, never a pink
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
      cool: oklch(0.26, 0.05, h + 170),
      line: oklch(0.74, 0.15, h + 12),
      foreground: BRAND.foreground.dark,
    };
  // Light: a pale floor, a salmon halo (`highlight`), the accent red, and a deep ruby core
  // (`ink`): nested glows read red, not pink. `cool` is unused on light covers (no teal).
  return {
    base: BRAND.background.light,
    deep: oklch(0.96, 0.02, h),
    ink: oklch(0.42, 0.17, h),
    accent: oklch(0.55, 0.22, h),
    highlight: oklch(0.76, 0.13, h + 10),
    cool: oklch(0.9, 0.04, h + 170),
    line: toHex(parseColor(BRAND.mark)),
    foreground: BRAND.foreground.light,
  };
}
