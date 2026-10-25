/** Where the faces are copied from, relative to motion/: the library's own folder, the one place the files live. */
export const FONT_SOURCE_DIR = "../src/node/fonts";
/** The folder Remotion serves, relative to motion/; its fonts/ and generated/ are gitignored. */
export const PUBLIC_DIR = "public";
/** Under PUBLIC_DIR: where the faces are copied, flat. */
export const FONT_FOLDER = "fonts";

export interface BrandFont {
  readonly family: string;
  readonly weight: "400" | "500" | "700";
  /** Path under the library's src/node/fonts/. */
  readonly from: string;
  /** Path under motion/public/ (copied flat by scripts/assets.ts, registered by bridge/fonts.ts). */
  readonly file: string;
}

/**
 * The faces a composition may use: Moonhouse for headlines and the wordmark,
 * Inter for text, Unbounded (400, 500 and 700) for UI. "moonhouse" is lowercase on purpose: it is
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
    file: `${FONT_FOLDER}/Inter-Regular.ttf`,
  },
  {
    family: "Inter",
    weight: "700",
    from: "Inter-Bold.ttf",
    file: `${FONT_FOLDER}/Inter-Bold.ttf`,
  },
  {
    family: "Unbounded",
    weight: "400",
    from: "Unbounded-Regular.ttf",
    file: `${FONT_FOLDER}/Unbounded-Regular.ttf`,
  },
  {
    family: "Unbounded",
    weight: "500",
    from: "Unbounded-Medium.ttf",
    file: `${FONT_FOLDER}/Unbounded-Medium.ttf`,
  },
  {
    family: "Unbounded",
    weight: "700",
    from: "Unbounded-Bold.ttf",
    file: `${FONT_FOLDER}/Unbounded-Bold.ttf`,
  },
  {
    family: "moonhouse",
    weight: "400",
    from: "moonhouse/moonhouse.ttf",
    file: `${FONT_FOLDER}/moonhouse.ttf`,
  },
];
