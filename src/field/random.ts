import { VisError, createRng } from "../core/index.js";
import {
  assertOptions,
  describeValue,
  integerIn,
  orDefault,
} from "../core/validate.js";
import { FLOW_SHAPES, type FlowFieldSpec } from "./spec.js";

/** How `randomFlow` picks its colours: dark, light or vivid. */
export type FlowMood = "dark" | "light" | "vivid";

/** What `randomFlow` takes. */
export interface RandomFlowOptions {
  /** Integer 0 to 4294967295 (the range a field spec's `seed` takes). Default 1. */
  seed?: number | undefined;
  /** Default "dark". */
  mood?: FlowMood | undefined;
}

/** Lightness (percent) and chroma ranges of each mood; the first colour is the darkest. */
const BANDS: Readonly<
  Record<FlowMood, { l: [number, number]; c: [number, number] }>
> = Object.freeze({
  dark: { l: [18, 60], c: [0.08, 0.22] },
  light: { l: [65, 95], c: [0.05, 0.16] },
  vivid: { l: [40, 80], c: [0.2, 0.3] },
});

const MAX_SEED = 4294967295;

const round = (v: number): number => Number(v.toFixed(3));

/**
 * A new flow field from a seed: 3 to 5 colours along a hue arc, from the darkest to the
 * lightest of the mood's lightness band, plus a random shape, warp, rotation and
 * vignette. The same options always give the same spec, and it always passes
 * `resolveField`. Throws a VisError naming `seed` or `mood` when either is invalid.
 */
export function randomFlow(opts: RandomFlowOptions = {}): FlowFieldSpec {
  assertOptions(opts);
  const seed = integerIn("seed", orDefault<unknown>(opts.seed, 1), 0, MAX_SEED);
  const mood = orDefault<unknown>(opts.mood, "dark");
  // An own-property lookup: "__proto__" and "toString" are not moods.
  if (typeof mood !== "string" || !Object.hasOwn(BANDS, mood))
    throw new VisError(
      `mood must be one of ${Object.keys(BANDS).join("|")}, got ${describeValue(mood)}`,
    );
  const band = BANDS[mood as FlowMood];
  const rng = createRng(seed);
  const n = rng.int(3, 5);
  const hue0 = rng.range(0, 360);
  const arc = rng.range(40, 140);
  const palette: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const l = band.l[0] + (band.l[1] - band.l[0]) * t;
    const c = rng.range(band.c[0], band.c[1]);
    const h = (hue0 + arc * t) % 360;
    palette.push(`oklch(${l.toFixed(2)}% ${c.toFixed(3)} ${h.toFixed(1)})`);
  }
  return {
    kind: "flow",
    palette,
    shape: rng.pick(FLOW_SHAPES),
    warp: {
      octaves: rng.int(2, 4),
      strength: round(rng.range(0.5, 1.5)),
      scale: round(rng.range(0.7, 1.4)),
    },
    rotation: round(rng.range(-1, 1)),
    light: { vignette: round(rng.range(0, 0.4)) },
    grain: round(rng.range(0.25, 0.5)),
    seed,
  };
}
