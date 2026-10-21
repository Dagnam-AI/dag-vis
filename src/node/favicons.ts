import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { logoSvg } from "../brand/logo.js";
import { BRAND } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { describeValue, orDefault, parsePaint } from "../core/validate.js";
import { icoFromPngs } from "./ico.js";
import { renderPng } from "./render-png.js";

export interface FaviconsOptions {
  /** Directory to write into; created (with parents) if missing. Required. */
  outDir: string;
  /** Opaque backdrop of the PNG icons and the manifest colours. Default BRAND.background.dark. */
  background?: string;
  /** Logo colour. Default BRAND.red (visible on light and dark tabs). */
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

const MAX_PATH_LENGTH = 4096;
const MAX_NAME_LENGTH = 100;
const MAX_SHORT_NAME_LENGTH = 50;

function parseOutDir(v: unknown): string {
  if (typeof v !== "string" || v.trim() === "")
    throw new VisError(
      `outDir must be a non-empty directory path, got ${describeValue(v)}`,
    );
  if (v.includes("\0"))
    throw new VisError("outDir must not contain a NUL byte");
  if (v.length > MAX_PATH_LENGTH)
    throw new VisError(
      `outDir must be at most ${MAX_PATH_LENGTH} characters, got ${v.length}`,
    );
  return resolve(v);
}

/** A colour that is opaque (an icon backdrop or a logo fill with alpha would not be), as lowercase #rrggbb. */
function parseOpaque(name: string, v: unknown): string {
  const paint = parsePaint(name, v);
  if (paint.alpha !== 1)
    throw new VisError(
      `${name} must be opaque, got ${describeValue(v)} (alpha ${paint.alpha})`,
    );
  return paint.hex;
}

/** A manifest label: 1..max characters, no control characters. Any other Unicode goes through JSON.stringify. */
function parseLabel(name: string, v: unknown, max: number): string {
  if (typeof v !== "string")
    throw new VisError(`${name} must be a string, got ${describeValue(v)}`);
  if (v.length < 1 || v.length > max)
    throw new VisError(`${name} must be 1..${max} characters, got ${v.length}`);
  if (/\p{Cc}/u.test(v))
    throw new VisError(
      `${name} must not contain control characters, got ${describeValue(v)}`,
    );
  return v;
}

function failure(action: string, error: unknown): VisError {
  const wrapped = new VisError(
    `favicons could not ${action}: ${error instanceof Error ? error.message : String(error)}`,
  );
  wrapped.cause = error;
  return wrapped;
}

/**
 * Writes `data` to `dir/name` through a temp file in the same directory and a
 * rename, so a failure never leaves a half-written icon under its real name.
 * The rename replaces whatever is at the target (a symlink is replaced, never
 * written through). `name` is always a FAVICON_FILES constant.
 */
async function writeAtomic(
  dir: string,
  name: string,
  data: Buffer | string,
): Promise<string> {
  const path = join(dir, name);
  const temp = join(dir, `.${name}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temp, data, { flag: "wx" });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw failure(`write ${name}`, error);
  }
  return path;
}

/**
 * Writes the full icon set and web manifest into `outDir` and returns the
 * absolute paths in FAVICON_FILES order. Every image is rendered before
 * anything touches the disk; each file is then written whole (temp file +
 * rename), so an I/O failure leaves earlier files complete and later ones
 * absent, never a partial one. Output is byte-identical for equal options.
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
  const color = parseOpaque("color", orDefault<unknown>(opts.color, BRAND.red));
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

  const transparent = (size: number): string =>
    logoSvg({ color, size, padding: 0.06 });
  const opaque = (size: number, padding: number): string =>
    logoSvg({ color, size, background, padding });
  const files: Record<(typeof FAVICON_FILES)[number], Buffer | string> = {
    "favicon.ico": icoFromPngs([
      await renderPng(transparent(16)),
      await renderPng(transparent(32)),
      await renderPng(transparent(48)),
    ]),
    "favicon.svg": transparent(256),
    // The logo at 75% of the tile (padding 0.125), opaque: iOS fills transparency with black.
    "apple-touch-icon.png": await renderPng(opaque(180, 0.125)),
    "icon-192.png": await renderPng(opaque(192, 0.1)),
    "icon-512.png": await renderPng(opaque(512, 0.1)),
    // Padding 0.2 keeps the mark inside the maskable safe zone (the central 80% circle).
    "icon-maskable-512.png": await renderPng(opaque(512, 0.2)),
    "site.webmanifest": `${JSON.stringify(
      {
        name,
        short_name: shortName,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        theme_color: background,
        background_color: background,
        display: "standalone",
      },
      null,
      2,
    )}\n`,
  };

  try {
    await mkdir(out, { recursive: true });
  } catch (error) {
    throw failure(`create outDir (${out})`, error);
  }
  const written: string[] = [];
  for (const file of FAVICON_FILES)
    written.push(await writeAtomic(out, file, files[file]));
  return written;
}
