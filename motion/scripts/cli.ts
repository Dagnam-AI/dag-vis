// Argument parsing shared by the scripts: strict, so a mistyped flag stops the
// run with a message naming it instead of being ignored.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgv, type Parsed } from "../src/lib/args.ts";
import { requireVideoName } from "../src/lib/video-name.ts";

// motion/ whatever the caller's cwd is: the remotion bin and the output folders are relative to it.
export const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The local remotion bin, spawned by path (never through npx); it fails on Windows, where the bin is a .cmd. */
export const REMOTION_BIN = resolve(MOTION, "node_modules/.bin/remotion");

export interface Cli {
  /** Boolean flags that were given. */
  flags: ReadonlySet<string>;
  positionals: string[];
}

/** Exits 1 with `message` and the usage line. */
export function fail(usage: string, message: string): never {
  console.error(`${message}\nusage: ${usage}`);
  process.exit(1);
}

/** The video name, or exit 1 with the one naming rule every script shares. */
export function nameOrFail(usage: string, video: string | undefined): string {
  try {
    return requireVideoName(video);
  } catch (e) {
    return fail(usage, (e as Error).message);
  }
}

/** The library alias and the relative paths are motion/'s, so a script that uses them must be started there. */
export function requireMotionCwd(usage: string): void {
  if (resolve(process.cwd()) !== MOTION)
    fail(usage, `run from ${MOTION}, not ${process.cwd()}`);
}

/**
 * `flagNames` are the boolean flags the script accepts (without dashes); `count`,
 * when given, is the exact number of positional arguments.
 */
export function cli(usage: string, flagNames: string[], count?: number): Cli {
  let parsed: Parsed;
  try {
    parsed = parseArgv(process.argv.slice(2), {
      flags: flagNames.map((name) => `--${name}`),
    });
  } catch (e) {
    return fail(usage, (e as Error).message);
  }
  const { positionals } = parsed;
  if (count !== undefined && positionals.length !== count)
    return fail(
      usage,
      `expected ${String(count)} argument(s), got ${String(positionals.length)}`,
    );
  return {
    flags: new Set([...parsed.flags].map((flag) => flag.slice(2))),
    positionals,
  };
}
