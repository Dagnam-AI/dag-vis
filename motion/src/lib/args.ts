// The one argument parser every script uses (render, sheet, store, audio,
// check-render): strict, so a mistyped option stops the run with a message
// naming it. Pure: it reads no process state and exits nothing; scripts/cli.ts
// turns a thrown message into the usage line and exit 1.

/** `--x` of `--x=v`. */
const optionName = (arg: string): string => arg.replace(/=.*/s, "");

/** What each kind of mistake is called. */
export interface Wording {
  unknown: (arg: string) => string;
  /** A boolean flag given a value, `--flag=x`; `name` is the flag. */
  flagValue: (name: string, arg: string) => string;
  extra: (arg: string) => string;
}

/** The wording of Node's util.parseArgs, which audio, check-render and store printed before this parser existed. */
export const NODE_WORDING: Wording = {
  unknown: (arg) => {
    // Node names the option itself: `--x` of `--x=v`, `-x` of `-xyz`.
    const name = arg.startsWith("--") ? optionName(arg) : arg.slice(0, 2);
    return `Unknown option '${name}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "${name}"`;
  },
  flagValue: (name) => `Option '${name}' does not take an argument`,
  extra: (arg) => `unexpected extra argument ${arg}`,
};

/** The wording render and sheet printed: the argument as typed. */
export const PLAIN_WORDING: Wording = {
  unknown: (arg) => `unknown option ${arg}`,
  flagValue: (_name, arg) => `unknown option ${arg}`,
  extra: (arg) => `unexpected extra argument ${arg}`,
};

export interface ArgSpec {
  /** Boolean flags, spelled with their dashes: `--json`. */
  flags?: readonly string[];
  /** Options that take the next argument as their value, mapped to what it is called in "needs …". */
  values?: Readonly<Record<string, string>>;
  /** At most this many positionals; the first one past it is an error. Default: no limit. */
  max?: number;
  /** Default: NODE_WORDING. */
  wording?: Wording;
}

export interface Parsed {
  /** The flags given, with their dashes. */
  flags: ReadonlySet<string>;
  /** The value of each option given (the last one wins), by its dashed name. */
  values: ReadonlyMap<string, string>;
  positionals: string[];
}

/**
 * Splits `argv` (the arguments after the script name). `--` ends the options;
 * a lone `-` is a positional; an option's value is whatever follows it, even
 * if that starts with a dash. `--x=v` is not accepted for a value option.
 * Throws a message naming what is wrong.
 */
export function parseArgv(argv: readonly string[], spec: ArgSpec): Parsed {
  const flagNames = spec.flags ?? [];
  const valueNames = spec.values ?? {};
  const wording = spec.wording ?? NODE_WORDING;
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];
  const positional = (arg: string): void => {
    if (positionals.length >= (spec.max ?? Infinity))
      throw new Error(wording.extra(arg));
    positionals.push(arg);
  };
  const rest = [...argv];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    // Own keys only: `constructor` is not an option.
    const hint = Object.hasOwn(valueNames, arg) ? valueNames[arg] : undefined;
    if (arg === "--") {
      for (const after of rest.splice(0)) positional(after);
    } else if (arg === "-" || !arg.startsWith("-")) {
      positional(arg);
    } else if (hint !== undefined) {
      const value = rest.shift();
      if (value === undefined) throw new Error(`${arg} needs ${hint}`);
      values.set(arg, value);
    } else if (flagNames.includes(arg)) {
      flags.add(arg);
    } else {
      const name = optionName(arg);
      throw new Error(
        arg.startsWith("--") && arg !== name && flagNames.includes(name)
          ? wording.flagValue(name, arg)
          : wording.unknown(arg),
      );
    }
  }
  return { flags, values, positionals };
}

/** `json` as the object a script option such as `--props` carries; throws a message naming `option`. */
export function parseJsonObject(
  option: string,
  json: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(`${option} is not valid JSON`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${option} must be a JSON object`);
  return value as Record<string, unknown>;
}
