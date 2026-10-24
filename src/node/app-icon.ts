import { appIconSvg } from "../brand/app-icon.js";
import { BRAND } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { describeValue, orDefault } from "../core/validate.js";
import { icnsFromPngs } from "./icns.js";
import { parseOpaque, parseOutDir, writeIconFiles } from "./icon-files.js";
import { renderPng } from "./render-png.js";

export interface AppIconOptions {
  /** Directory to write into; created (with parents) if missing. Required. */
  outDir: string;
  /** Plate colour, opaque. Default BRAND.background.dark. */
  background?: string;
  /** Mark colour, opaque. Default BRAND.mark: the deep red of every icon surface. */
  color?: string;
}

/** Pixel sides of the PNG set, which is also what the .icns is built from. */
const SIDES = [16, 32, 64, 128, 256, 512, 1024] as const;

/** The files `appIcon` writes, in the order it writes them and returns their paths. */
export const APP_ICON_FILES = [
  "app-icon.svg",
  ...SIDES.map((side) => `app-icon-${side}.png` as const),
  "app-icon.icns",
] as const;

/**
 * Writes the desktop app icon into `outDir`: the SVG master (`app-icon.svg`,
 * 1024 units), its PNGs at 16, 32, 64, 128, 256, 512 and 1024 px
 * (`app-icon-<n>.png`, a transparent canvas around the plate) and `app-icon.icns`
 * built from those PNGs. Returns the absolute paths in APP_ICON_FILES order.
 * Every image is rendered before anything touches the disk and each file is
 * written whole (temp file + rename), as `favicons` does. Output is
 * byte-identical for equal options.
 */
export async function appIcon(opts: AppIconOptions): Promise<string[]> {
  const input: unknown = opts;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `options must be an object, got ${describeValue(input)}`,
    );
  const out = parseOutDir(opts.outDir);
  const background = parseOpaque(
    "background",
    orDefault<unknown>(opts.background, BRAND.background.dark),
  );
  const color = parseOpaque(
    "color",
    orDefault<unknown>(opts.color, BRAND.mark),
  );
  const images = await Promise.all(
    SIDES.map(async (size) => ({
      size,
      png: await renderPng(appIconSvg({ size, color, background })),
    })),
  );
  return writeIconFiles("appIcon", out, [
    ["app-icon.svg", appIconSvg({ color, background })],
    ...images.map(({ size, png }) => [`app-icon-${size}.png`, png] as const),
    ["app-icon.icns", icnsFromPngs(images.map(({ png }) => png))],
  ]);
}
