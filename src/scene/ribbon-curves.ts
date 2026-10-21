import { VisError } from "../core/errors.js";
import { createRng } from "../core/rng.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  finite,
  integerIn,
  orDefault,
  parseSeed,
} from "../core/validate.js";

export interface RibbonOptions {
  /** Canvas size in px, each side 1..16384. */
  width: number;
  height: number;
  /**
   * The spine the family of lines follows: `"diagonal"` (bottom-left to
   * top-right), `"horizontal"` (mid height), or 2..1000 `[x, y]` points in unit
   * coordinates (each -1000..1000; 0..1 spans the canvas), joined by straight
   * segments and walked by arc length. Consecutive repeated points are
   * skipped; a spine whose points all coincide throws. The normal turns
   * abruptly at a corner: the family fans out on the outside of the bend and
   * overlaps on the inside. Default `"diagonal"`.
   */
  path?: "diagonal" | "horizontal" | readonly (readonly [number, number])[];
  /** Integer 1..400. Default 120. */
  lines?: number;
  /** Points per curve, integer 2..1000. Default 96. */
  samples?: number;
  /** Half-turns of the family along the spine, -1000..1000. Default 2. */
  twist?: number;
  /** Wave amplitude as a fraction of the short side, -100..100. Default 0.12. */
  amplitude?: number;
  /** Wave cycles along the spine, -1000..1000. Default 1.5. */
  frequency?: number;
  /** Ribbon width as a fraction of the short side, 0..100. Default 0.35. */
  thickness?: number;
  /** Per-line seeded phase jitter, 0..1. Default 0.15. */
  jitter?: number;
  /** Safe integer. Default 1. */
  seed?: number;
}

type Pt = [number, number];

const MAX_LINES = 400;
const MAX_SAMPLES = 1000;
const MAX_PATH_POINTS = 1000;
const MAX_UNIT = 1000;
const TAU = 2 * Math.PI;

/** A spine with at least two distinct points. */
type Spine = readonly [Pt, Pt, ...Pt[]];

/** Options after validation: the spine in canvas px (consecutive duplicates removed) and every number defaulted. */
export interface RibbonConfig {
  width: number;
  height: number;
  spine: Spine;
  lines: number;
  samples: number;
  twist: number;
  amplitude: number;
  frequency: number;
  thickness: number;
  seed: number;
  /** Per-line phase offsets: jitter * range(-1, 1) * pi, the i-th draw of `seed`. */
  phis: readonly number[];
}

function pathPoint(i: number, v: unknown): Pt {
  if (!Array.isArray(v) || v.length !== 2)
    throw new VisError(`path[${i}] must be [x, y], got ${describeValue(v)}`);
  const [x, y] = v as unknown[];
  return [
    bounded(`path[${i}][0]`, x, -MAX_UNIT, MAX_UNIT),
    bounded(`path[${i}][1]`, y, -MAX_UNIT, MAX_UNIT),
  ];
}

const isSpine = (pts: Pt[]): pts is [Pt, Pt, ...Pt[]] => pts.length >= 2;

/** The spine in canvas px. Repeated consecutive points are dropped: they have no direction. */
function parseSpine(path: unknown, width: number, height: number): Spine {
  if (path === "diagonal")
    return [
      [0, height],
      [width, 0],
    ];
  if (path === "horizontal")
    return [
      [0, height / 2],
      [width, height / 2],
    ];
  if (!Array.isArray(path) || path.length < 2 || path.length > MAX_PATH_POINTS)
    throw new VisError(
      `path must be "diagonal", "horizontal" or an array of 2..${MAX_PATH_POINTS} [x, y] points, got ${Array.isArray(path) ? `an array of ${path.length}` : describeValue(path)}`,
    );
  const spine: Pt[] = [];
  (path as unknown[]).forEach((v, i) => {
    const [x, y] = pathPoint(i, v);
    const prev = spine[spine.length - 1];
    if (prev?.[0] === x * width && prev[1] === y * height) return;
    spine.push([x * width, y * height]);
  });
  if (!isSpine(spine))
    throw new VisError(
      "path must span a distance: all its points coincide, so it has no direction",
    );
  return spine;
}

/** Validates `opts` at the boundary. Throws a VisError naming the parameter and the value. */
export function parseRibbon(opts: RibbonOptions): RibbonConfig {
  // JS callers can pass anything.
  const input: unknown = opts;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `options must be an object, got ${describeValue(input)}`,
    );
  const width = bounded("width", opts.width, 1, MAX_DIMENSION);
  const height = bounded("height", opts.height, 1, MAX_DIMENSION);
  const lines = integerIn(
    "lines",
    orDefault<unknown>(opts.lines, 120),
    1,
    MAX_LINES,
  );
  const samples = integerIn(
    "samples",
    orDefault<unknown>(opts.samples, 96),
    2,
    MAX_SAMPLES,
  );
  const twist = bounded(
    "twist",
    orDefault<unknown>(opts.twist, 2),
    -1000,
    1000,
  );
  const amplitude = bounded(
    "amplitude",
    orDefault<unknown>(opts.amplitude, 0.12),
    -100,
    100,
  );
  const frequency = bounded(
    "frequency",
    orDefault<unknown>(opts.frequency, 1.5),
    -1000,
    1000,
  );
  const thickness = bounded(
    "thickness",
    orDefault<unknown>(opts.thickness, 0.35),
    0,
    100,
  );
  const jitter = bounded("jitter", orDefault<unknown>(opts.jitter, 0.15), 0, 1);
  const seed = parseSeed(opts.seed);
  const spine = parseSpine(
    orDefault<unknown>(opts.path, "diagonal"),
    width,
    height,
  );
  // The i-th draw belongs to line i, whatever `lines` or the phase are.
  const rng = createRng(seed);
  const phis = Array.from(
    { length: lines },
    () => jitter * rng.range(-1, 1) * Math.PI,
  );
  return {
    width,
    height,
    spine,
    lines,
    samples,
    twist,
    amplitude,
    frequency,
    thickness,
    seed,
    phis,
  };
}

