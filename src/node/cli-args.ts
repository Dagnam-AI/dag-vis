import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";

/**
 * Parses `--name value` / `--name=value` pairs. argv is user input, so every
 * deviation is an error naming the offender: a positional argument, an option
 * outside `allowed`, a repeated option, or a missing value (the end of argv, or
 * a following `--...`; write `--title=--x` for a value that starts with `--`).
 * Values are strings, kept as given; callers parse them (see `parseNumber`).
 */
export function parseOptions(
  args: readonly string[],
  allowed: readonly string[],
): Map<string, string> {
  const values = new Map<string, string>();
  const rest = [...args];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (!arg.startsWith("--"))
      throw new VisError(`unexpected argument: ${describeValue(arg)}`);
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!allowed.includes(name))
      throw new VisError(`unknown option: ${describeValue(`--${name}`)}`);
    if (values.has(name)) throw new VisError(`duplicate option: --${name}`);
    const value = eq === -1 ? rest.shift() : arg.slice(eq + 1);
    if (value === undefined || (eq === -1 && value.startsWith("--")))
      throw new VisError(`missing value for --${name}`);
    values.set(name, value);
  }
  return values;
}

/**
 * Whether the user asked for help: `--help` or `-h` anywhere among the arguments,
 * except as the value of an option before it (`--title -h` sets a title). A
 * `--help` right after an option name still counts, since the parser would call
 * that a missing value.
 */
export function wantsHelp(args: readonly string[]): boolean {
  let isValue = false;
  for (const arg of args) {
    if (isValue) {
      isValue = false;
      if (!arg.startsWith("--")) continue;
    }
    if (arg === "--help" || arg === "-h") return true;
    isValue = arg.startsWith("--") && !arg.includes("=");
  }
  return false;
}

const DECIMAL = /^\d+(?:\.\d+)?$/;

/**
 * A plain decimal (`600`, `0.5`) and nothing else: no sign, exponent, hex,
 * spaces or trailing junk (`Number()` alone would take `1e3`, `0x10`, ` 5 `
 * and `""`). Range checks belong to the generators, which name the parameter.
 */
export function parseNumber(name: string, raw: string): number {
  const n = DECIMAL.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n))
    throw new VisError(
      `--${name} must be a plain decimal number such as 600 or 0.5, got ${describeValue(raw)}`,
    );
  return n;
}

/** `x,y` as two plain decimals; their 0..1 range is checked by brandBackground. */
export function parseFocus(raw: string): [number, number] {
  const parts = raw.split(",");
  const [x, y] = parts;
  if (
    parts.length !== 2 ||
    x === undefined ||
    y === undefined ||
    !DECIMAL.test(x) ||
    !DECIMAL.test(y)
  )
    throw new VisError(
      `--focus must be x,y as plain decimals in 0..1 (for example 0.8,0.5), got ${describeValue(raw)}`,
    );
  return [Number(x), Number(y)];
}

/**
 * `object` without its undefined values. `exactOptionalPropertyTypes` rejects
 * `{ subtitle: undefined }` for an optional `subtitle`, so options that may be
 * absent go through here before they reach a generator.
 */
export function defined<T extends Record<string, unknown>>(
  object: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(object).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/** One line, whatever the message held (CLI errors are exactly one line). */
export function oneLine(message: string): string {
  return message.replace(/\s*[\r\n]+\s*/g, " ").trim();
}
