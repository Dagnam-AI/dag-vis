export interface BrandFont {
  readonly family: string;
  readonly weight: "400" | "700";
  /** Path under the library's src/node/fonts/. */
  readonly from: string;
  /** Path under motion/public/ (copied flat by scripts/assets.ts, registered by bridge/fonts.ts). */
  readonly file: string;
}

/**
 * The faces a composition may use: Moonhouse for headlines and the wordmark,
 * Inter for text, Unbounded for UI. "moonhouse" is lowercase on purpose: it is
 * the family the font file declares and the library's social card sets (resvg
 * matches case-sensitively).
 * Moonhouse's licence forbids redistributing the FILE (README "Fonts"): its
 * copy lives only in the gitignored public/fonts/; only rendered pixels leave
 * the machine.
 */
export const BRAND_FONTS: readonly BrandFont[] = [
  {
    family: "Inter",
    weight: "400",
    from: "Inter-Regular.ttf",
    file: "fonts/Inter-Regular.ttf",
  },
  {
    family: "Inter",
    weight: "700",
    from: "Inter-Bold.ttf",
    file: "fonts/Inter-Bold.ttf",
  },
  {
    family: "Unbounded",
    weight: "400",
    from: "Unbounded-Regular.ttf",
    file: "fonts/Unbounded-Regular.ttf",
  },
  {
    family: "moonhouse",
    weight: "400",
    from: "moonhouse/moonhouse.ttf",
    file: "fonts/moonhouse.ttf",
  },
];
