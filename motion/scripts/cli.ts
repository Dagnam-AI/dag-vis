// Argument parsing shared by the scripts: strict, so a mistyped flag stops the
// run with a message naming it instead of being ignored.
import { parseArgs } from "node:util";

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

/** `flagNames` are the boolean flags the script accepts; `count` is the exact number of positional arguments. */
export function cli(usage: string, flagNames: string[], count: number): Cli {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: Object.fromEntries(
        flagNames.map((name) => [name, { type: "boolean" }] as const),
      ),
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    return fail(usage, (e as Error).message);
  }
  const positionals = parsed.positionals;
  if (positionals.length !== count)
    return fail(
      usage,
      `expected ${String(count)} argument(s), got ${String(positionals.length)}`,
    );
  return {
    flags: new Set(
      Object.keys(parsed.values).filter((k) => parsed.values[k] === true),
    ),
    positionals,
  };
}
