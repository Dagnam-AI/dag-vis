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
 */

/** Longest `item`, `family` or `seed`. */
const MAX_TEXT = 200;

interface Rule {
  /** What the message says was expected. */
  expected: string;
  accepts: (v: unknown) => boolean;
  /** `null` (an editor choice left unset) is accepted and kept. */
  nullable: boolean;
  required: boolean;
}

const isText = (v: unknown, min: 0 | 1): boolean =>
  typeof v === "string" && v.length >= min && v.length <= MAX_TEXT;
const inRange = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === "number" && v >= lo && v <= hi; // false for NaN; Infinity is out of range
const isInteger = (v: unknown, lo: number, hi: number): boolean =>
  inRange(v, lo, hi) && Number.isInteger(v);
const oneOf = (...allowed: string[]) => ({
  expected: allowed.map((a) => `"${a}"`).join(" or "),
  accepts: (v: unknown) => allowed.includes(v as string),
  nullable: false,
  required: true,
});

const NON_EMPTY = `a non-empty string of at most ${MAX_TEXT} characters`;
const REGION_MAX = REGION_COUNT - 1;

/** Every cover field in the order the messages are checked; the choices come last. */
const RULES: Record<keyof CoverInput, Rule> = {
  family: {
    expected: NON_EMPTY,
    accepts: (v) => isText(v, 1),
    nullable: true,
    required: false,
  },
  item: {
    expected: NON_EMPTY,
    accepts: (v) => isText(v, 1),
    nullable: false,
    required: true,
  },
  index: {
    expected: "an integer >= 0",
    accepts: (v) => isInteger(v, 0, Infinity),
    nullable: false,
    required: false,
  },
  count: {
    expected: "an integer >= 1",
    accepts: (v) => isInteger(v, 1, Infinity),
    nullable: false,
    required: false,
  },
  theme: oneOf("light", "dark"),
  variant: oneOf("card", "banner"),
  seed: {
    // Empty is allowed: the stored form of a cleared editor field (`coverSpec` reads it as no seed).
    expected: `a string of at most ${MAX_TEXT} characters`,
    accepts: (v) => isText(v, 0),
    nullable: true,
    required: false,
  },
  hue: {
    expected: `a number in ${HUE_RANGE[0]}..${HUE_RANGE[1]}`,
    accepts: (v) => inRange(v, ...HUE_RANGE),
    nullable: true,
    required: false,
  },
  region: {
    expected: `an integer in 0..${REGION_MAX}`,
    accepts: (v) => isInteger(v, 0, REGION_MAX),
    nullable: true,
    required: false,
  },
  intensity: {
    expected: `a number in ${INTENSITY_RANGE[0]}..${INTENSITY_RANGE[1]}`,
    accepts: (v) => inRange(v, ...INTENSITY_RANGE),
    nullable: true,
    required: false,
  },
};

const ALL_KEYS = Object.keys(RULES) as (keyof CoverInput)[];
const CHOICE_KEYS = ["family", "seed", "hue", "region", "intensity"] as const;

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
function parseKeys(
  value: unknown,
  keys: readonly (keyof CoverInput)[],
): Record<string, unknown> {
  if (!isPlainObject(value))
    throw new VisError(
      `cover: expected a plain object, got ${Array.isArray(value) ? "array" : describeValue(value)}`,
    );
  for (const key of Reflect.ownKeys(value))
    if (!keys.includes(key as keyof CoverInput))
      throw new VisError(
        `cover: unknown key ${describeValue(key)} (allowed: ${keys.join(", ")})`,
      );
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const rule = RULES[key];
    const v = value[key];
    if (v === undefined && !rule.required) continue;
    if (!(rule.nullable && v === null) && !rule.accepts(v))
      throw new VisError(
        `cover.${key}: expected ${rule.expected}, got ${describeValue(v)}`,
      );
    out[key] = v;
  }
  return out;
}

/**
 * The full cover input, validated: `item`, `theme` and `variant` are required, the rest
 * optional. Returns a new object with only the keys that were provided; never clamps and
 * never mutates `value`. `coverSpec(parseCoverInput(x))` equals `coverSpec(x)` for any `x`
 * it accepts.
 */
export function parseCoverInput(value: unknown): CoverInput {
  return parseKeys(value, ALL_KEYS) as unknown as CoverInput;
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
