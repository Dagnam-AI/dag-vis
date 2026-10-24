import { BRAND, LOGO, logoSvg } from "@dagnam/vis";

import { svgDataUrl } from "../lib/svg.ts";

/**
 * Every colour and font a composition uses comes from here, never a literal.
 * `display` is Moonhouse (headlines, wordmark), `text` Inter, `ui` Unbounded.
 * Moonhouse lacks curly quotes, dashes and the ellipsis: set fontFamily to
 * `${THEME.display}, ${THEME.text}` so a missing glyph falls back to Inter
 * instead of a system face.
 */
export const THEME = {
  background: BRAND.background.dark,
  foreground: BRAND.foreground.dark,
  accent: BRAND.red,
  stripes: BRAND.stripes,
  display: "moonhouse",
  text: "Inter",
  ui: "Unbounded",
} as const;

export const LOGO_ASPECT = LOGO.width / LOGO.height;

export function logoDataUrl(color: string = BRAND.red, size = 512): string {
  return svgDataUrl(logoSvg({ color, size }));
}