/** What every line needs at one step along the spine, computed once and shared by all lines. */
interface Row {
  x: number;
  y: number;
  /** Unit normal. */
  nx: number;
  ny: number;
  /** cos/sin of the twist angle pi * twist * s and the wave angle 2 * pi * frequency * s. */
  cosA: number;
  sinA: number;
  cosW: number;
  sinW: number;
}

/** `samples` rows at equal arc-length steps along the spine. */
function walkSpine(cfg: RibbonConfig): Row[] {
  const { spine, samples } = cfg;
  interface Seg {
    a: Pt;
    b: Pt;
    start: number;
    end: number;
    len: number;
    /** Unit normal: the direction turned a quarter turn, (dx, dy) -> (-dy, dx). */
    nx: number;
    ny: number;
  }
  const segs: Seg[] = [];
  let total = 0;
  let a = spine[0];
  for (const b of spine.slice(1)) {
    // Distinct points, so hypot > 0 even for denormal differences.
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({
      a,
      b,
      start: total,
      end: total + len,
      len,
      nx: -(b[1] - a[1]) / len,
      ny: (b[0] - a[0]) / len,
    });
    total += len;
    a = b;
  }
  const rows: Row[] = [];
  for (const [k, seg] of segs.entries()) {
    const last = k === segs.length - 1;
    // The last segment takes whatever is left, so rounding never drops a sample.
    while (rows.length < samples) {
      const s = rows.length / (samples - 1);
      const target = s * total;
      if (!last && target > seg.end) break;
      // Clamped: a segment far shorter than the running total can round to a zero step.
      const f = Math.min(1, Math.max(0, (target - seg.start) / seg.len));
      const twistAngle = Math.PI * cfg.twist * s;
      const waveAngle = TAU * cfg.frequency * s;
      rows.push({
        x: seg.a[0] * (1 - f) + seg.b[0] * f,
        y: seg.a[1] * (1 - f) + seg.b[1] * f,
        nx: seg.nx,
        ny: seg.ny,
        cosA: Math.cos(twistAngle),
        sinA: Math.sin(twistAngle),
        cosW: Math.cos(waveAngle),
        sinW: Math.sin(waveAngle),
      });
    }
  }
  return rows;
}

/** The curves of a validated config at `phase` (any finite number; reduced mod 2*pi). */
export function curvesAt(
  cfg: RibbonConfig,
  phase: number,
): [number, number][][] {
  const { lines } = cfg;
  const m = Math.min(cfg.width, cfg.height);
  const ph = phase % TAU;
  // Angle addition, so the trig runs once per row and once per line, not once
  // per point: cos(a + b) = cos a cos b - sin a sin b, and likewise for sin.
  const rows = walkSpine(cfg);
  const spread = cfg.thickness * m;
  const wave = cfg.amplitude * m;
  return cfg.phis.map((phi, i) => {
    // One line is the centre of the family: u = 0, not 0/0.
    const u = lines === 1 ? 0 : i / (lines - 1) - 0.5;
    const b = ph + phi;
    const cosB = Math.cos(b);
    const sinB = Math.sin(b);
    const c = ph + u * Math.PI;
    const cosC = Math.cos(c);
    const sinC = Math.sin(c);
    return rows.map((r): [number, number] => {
      // u * thickness * m * cos(pi * twist * s + phase + phi)
      //   + amplitude * m * sin(2 * pi * frequency * s + phase + u * pi)
      const d =
        u * spread * (r.cosA * cosB - r.sinA * sinB) +
        wave * (r.sinW * cosC + r.cosW * sinC);
      return [r.x + r.nx * d, r.y + r.ny * d];
    });
  });
}

/**
 * The wireframe wave-mesh ribbon: `lines` curves offset across a spine along
 * its unit normal by a twisting, phase-shifted sine displacement, so the
 * family collapses and crosses where `cos(pi * twist * s)` is zero. For line
 * `i` of `lines` (`u = i / (lines - 1) - 0.5`, `0` for a single line) at
 * spine fraction `s` and `m = min(width, height)`:
 *
 *   offset = u * thickness * m * cos(pi * twist * s + phase + phi_i)
 *          + amplitude * m * sin(2 * pi * frequency * s + phase + u * pi)
 *
 * `phi_i = jitter * range(-1, 1) * pi` is the i-th draw of `seed` and does not
 * depend on `phase`, so animating `phase` moves the SAME ribbon; the motion is
 * periodic in `phase` with period 2*pi. Pure and deterministic: the same
 * options and phase give the same points (also used by the Canvas2D renderer
 * at 60 fps).
 *
 * @param phase any finite number of radians; default 0.
 * @returns one `[x, y]` array per line, in canvas px of `width` x `height`.
 * @throws VisError naming the offending parameter and value.
 */
export function ribbonCurves(
  opts: RibbonOptions,
  phase = 0,
): [number, number][][] {
  const cfg = parseRibbon(opts);
  return curvesAt(cfg, finite("phase", phase));
}
