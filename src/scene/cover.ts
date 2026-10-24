import { VisError } from "../core/errors.js";
import { createRng } from "../core/rng.js";
import {
  assertOptions,
  describeValue,
  finite,
  orDefault,
} from "../core/validate.js";
import type { GlowsSpec } from "../gradient/index.js";

/**
 * Generated covers for blog posts and course lessons: one deterministic look per FAMILY
 * (a course topic; an independent post is its own family), nudged per ITEM, so a topic's
 * lessons read as siblings and every post is unique. `coverLayers` gives the glows,
 * `coverSpec` the same cover as a gradient spec.
 */
export interface CoverInput {
  /** Topic or course key; `null` or omitted: the item is its own family. */
  family?: string | null;
  /** The post or lesson slug. */
  item: string;
  /** Position in the family, 0-based (clamped to the family). Default 0. */
  index?: number;
  /** Items in the family; above 1 the family is ordered. Default 1. */
  count?: number;
  theme: "light" | "dark";
  variant: "card" | "banner";
  /** The editor's choices: `null` or omitted means derive as usual. */
  /** Replaces the item key (and the family key when there is no family). */
  seed?: string | null;
  /** Hue offset from brand red in degrees, clamped to -15..15; replaces the family drift. */
  hue?: number | null;
  /** An index into the five anchor regions, rounded and clamped to 0..4. */
  region?: number | null;
  /** Scales both glows' alpha, clamped to 0.6..1.4. */
  intensity?: number | null;
}

/** The editor's choices alone: what a stored cover spec carries, before `item`, `theme` and `variant` join it. */
export type CoverChoices = Pick<
  CoverInput,
  "family" | "seed" | "hue" | "region" | "intensity"
>;

export interface CoverGlow {
  /** The ellipse's radii in percent of the box. */
  size: [number, number];
  /** Centre in percent of the box. */
  at: [number, number];
  /** An `oklch(L C H / A)` colour, hue and alpha rounded to 2 decimals. */
  colour: string;
}

export interface CoverLayers {
  /** The theme's solid colour under the glows. */
  base: string;
  /** The main glow, then its mirrored fainter echo. */
  glows: [CoverGlow, CoverGlow];
}

export interface CoverParams {
  /** The family's hue, before the item's nudge. */
  familyHue: number;
  hue: number;
  /** The family's anchor region and this item's jittered anchor. */
  region: readonly [number, number];
  anchor: [number, number];
  /** The main glow's size in percent: the family's, then this item's. */
  familyRadius: [number, number];
  radius: [number, number];
  /** Where in an animation loop this item starts: index / count. */
  phase: number;
  intensity: number;
}

/** Brand red `#ef4444` as an OKLCH hue (HSL's hue steps are uneven around red). */
const BRAND_HUE = 25.3;
/** The ranges `coverSpec` clamps to, and `parseCoverInput` enforces. */
export const HUE_RANGE = [-15, 15] as const;
export const INTENSITY_RANGE = [0.6, 1.4] as const;
const FAMILY_HUE_DRIFT = 15;
/** An ordered family's items spread this many degrees either way, by index. */
const ITEM_HUE_SPREAD = 6;
/** An item's anchor jitter, in percent of the box, either way. */
const ITEM_JITTER = 8;
/** An item's change to its glow's size, as a fraction, either way. */
const ITEM_RADIUS_NUDGE = 0.1;
/** Where a family's main glow sits, in percent of the box: all off-centre. */
type RegionKey = 0 | 1 | 2 | 3 | 4;
const ANCHOR_REGIONS: readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
] = [
  [22, 74],
  [78, 50],
  [84, 20],
  [24, 28],
  [72, 80],
];
/** The editor's `region` is an index into the anchors: 0..REGION_COUNT - 1. */
export const REGION_COUNT = ANCHOR_REGIONS.length;
const BASE = { dark: "#0a0a0a", light: "#ffffff" } as const;
// One lightness/chroma/alpha envelope per theme: siblings stay related.
const GLOW = {
  dark: { lightness: 0.6, chroma: 0.22, alpha: 0.6 },
  light: { lightness: 0.72, chroma: 0.17, alpha: 0.5 },
} as const;

/** 32-bit FNV-1a: stable across runs and platforms. */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

const round = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** A string, or `undefined` for undefined/`null` (absent); `nonEmpty` rejects "". */
function text(name: string, v: unknown, nonEmpty: boolean): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || (nonEmpty && v === ""))
    throw new VisError(
      `${name} must be ${nonEmpty ? "a non-empty " : "a "}string, got ${describeValue(v)}`,
    );
  return v;
}

/** A finite number, or `undefined` for undefined/`null` (an editor choice left unset). */
function choice(name: string, v: unknown): number | undefined {
  return v === undefined || v === null ? undefined : finite(name, v);
}

function oneOf<T extends string>(
  name: string,
  v: unknown,
  allowed: readonly T[],
): T {
  if (!allowed.includes(v as T))
    throw new VisError(
      `${name} must be ${allowed.map((a) => `"${a}"`).join(" or ")}, got ${describeValue(v)}`,
    );
  return v as T;
}

