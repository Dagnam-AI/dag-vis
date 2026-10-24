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
import { MAX_CLIP_MASKS, checkMarkup } from "./markup-guard.js";
import { messageOf } from "./util.js";

/**
 * The bundled faces, resolved beside this module in src/ and dist/, Inter first:
 * Inter (SIL OFL 1.1, ./fonts/OFL.txt), Unbounded 400, 500 and 700 (static
 * instances, SIL OFL 1.1, ./fonts/OFL-Unbounded.txt, provenance in
 * ./fonts/UNBOUNDED-SOURCE.txt) and Moonhouse (NimaVisual, bundled unmodified
 * at the package owner's instruction, terms in ./fonts/moonhouse/LICENSE-NOTE.txt).
 * The Unbounded and Moonhouse faces are what `ogCard` is set in: Unbounded 400
 * is the text of both layouts, Moonhouse the brand card's wordmark and the
 * social layout's title. To drop Moonhouse, delete its entry here and the
 * ./fonts/moonhouse directory (and both layouts lose their display face).
 */
export const FONT_FILES: readonly string[] = [
  "Inter-Regular.ttf",
  "Inter-Bold.ttf",
  "Unbounded-Regular.ttf",
  "Unbounded-Medium.ttf",
  "Unbounded-Bold.ttf",
  "moonhouse/moonhouse.ttf",
].map((name) => fileURLToPath(new URL(`./fonts/${name}`, import.meta.url)));

/** Longest SVG text (UTF-16 units) `renderPng` accepts. */
export const MAX_SVG_LENGTH = 5_000_000;
/** Most pixels (width x height) one PNG may have: 64 MP is about 256 MB of RGBA. */
export const MAX_OUTPUT_PIXELS = 64_000_000;
export { MAX_CLIP_MASKS };
/** Most entries in `fontFiles`. */
export const MAX_FONT_FILES = 16;

