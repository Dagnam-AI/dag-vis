import { describeValue } from "../core/describe.js";
import { VisError } from "../core/errors.js";
import {
  HUE_RANGE,
  INTENSITY_RANGE,
  REGION_COUNT,
  type CoverChoices,
  type CoverInput,
} from "./cover.js";

/**
 * Strict parsers for cover inputs that come from outside the program (front matter, a
 * stored JSON spec). `coverSpec` is forgiving on purpose (it clamps a number to its
 * range); these are not: an unknown key, a wrong type or an out-of-range value is a
 * `VisError` naming the field, so a typo is caught where the data enters.
 *
 * The input is JSON-like data, and only own properties of a plain object are read.
 * Exotic objects that JSON and YAML cannot produce (a throwing getter, a revoked or
 * trapping Proxy) surface their own error, not a `VisError`; a plain object from another
 * realm is rejected as "got object".
 */

/** Longest `item`, `family` or `seed`. */
const MAX_TEXT = 200;
/**
 * Largest `count`: an ordered family (a course) is far smaller, and a bound keeps
 * `index` and `count` far from the overflow that turns the hue into `Infinity`.
 */
const MAX_COUNT = 10000;

/** How one field is checked. `accepts` is a type guard, so the table is checked against `CoverInput`. */
interface Rule<T> {
  /** What the message says was expected. */
  expected: string;
  accepts: (v: unknown) => v is T;
  /** `null` (an editor choice left unset) is accepted and kept. */
  nullable: boolean;
  required: boolean;
}

const text =
  (min: 0 | 1) =>
  (v: unknown): v is string =>
    typeof v === "string" && v.length >= min && v.length <= MAX_TEXT;
const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && v >= lo && v <= hi; // false for NaN; Infinity is out of range
const integerIn =
  (lo: number, hi: number) =>
  (v: unknown): v is number =>
    inRange(v, lo, hi) && Number.isInteger(v);
const numberIn =
  (lo: number, hi: number) =>
  (v: unknown): v is number =>
    inRange(v, lo, hi);
const oneOf = <T extends string>(...allowed: T[]): Rule<T> => ({
  expected: allowed.map((a) => `"${a}"`).join(" or "),
  accepts: (v): v is T => allowed.includes(v as T),
  nullable: false,
  required: true,
});

const NON_EMPTY = `a non-empty string of at most ${MAX_TEXT} characters`;
const REGION_MAX = REGION_COUNT - 1;

/** Every cover field, in the order they are checked (and listed in an unknown-key error). */
const RULES: { [K in keyof CoverInput]-?: Rule<NonNullable<CoverInput[K]>> } = {
  family: {
    expected: NON_EMPTY,
    accepts: text(1),
    nullable: true,
    required: false,
  },
  item: {
    expected: NON_EMPTY,
    accepts: text(1),
    nullable: false,
    required: true,
  },
  index: {
    expected: `an integer in 0..${MAX_COUNT - 1}`,
    accepts: integerIn(0, MAX_COUNT - 1),
    nullable: false,
    required: false,
  },
  count: {
    expected: `an integer in 1..${MAX_COUNT}`,
    accepts: integerIn(1, MAX_COUNT),
    nullable: false,
    required: false,
  },
  theme: oneOf("light", "dark"),
  variant: oneOf("card", "banner"),
  seed: {
    // Empty is allowed: the stored form of a cleared editor field (`coverSpec` reads it as no seed).
    expected: `a string of at most ${MAX_TEXT} characters`,
    accepts: text(0),
    nullable: true,
    required: false,
  },
  hue: {
    expected: `a number in ${HUE_RANGE[0]}..${HUE_RANGE[1]}`,
    accepts: numberIn(...HUE_RANGE),
    nullable: true,
    required: false,
  },
  region: {
    expected: `an integer in 0..${REGION_MAX}`,
    accepts: integerIn(0, REGION_MAX),
    nullable: true,
    required: false,
  },
  intensity: {
    expected: `a number in ${INTENSITY_RANGE[0]}..${INTENSITY_RANGE[1]}`,
    accepts: numberIn(...INTENSITY_RANGE),
    nullable: true,
    required: false,
  },
};

const ALL_KEYS = Object.keys(RULES) as (keyof CoverInput)[];
// `satisfies` fails to compile when a key is added to or dropped from `CoverChoices`.
const CHOICE_KEYS = Object.keys({
  family: true,
  seed: true,
  hue: true,
  region: true,
  intensity: true,
} satisfies Record<keyof CoverChoices, true>) as (keyof CoverChoices)[];

function isPlainObject(v: unknown): v is Record<PropertyKey, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks `value` against the rules of `keys` and returns a fresh object holding only the
 * keys it provided (an `undefined` value counts as absent). Throws a `VisError` on the
 * first problem: a non-plain object, an unknown key (own symbol keys and `__proto__`
 * included), then each field in turn.
 */
function parseKeys<K extends keyof CoverInput>(
  value: unknown,
  keys: readonly K[],
): Pick<CoverInput, K> {
  if (!isPlainObject(value))
    throw new VisError(
      `cover: expected a plain object, got ${Array.isArray(value) ? "array" : describeValue(value)}`,
    );
  for (const key of Reflect.ownKeys(value))
    if (!keys.includes(key as K))
      throw new VisError(
        `cover: unknown key ${describeValue(key)} (allowed: ${keys.join(", ")})`,
      );
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const rule: Rule<unknown> = RULES[key];
    // Own data only: a polluted Object.prototype is not input.
    const v = Object.hasOwn(value, key) ? value[key] : undefined;
    if (v === undefined && !rule.required) continue;
    if (!(rule.nullable && v === null) && !rule.accepts(v))
      throw new VisError(
        `cover.${key}: expected ${rule.expected}, got ${describeValue(v)}`,
      );
    out[key] = v;
  }
  // The one cast: `out` holds, per key, a value that key's `RULES` entry accepted, and
  // `RULES` is typed per key against `CoverInput`, so this is `Pick<CoverInput, K>`.
  return out as Pick<CoverInput, K>;
}

/**
 * The full cover input, validated: `item`, `theme` and `variant` are required, the rest
 * optional. Returns a new object with only the keys that were provided; never clamps and
 * never mutates `value`. `index` is below `count` (which defaults to 1, as in
 * `coverSpec`), so a family position is never silently clamped.
 * `coverSpec(parseCoverInput(x))` equals `coverSpec(x)` for any `x` it accepts, and never
 * throws.
 */
export function parseCoverInput(value: unknown): CoverInput {
  const parsed = parseKeys(value, ALL_KEYS);
  const { index, count } = parsed;
  if (index !== undefined && index >= (count ?? 1))
    throw new VisError(
      `cover.index: expected an integer in 0..${(count ?? 1) - 1} (below count${count === undefined ? ", which defaults to 1" : ""}), got ${index}`,
    );
  return parsed;
}

/**
 * The editor's choices alone (`family`, `seed`, `hue`, `region`, `intensity`), validated
 * like `parseCoverInput` and just as strict: `item`, `theme`, `variant`, `index` and
 * `count` are unknown keys here. Join the result with the rest at the call site:
 * `coverSpec({ ...parseCoverChoices(x), item, theme, variant })`.
 */
export function parseCoverChoices(value: unknown): CoverChoices {
  return parseKeys(value, CHOICE_KEYS);
}
