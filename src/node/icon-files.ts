import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { VisError } from "../core/errors.js";
import { describeValue, parsePaint } from "../core/validate.js";
import { messageOf, writeAtomic } from "./util.js";

const MAX_PATH_LENGTH = 4096;

/** The absolute directory for `outDir`: a non-empty string without NUL, at most 4096 characters. */
export function parseOutDir(v: unknown): string {
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
export function parseOpaque(name: string, v: unknown): string {
  const paint = parsePaint(name, v);
  if (paint.alpha !== 1)
    throw new VisError(
      `${name} must be opaque, got ${describeValue(v)} (alpha ${paint.alpha})`,
    );
  return paint.hex;
}

function failure(label: string, action: string, error: unknown): VisError {
  const wrapped = new VisError(
    `${label} could not ${action}: ${messageOf(error)}`,
  );
  wrapped.cause = error;
  return wrapped;
}

/**
 * Creates `out` (with parents) and writes `files` (name, bytes) into it in the
 * order given, each whole (temp file + rename, see `writeAtomic`), returning
 * the absolute paths in that order. Errors are VisErrors that name `label` (the
 * public function), the file or the directory, and keep the cause.
 */
export async function writeIconFiles(
  label: string,
  out: string,
  files: readonly (readonly [string, Buffer | string])[],
): Promise<string[]> {
  try {
    await mkdir(out, { recursive: true });
  } catch (error) {
    throw failure(label, `create outDir (${out})`, error);
  }
  const written: string[] = [];
  for (const [file, data] of files) {
    const path = join(out, file);
    await writeAtomic(path, data, (error) =>
      failure(label, `write ${file}`, error),
    );
    written.push(path);
  }
  return written;
}
