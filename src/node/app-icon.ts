import { appIconSvg } from "../brand/app-icon.js";
import { parsePreset } from "../brand/app-icon-options.js";
import type {
  AppIconLookOptions,
  AppIconPreset,
} from "../brand/app-icon-options.js";
import { BRAND } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { describeValue, integerIn, orDefault } from "../core/validate.js";
import { icnsFromPngs } from "./icns.js";
import { parseOpaque, parseOutDir, writeIconFiles } from "./icon-files.js";
import { renderPng } from "./render-png.js";

export interface AppIconOptions extends AppIconLookOptions {
  /** Directory to write into; created (with parents) if missing. Required. */
  outDir: string;
  /** Plate colour, opaque. Default BRAND.background.dark. */
  background?: string;
  /** Mark colour, opaque. Default BRAND.mark: the deep red of every icon surface. */
  color?: string;
  /** PNG sides in px, each an integer 16..1024, no repeats; written ascending. Default the seven of the .icns set. */
  sizes?: readonly number[];
}

/** Pixel sides of the default PNG set, which is also what the .icns is built from. */
const SIDES = [16, 32, 64, 128, 256, 512, 1024] as const;

/** The files `appIcon` writes for the default sizes, in the order it writes them and returns their paths. */
export const APP_ICON_FILES = [
  "app-icon.svg",
  ...SIDES.map((side) => `app-icon-${side}.png` as const),
  "app-icon.icns",
] as const;

/** Most PNG sizes one call renders (each is a render held in memory until all are written). */
const MAX_SIZES = 16;

/** `sizes` (default SIDES) validated, deduplication refused, ascending. */
function parseSizes(v: unknown): number[] {
  const sizes = orDefault<unknown>(v, SIDES);
  if (!Array.isArray(sizes) || sizes.length === 0)
    throw new VisError(
      `app icon sizes must be a non-empty array of integers, got ${describeValue(sizes)}`,
    );
  if (sizes.length > MAX_SIZES)
    throw new VisError(
      `app icon sizes must have at most ${MAX_SIZES} entries, got ${sizes.length}`,
    );
  const list = Array.from({ length: sizes.length }, (_, i) =>
    integerIn(`app icon sizes[${i}]`, sizes[i] as unknown, 16, 1024),
  ).sort((a, b) => a - b);
  const repeat = list.find((n, i) => n === list[i - 1]);
  if (repeat !== undefined)
    throw new VisError(`app icon sizes repeats ${repeat}`);
  return list;
}

/**
 * The .icns is the macOS app icon, so only the macos look makes one (a store,
 * maskable or round icon is not a dock icon), and only when the PNG set holds
 * every size it is made of; other sizes are extra PNGs.
 */
const hasIcns = (preset: AppIconPreset, sizes: readonly number[]): boolean =>
  preset === "macos" && SIDES.every((side) => sizes.includes(side));

/**
 * The files `appIcon` writes for `opts`, in order: `app-icon.svg`, one
 * `app-icon-<n>.png` per size ascending and, only for the `macos` preset (the
 * default) with sizes that include all of 16, 32, 64, 128, 256, 512 and 1024,
 * `app-icon.icns`. Throws a VisError for invalid sizes or preset.
 * `APP_ICON_FILES` is the default call.
 */
export function appIconFiles(
  opts: { sizes?: readonly number[]; preset?: AppIconPreset } = {},
): string[] {
  const sizes = parseSizes(opts.sizes);
  return [
    "app-icon.svg",
    ...sizes.map((size) => `app-icon-${size}.png`),
    ...(hasIcns(parsePreset(opts.preset), sizes) ? ["app-icon.icns"] : []),
  ];
}

/**
 * Writes the app icon into `outDir`: the SVG master (`app-icon.svg`, 1024
 * units), its PNGs (`app-icon-<n>.png`, default 16, 32, 64, 128, 256, 512 and
 * 1024 px) and, when the sizes include all of those seven, `app-icon.icns`
 * built from them. The look defaults to the macOS dock icon (a transparent
 * canvas around a squircle plate); `preset`, `shape`, `cornerRadius`,
 * `margin`, `markScale`, `flat` and `opaque` are `appIconSvg`'s. Returns the
 * absolute paths in `appIconFiles` order. Every image is rendered before
 * anything touches the disk and each file is written whole (temp file +
 * rename), as `favicons` does. Output is byte-identical for equal options.
 */
export async function appIcon(opts: AppIconOptions): Promise<string[]> {
  const input: unknown = opts;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `options must be an object, got ${describeValue(input)}`,
    );
  const { outDir, sizes: wanted, ...look } = opts;
  if ((look as { size?: unknown }).size !== undefined)
    throw new VisError(
      "appIcon does not take size: the master is 1024 units, pick the PNG sides with sizes",
    );
  const out = parseOutDir(outDir);
  const background = parseOpaque(
    "background",
    orDefault<unknown>(opts.background, BRAND.background.dark),
  );
  const color = parseOpaque(
    "color",
    orDefault<unknown>(opts.color, BRAND.mark),
  );
  const sizes = parseSizes(wanted);
  const preset = parsePreset(look.preset);
  const svg = (size?: number): string =>
    appIconSvg({
      ...look,
      ...(size === undefined ? {} : { size }),
      color,
      background,
    });
  const master = svg();
  const images = await Promise.all(
    sizes.map(async (size) => ({ size, png: await renderPng(svg(size)) })),
  );
  const icnsPngs = images
    .filter(({ size }) => (SIDES as readonly number[]).includes(size))
    .map(({ png }) => png);
  return writeIconFiles("appIcon", out, [
    ["app-icon.svg", master],
    ...images.map(({ size, png }) => [`app-icon-${size}.png`, png] as const),
    ...(hasIcns(preset, sizes)
      ? [["app-icon.icns", icnsFromPngs(icnsPngs)] as const]
      : []),
  ]);
}