interface Parsed {
  family: string | undefined;
  item: string;
  index: number;
  count: number;
  theme: "light" | "dark";
  variant: "card" | "banner";
  seed: string | undefined;
  hue: number | undefined;
  region: number | undefined;
  intensity: number | undefined;
}

function parse(input: CoverInput): Parsed {
  assertOptions(input);
  const o = input as unknown as Record<string, unknown>;
  const item = text("item", o.item, true);
  if (item === undefined)
    throw new VisError(
      `item must be a non-empty string, got ${describeValue(o.item)}`,
    );
  const seed = text("seed", o.seed, false);
  return {
    family: text("family", o.family, true),
    item,
    index: finite("index", orDefault<unknown>(o.index, 0)),
    count: finite("count", orDefault<unknown>(o.count, 1)),
    theme: oneOf("theme", o.theme, ["light", "dark"]),
    variant: oneOf("variant", o.variant, ["card", "banner"]),
    // An empty seed is "no seed" (the stored form of a cleared editor field).
    seed: seed === "" ? undefined : seed,
    hue: choice("hue", o.hue),
    region: choice("region", o.region),
    intensity: choice("intensity", o.intensity),
  };
}

/**
 * The numbers behind a cover: what the family fixes and what the item moves. Exported
 * from this module for the tests only; the barrels do not carry it.
 */
export function coverParams(input: CoverInput): CoverParams {
  return derive(parse(input));
}

function derive(p: Parsed): CoverParams {
  const itemKey = p.seed ?? p.item;
  const fromFamily = createRng(fnv1a32(p.family ?? itemKey));
  const fromItem = createRng(fnv1a32(itemKey));
  const banner = p.variant === "banner";

  // Drawn even when overridden, so a choice moves only what it names.
  const drift = fromFamily.range(-1, 1) * FAMILY_HUE_DRIFT;
  const regionIndex = Math.floor(fromFamily.next() * ANCHOR_REGIONS.length);
  const familyHue =
    BRAND_HUE + (p.hue === undefined ? drift : clamp(p.hue, ...HUE_RANGE));
  // In 0..4 by construction (a floor of next() * 5, or clamped), so a valid key.
  const regionKey = (
    p.region === undefined
      ? regionIndex
      : clamp(Math.round(p.region), 0, ANCHOR_REGIONS.length - 1)
  ) as RegionKey;
  const region = ANCHOR_REGIONS[regionKey];
  const familyRadius: [number, number] = banner
    ? [fromFamily.range(50, 70), fromFamily.range(100, 130)]
    : [fromFamily.range(55, 75), fromFamily.range(80, 110)];

  // A course's lessons spread in order; a tag's posts each take a seeded nudge in the
  // same range; a post that is its own family takes none.
  const hue =
    p.count > 1
      ? familyHue +
        ((2 * clamp(p.index, 0, p.count - 1)) / (p.count - 1) - 1) *
          ITEM_HUE_SPREAD
      : p.family && p.family !== p.item
        ? familyHue + fromItem.range(-ITEM_HUE_SPREAD, ITEM_HUE_SPREAD)
        : familyHue;
  const anchor: [number, number] = [
    region[0] + fromItem.range(-ITEM_JITTER, ITEM_JITTER),
    region[1] + fromItem.range(-ITEM_JITTER, ITEM_JITTER),
  ];
  const scale = 1 + fromItem.range(-ITEM_RADIUS_NUDGE, ITEM_RADIUS_NUDGE);
  return {
    familyHue,
    hue,
    region,
    anchor,
    familyRadius,
    radius: [familyRadius[0] * scale, familyRadius[1] * scale],
    phase: p.count > 1 ? clamp(p.index, 0, p.count - 1) / p.count : 0,
    intensity:
      p.intensity === undefined ? 1 : clamp(p.intensity, ...INTENSITY_RANGE),
  };
}

/**
 * A cover as layers: the item's main glow, then a fainter echo opposite it (mirrored, so
 * it moves with the family too), on the theme's base. Hue and alpha in the colour strings
 * are rounded to 2 decimals.
 */
export function coverLayers(input: CoverInput): CoverLayers {
  const parsed = parse(input);
  const { hue, anchor, radius, intensity } = derive(parsed);
  const glow = GLOW[parsed.theme];
  const colour = (alpha: number): string =>
    `oklch(${glow.lightness} ${glow.chroma} ${round(hue)} / ${round(alpha * intensity)})`;
  return {
    base: BASE[parsed.theme],
    glows: [
      { size: radius, at: anchor, colour: colour(glow.alpha) },
      {
        size: [radius[0] * 0.7, radius[1] * 0.7],
        at: [100 - anchor[0], 100 - anchor[1]],
        colour: colour(glow.alpha * 0.35),
      },
    ],
  };
}

/**
 * The cover as a gradient spec: `gradient(coverSpec(input)).css` is the background. The
 * glows come in paint order (echo first, so the main glow is on top). Pass
 * a `size` on the result's spread (`{ ...coverSpec(i), size }`) to size the SVG output.
 */
export function coverSpec(input: CoverInput): GlowsSpec {
  const { base, glows } = coverLayers(input);
  return {
    kind: "glows",
    base,
    // `glows` paints later entries on top; the layers list the main glow first.
    glows: glows
      .map(({ size, at, colour }) => ({ size, at, color: colour }))
      .reverse(),
  };
}