export interface RenderPngOptions {
  /** Output width in px, an integer 1..16384; height follows the SVG's aspect. Default: the SVG's own size. */
  width?: number;
  /** Background colour, any CSS colour the package parses (alpha allowed). Default: transparent. */
  background?: string;
  /**
   * Extra fonts, absolute paths to existing .ttf/.otf files, appended to the
   * bundled fonts (`FONT_FILES`). The default is the bundled fonts only, so PNGs
   * are identical on every machine. Inter has no CJK or emoji glyphs (they draw as missing-glyph
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
    // Read the export inside the try: a module that half-loads fails here too.
    const { Resvg } = await import("@resvg/resvg-js");
    return { Resvg };
  } catch (error) {
    if (isMissingResvg(error))
      throw new VisError(
        "renderPng needs @resvg/resvg-js: run `npm i -D @resvg/resvg-js`",
      );
    // Installed but broken (no native binary for this platform, a failed dlopen,
    // ...): installing it again would not help, so say what actually happened.
    const wrapped = new VisError(
      `@resvg/resvg-js could not be loaded: ${messageOf(error)}`,
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

/**
 * Node reports an absent package as ERR_MODULE_NOT_FOUND (import) or
 * MODULE_NOT_FOUND (require) naming the package in quotes. The platform binary
 * resvg-js loads (`@resvg/resvg-js-darwin-arm64`, ...) fails with the same
 * code but a different quoted name, and that one is a broken install.
 */
function isMissingResvg(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ERR_MODULE_NOT_FOUND" ||
      error.code === "MODULE_NOT_FOUND") &&
    /['"]@resvg\/resvg-js['"]/.test(messageOf(error))
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

/**
 * Rasterise an SVG string to a PNG with the bundled fonts (plus any
 * `fontFiles`) and no system fonts, so output is identical on every machine.
 *
 * The intent is that only SVG produced by this package's own generators, from
 * validated options, reaches this function. It is defence in depth, NOT a
 * sandbox for arbitrary untrusted SVG:
 *
 * - It refuses things a reader of the PNG could be hurt by and the generators
 *   do not emit: file reads through `href` (see `markup-guard.ts`), DTD entity
 *   declarations, SVG text over `MAX_SVG_LENGTH`, more than `MAX_CLIP_MASKS`
 *   `<clipPath>`/`<mask>` elements, and a canvas over 16384 px a side or
 *   `MAX_OUTPUT_PIXELS` (checked before rendering, because resvg aborts the
 *   process on a huge canvas).
 * - The generators DO emit `<clipPath>` (`fluted`, one per reed) and
 *   `<image href>` (`gradient({ overlay: { image } })`). An overlay image must
 *   therefore be a RASTER `data:` URI with a comma (`data:image/png`, `jpeg`,
 *   `gif` or `webp`) to render to PNG; a URL, a path or a `data:` URI of any
 *   other type (including `image/svg+xml`) is rejected here (it is fine in the
 *   CSS output).
 * - The href check is a single linear pass over the text, not an XML parser,
 *   and it refuses markup it cannot classify. It is meant to err towards
 *   rejecting, but it can in principle disagree with resvg's parser. An
 *   independent differential fuzz of about 139,000 documents against bare
 *   resvg found it accepting file reads (a quote opened in a comment hiding a
 *   real tag, and an SVG nested in a `data:` URL), a `data:` URL that aborted
 *   the process, and a quadratic scan; all were fixed and the fuzz re-run. That
 *   is evidence, not proof: this is a layer of defence, not a sandbox.
 * - It cannot stop resvg from crashing or exhausting memory on other input
 *   inside those limits. Cases seen on one machine (resvg-js 2.6.2, macOS
 *   arm64; other platforms not checked): a chain of 20,000 clip-path-referencing
 *   clipPaths or masks crashed the process (10,000 rendered); a huge
 *   `patternTransform` scale (a 268-character SVG needed over 6 GB); raster
 *   bombs inside `data:` PNGs (a few hundred bytes declaring 100000 x 100000
 *   px); expensive filters (`feTurbulence` with a huge `numOctaves`, long blur
 *   chains) and a very long `<text>` ran for tens of seconds.
 * - The call is async but the rendering is synchronous native work on the
 *   calling thread: it blocks the event loop until it returns, and a crash
 *   takes the whole process down.
 *
 * To render SVG you did not generate, do it in a separate process with memory
 * and CPU-time limits (a child process, container or worker with a resource
 * ceiling), and treat its failure as normal.
 */
export async function renderPng(
  svg: string,
  opts: RenderPngOptions = {},
): Promise<Buffer> {
  return rasterise(svg, opts, (image) => image.asPng());
}

/** What resvg's `render()` returns: the pixels, their size, and the PNG encoder. */
type Rendered = ReturnType<Resvg["render"]>;

/** Validate, parse and render `svg` (the checks and limits `renderPng` documents), then hand the image to `finish`. */
async function rasterise<T>(
  svg: string,
  opts: RenderPngOptions,
  finish: (image: Rendered) => T,
): Promise<T> {
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
  checkMarkup(markup);

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
    throw new VisError(`SVG could not be parsed: ${messageOf(error)}`);
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
    return finish(resvg.render());
  } catch (error) {
    throw new VisError(`SVG could not be rendered: ${messageOf(error)}`);
  }
}

/** A raster as raw bytes: `data` is `width * height * 4` bytes of RGBA, row 0 on top, STRAIGHT (not premultiplied) alpha. */
export interface RgbaImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * The same render as `renderPng` (same checks, limits, fonts and `background`),
 * as raw RGBA bytes: the frame source for ffmpeg and GIF. resvg hands back
 * premultiplied pixels; they are converted to straight alpha here, because
 * that is what ffmpeg's `rgba` input and the PNG format mean. Where the pixel
 * is not fully opaque the conversion rounds, so a colour under a low alpha is
 * only as exact as 8 bits allow; a `background` makes every pixel opaque and
 * the conversion exact.
 */
export async function renderRgba(
  svg: string,
  opts: RenderPngOptions = {},
): Promise<RgbaImage> {
  return rasterise(svg, opts, (image) => {
    const data = new Uint8Array(image.pixels);
    for (let i = 0; i < data.length; i += 4) {
      const alpha = Number(data[i + 3]);
      if (alpha === 255) continue;
      for (let c = i; c < i + 3; c++)
        data[c] =
          alpha === 0
            ? 0
            : Math.min(255, Math.round((Number(data[c]) * 255) / alpha));
    }
    return { data, width: image.width, height: image.height };
  });
}
