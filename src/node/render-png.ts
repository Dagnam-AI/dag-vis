import { statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import type { Resvg } from "@resvg/resvg-js";

import { parseColor, toHex, withAlpha } from "../core/color.js";
import { VisError } from "../core/errors.js";
import {
  MAX_DIMENSION,
  describeValue,
  integerIn,
  orDefault,
  parsePaint,
} from "../core/validate.js";

/** The bundled Inter faces (SIL OFL 1.1, see ./fonts/OFL.txt), resolved beside this module in src/ and dist/. */
export const FONT_FILES: readonly string[] = [
  "Inter-Regular.ttf",
  "Inter-Bold.ttf",
].map((name) => fileURLToPath(new URL(`./fonts/${name}`, import.meta.url)));

/** Longest SVG text (UTF-16 units) `renderPng` accepts. */
export const MAX_SVG_LENGTH = 5_000_000;
/** Most pixels (width x height) one PNG may have: 64 MP is about 256 MB of RGBA. */
export const MAX_OUTPUT_PIXELS = 64_000_000;
/** Most entries in `fontFiles`. */
export const MAX_FONT_FILES = 16;

export interface RenderPngOptions {
  /** Output width in px, an integer 1..16384; height follows the SVG's aspect. Default: the SVG's own size. */
  width?: number;
  /** Background colour, any CSS colour the package parses (alpha allowed). Default: transparent. */
  background?: string;
  /**
   * Extra fonts, absolute paths to existing .ttf/.otf files, appended to the
   * bundled Inter. The default is Inter only, so PNGs are identical on every
   * machine. Inter has no CJK or emoji glyphs (they draw as missing-glyph
   * boxes): to render those, pass a font that has them here and name its
   * family in the SVG's `font-family`.
   */
  fontFiles?: readonly string[];
}

interface ResvgModule {
  Resvg: typeof Resvg;
}

// Lazy on purpose, not hoisted: @resvg/resvg-js is an OPTIONAL peer that ships a
// native binary. A static import would make `@dagnam/vis/node` fail to load at
// all on a machine without it; loading it here fails only when a PNG is
// actually requested, with a message that says what to install. The module
// system caches the module, so later calls reuse it.
async function loadResvg(): Promise<ResvgModule> {
  try {
    return await import("@resvg/resvg-js");
  } catch {
    throw new VisError(
      "renderPng needs @resvg/resvg-js: run `npm i -D @resvg/resvg-js`",
    );
  }
}

/**
 * An `href` / `xlink:href` (any prefix) whose value does not start with `#` or
 * `data:`. resvg reads local files (absolute and relative paths) named by
 * `<image>`, `<feImage>` and the like and would draw them into the PNG, so an
 * SVG the caller did not write must not get to name one. Allowlist, not
 * denylist: only `#fragment` (an element in the same document) and `data:`
 * pass; anything else, including a value that hides a slash behind an XML
 * character reference, is found. A match inside a comment or text node is
 * rejected too; that is the cheap side to err on.
 */
const EXTERNAL_HREF = /href\s*=\s*["'](?!#|data:)/;

function rejectExternalReferences(svg: string): void {
  const found = EXTERNAL_HREF.exec(svg);
  if (found !== null)
    throw new VisError(
      `svg has an external reference (${describeValue(svg.slice(found.index, found.index + 60))}): only #fragment and data: URIs are rendered`,
    );
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function parseFontFiles(v: unknown): string[] {
  const list = orDefault<unknown>(v, []);
  if (!Array.isArray(list))
    throw new VisError(
      `fontFiles must be an array of absolute .ttf or .otf paths, got ${describeValue(list)}`,
    );
  if (list.length > MAX_FONT_FILES)
    throw new VisError(
      `fontFiles must have at most ${MAX_FONT_FILES} entries, got ${list.length}`,
    );
  return list.map((path: unknown, i) => {
    const name = `fontFiles[${i}]`;
    if (
      typeof path !== "string" ||
      !isAbsolute(path) ||
      path.includes("\0") ||
      !/\.(?:ttf|otf)$/i.test(path)
    )
      throw new VisError(
        `${name} must be an absolute path to a .ttf or .otf file, got ${describeValue(path)}`,
      );
    if (!isFile(path))
      throw new VisError(
        `${name} must be an existing file, got ${describeValue(path)}`,
      );
    return path;
  });
}

function stringError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rasterise an SVG string to a PNG with the bundled Inter (plus any
 * `fontFiles`) and no system fonts, so output is identical on every machine.
 *
 * Safe on an SVG the caller did not write: `svg` is capped at
 * `MAX_SVG_LENGTH`; references other than `#fragment` and `data:` are
 * rejected (resvg would read local files); the output is capped at 16384 px a
 * side and `MAX_OUTPUT_PIXELS` before anything is allocated (resvg aborts the
 * whole process on a huge canvas). It does not bound CPU time: a hostile
 * filter can still be slow.
 */
export async function renderPng(
  svg: string,
  opts: RenderPngOptions = {},
): Promise<Buffer> {
  const input: unknown = opts;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `options must be an object, got ${describeValue(input)}`,
    );
  const markup: unknown = svg;
  if (typeof markup !== "string")
    throw new VisError(`svg must be a string, got ${describeValue(markup)}`);
  if (markup.length > MAX_SVG_LENGTH)
    throw new VisError(
      `svg must be at most ${MAX_SVG_LENGTH} characters, got ${markup.length}`,
    );
  const width =
    opts.width === undefined
      ? undefined
      : integerIn("width", opts.width, 1, MAX_DIMENSION);
  const paint =
    opts.background === undefined
      ? undefined
      : parsePaint("background", opts.background);
  const fontFiles = parseFontFiles(opts.fontFiles);
  rejectExternalReferences(markup);

  const { Resvg } = await loadResvg();
  let resvg: Resvg;
  try {
    resvg = new Resvg(markup, {
      fitTo:
        width === undefined
          ? { mode: "original" }
          : { mode: "width", value: width },
      ...(paint === undefined
        ? {}
        : { background: toHex(withAlpha(parseColor(paint.hex), paint.alpha)) }),
      font: {
        loadSystemFonts: false,
        fontFiles: [...FONT_FILES, ...fontFiles],
        defaultFontFamily: "Inter",
      },
    });
  } catch (error) {
    throw new VisError(`SVG could not be parsed: ${stringError(error)}`);
  }

  // Parsing is safe at any size; rendering is not, so check the canvas first.
  // Rounded up: an upper bound of what resvg allocates.
  const outWidth = width ?? Math.ceil(resvg.width);
  const outHeight = Math.ceil(
    width === undefined ? resvg.height : (resvg.height * width) / resvg.width,
  );
  // Written as a negated conjunction so a NaN size (0 / 0) is rejected too.
  if (!(
    outWidth <= MAX_DIMENSION &&
    outHeight <= MAX_DIMENSION &&
    outWidth * outHeight <= MAX_OUTPUT_PIXELS
  ))
    throw new VisError(
      `SVG output would be ${outWidth}x${outHeight} px, too large: each side at most ${MAX_DIMENSION} and at most ${MAX_OUTPUT_PIXELS} pixels in total`,
    );

  try {
    return resvg.render().asPng();
  } catch (error) {
    throw new VisError(`SVG could not be rendered: ${stringError(error)}`);
  }
}
