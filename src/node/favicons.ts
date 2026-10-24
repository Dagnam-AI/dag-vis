import { LOGO_ICON_WEIGHT, logoSvg } from "../brand/logo.js";
import { BRAND } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { describeValue, orDefault } from "../core/validate.js";
import { icoFromPngs } from "./ico.js";
import { parseOpaque, parseOutDir, writeIconFiles } from "./icon-files.js";
import { renderPng } from "./render-png.js";

export interface FaviconsOptions {
  /** Directory to write into; created (with parents) if missing. Required. */
  outDir: string;
  /** Opaque backdrop of the PNG icons and the manifest colours. Default BRAND.background.dark. */
  background?: string;
  /** Logo colour. Default BRAND.mark: the deep red of every icon surface. */
  color?: string;
  /** Manifest `name`, 1..100 characters. Default "Dagnam.AI". */
  name?: string;
  /** Manifest `short_name`, 1..50 characters. Default "Dagnam". */
  shortName?: string;
}

/** The files `favicons` writes, in the order it writes them and returns their paths. */
export const FAVICON_FILES = [
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "site.webmanifest",
] as const;

const MAX_NAME_LENGTH = 100;
const MAX_SHORT_NAME_LENGTH = 50;

/**
 * A manifest label: 1..max characters (code points, not UTF-16 units), not only
 * whitespace, and no control characters or invisible format characters (bidi
 * overrides, zero-width joiners, the BOM), which could make a name read differently
 * from what it is. Any other Unicode goes through JSON.stringify.
 */
function parseLabel(name: string, v: unknown, max: number): string {
  if (typeof v !== "string")
    throw new VisError(`${name} must be a string, got ${describeValue(v)}`);
  const length = Array.from(v).length;
  if (length < 1 || length > max)
    throw new VisError(`${name} must be 1..${max} characters, got ${length}`);
  if (v.trim() === "")
    throw new VisError(`${name} must not be only whitespace`);
  if (/\p{Cc}/u.test(v))
    throw new VisError(
      `${name} must not contain control characters, got ${describeValue(v)}`,
    );
  const hidden = /\p{Cf}/u.exec(v);
  if (hidden)
    throw new VisError(
      `${name} must not contain format or bidirectional control characters, found U+${Number(hidden[0].codePointAt(0)).toString(16).toUpperCase().padStart(4, "0")}`,
    );
  return v;
}

/**
 * Writes the full icon set and web manifest into `outDir` and returns the
 * absolute paths in FAVICON_FILES order. Every image is rendered before
 * anything touches the disk; each file is then written whole (temp file +
 * rename), so an I/O failure never leaves a partial file: earlier files are the
 * new version and later ones are whatever was there before (absent in a fresh
 * directory, the previous set's version when re-running over one, so old and new
 * files can be mixed). Output is byte-identical for equal options.
 */
export async function favicons(opts: FaviconsOptions): Promise<string[]> {
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
  const name = parseLabel(
    "name",
    orDefault<unknown>(opts.name, "Dagnam.AI"),
    MAX_NAME_LENGTH,
  );
  const shortName = parseLabel(
    "shortName",
    orDefault<unknown>(opts.shortName, "Dagnam"),
    MAX_SHORT_NAME_LENGTH,
  );

  // Every surface draws the mark at LOGO_ICON_WEIGHT: the plain strands vanish at 16 px.
  const transparent = (size: number, padding: number): string =>
    logoSvg({ color, size, padding, weight: LOGO_ICON_WEIGHT });
  const opaque = (size: number, padding: number): string =>
    logoSvg({ color, size, background, padding, weight: LOGO_ICON_WEIGHT });
  const icon = (src: string, side: number, extra = {}) => ({
    src,
    sizes: `${side}x${side}`,
    type: "image/png",
    ...extra,
  });
  const files: Record<(typeof FAVICON_FILES)[number], Buffer | string> = {
    "favicon.ico": icoFromPngs([
      await renderPng(transparent(16, 0.03)),
      await renderPng(transparent(32, 0.04)),
      await renderPng(transparent(48, 0.05)),
    ]),
    "favicon.svg": transparent(256, 0.05),
    // The mark at 75% of the tile (padding 0.125), opaque: iOS fills transparency with black.
    "apple-touch-icon.png": await renderPng(opaque(180, 0.125)),
    "icon-192.png": await renderPng(opaque(192, 0.1)),
    "icon-512.png": await renderPng(opaque(512, 0.1)),
    // Padding 0.2 keeps the mark inside the maskable safe zone (the central 80% circle).
    "icon-maskable-512.png": await renderPng(opaque(512, 0.2)),
    // Root-absolute on purpose: the manifest's scope is the whole origin ("/"), and
    // an icon `src` without the slash would resolve against wherever it is served.
    "site.webmanifest": `${JSON.stringify(
      {
        name,
        short_name: shortName,
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: background,
        background_color: background,
        icons: [
          icon("/icon-192.png", 192),
          icon("/icon-512.png", 512),
          icon("/icon-maskable-512.png", 512, { purpose: "maskable" }),
        ],
      },
      null,
      2,
    )}\n`,
  };

  return writeIconFiles(
    "favicons",
    out,
    FAVICON_FILES.map((file) => [file, files[file]]),
  );
}
