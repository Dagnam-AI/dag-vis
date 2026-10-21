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
import { messageOf } from "./util.js";

/** The bundled Inter faces (SIL OFL 1.1, see ./fonts/OFL.txt), resolved beside this module in src/ and dist/. */
export const FONT_FILES: readonly string[] = [
  "Inter-Regular.ttf",
  "Inter-Bold.ttf",
].map((name) => fileURLToPath(new URL(`./fonts/${name}`, import.meta.url)));

/** Longest SVG text (UTF-16 units) `renderPng` accepts. */
export const MAX_SVG_LENGTH = 5_000_000;
/** Most pixels (width x height) one PNG may have: 64 MP is about 256 MB of RGBA. */
export const MAX_OUTPUT_PIXELS = 64_000_000;
/**
 * Most `<clipPath>` plus `<mask>` elements. A coarse guard against the one
 * crash seen: a CHAIN of 20,000 clip-path-referencing clipPaths segfaulted
 * resvg 2.6.2 on one machine (10,000 rendered; other platforms not checked).
 * It counts elements, not depth. The generators emit clipPaths only for
 * `fluted`, one per reed (256 at most, siblings, nesting bounded by fluted's
 * own cost cap), and `layers` adds them up, so more than 19 fluted-256 layers
 * (5000 / 256) reaches this cap.
 */
export const MAX_CLIP_MASKS = 5000;
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

// resvg draws files it is told about. For `<image>` and `<feImage>` an href
// that is not a valid data URL (needs a comma) is a PATH relative to the
// process's working directory, and neither element ever resolves `#id`, so
// `#x.png`, `data:x.png` and a directory called `#` all read files. So the
// rule is element-aware and deny-by-default, applied to the raw text:
//   - <image>, <feImage> (any namespace prefix): href / xlink:href must be
//     `data:` + anything but a comma + `,`. Nothing else.
//   - every other element: href / xlink:href must be `#` + an NCName without
//     `.`, `/` or `:`, so it can never read as a path.
// Elements are found by a quote-aware scan of the start tags (not parsed XML)
// and tags inside comments or CDATA are checked as if live, which only errs on
// the rejecting side. DTD entities could expand into markup this scan never
// sees, so they are refused outright (no generator emits one).
const START_TAG = /<([^\s/>!?<]+)((?:[^<>"']|"[^"]*"|'[^']*')*)/g;
const ATTRIBUTE = /([^\s=/>"']+)\s*=\s*("[^"]*"|'[^']*')/g;
const HREF_NAME = /(?:^|:)href$/i;
const DATA_URI = /^data:[^,]*,/;
const FRAGMENT = /^#[A-Za-z_][A-Za-z0-9_-]*$/;
const FILE_READERS = new Set(["image", "feimage"]);
const CLIP_OR_MASK = new Set(["clippath", "mask"]);

// `replace` with a callback is the one regex loop whose groups are typed as
// strings, so no unreachable `undefined` branch; the callbacks only inspect.
function checkMarkup(svg: string): void {
  if (svg.includes("<!ENTITY"))
    throw new VisError(
      "svg must not contain DTD entity declarations (<!ENTITY ...>)",
    );
  let clipMasks = 0;
  svg.replace(START_TAG, (tag: string, name: string, attrs: string) => {
    const element = name.slice(name.lastIndexOf(":") + 1).toLowerCase();
    if (CLIP_OR_MASK.has(element)) clipMasks++;
    attrs.replace(ATTRIBUTE, (attr: string, key: string, quoted: string) => {
      if (!HREF_NAME.test(key)) return attr;
      const value = quoted.slice(1, -1);
      const allowed = FILE_READERS.has(element)
        ? DATA_URI.test(value)
        : FRAGMENT.test(value);
      if (!allowed)
        throw new VisError(
          `svg has an external reference (${describeValue(`<${name} ${key}=${quoted}`)}): <image> and <feImage> may only use data: URIs with a comma, every other element only #id references`,
        );
      return attr;
    });
    return tag;
  });
  if (clipMasks > MAX_CLIP_MASKS)
    throw new VisError(
      `svg must have at most ${MAX_CLIP_MASKS} <clipPath> and <mask> elements, got ${clipMasks}`,
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
 * Rasterise an SVG string to a PNG with the bundled Inter (plus any
 * `fontFiles`) and no system fonts, so output is identical on every machine.
 *
 * The intent is that only SVG produced by this package's own generators, from
 * validated options, reaches this function. It is defence in depth, NOT a
 * sandbox for arbitrary untrusted SVG:
 *
 * - It refuses things a reader of the PNG could be hurt by and the generators
 *   do not emit: file reads through `href` (see `checkMarkup`), DTD entity
 *   declarations, SVG text over `MAX_SVG_LENGTH`, more than `MAX_CLIP_MASKS`
 *   `<clipPath>`/`<mask>` elements, and a canvas over 16384 px a side or
 *   `MAX_OUTPUT_PIXELS` (checked before rendering, because resvg aborts the
 *   process on a huge canvas).
 * - The generators DO emit `<clipPath>` (`fluted`, one per reed) and
 *   `<image href>` (`gradient({ overlay: { image } })`). An overlay image must
 *   therefore be a `data:` URI with a comma to render to PNG; a URL or path is
 *   rejected here (it is fine in the CSS output).
 * - The href check is a text scan of the start tags, not an XML parser. It can
 *   only err towards rejecting, but it can in principle disagree with resvg's
 *   parser: it is a layer of defence, not a proof.
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
    return resvg.render().asPng();
  } catch (error) {
    throw new VisError(`SVG could not be rendered: ${messageOf(error)}`);
  }
}
