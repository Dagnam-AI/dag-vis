import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The message of anything thrown: an Error's own, else the value as a string. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Writes `data` to `path` through a temp file in the same directory and a
 * rename, so a failure never leaves a truncated file under the real name. The
 * rename replaces the target (a symlink is replaced, never written through;
 * a read-only file is replaced and the new file gets the default mode). On any
 * failure the temp file is removed and `wrap(error)` is thrown. The directory
 * must exist.
 */
export async function writeAtomic(
  path: string,
  data: Buffer | string,
  wrap: (error: unknown) => Error,
): Promise<void> {
  const temp = join(
    dirname(path),
    `.dag-vis-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temp, data, { flag: "wx" });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw wrap(error);
  }
}
