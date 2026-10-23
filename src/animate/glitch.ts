import { VisError, createRng } from "../core/index.js";
import { canvas2dRenderer } from "./canvas2d.js";
import { namedVec3, validatePalette } from "./colour.js";
import {
  COMMON_DEFAULTS,
  assertFinite,
  createRuntime,
  merge,
  validateCommon,
  type EffectHandle,
  type EffectOptions,
  type Patch,
  type ResolvedOptions,
} from "./runtime.js";

export type GlitchVignette = "none" | "outer" | "center";
/** 0..255 integer channels. */
export type Rgb = [number, number, number];

export interface GlitchOptions extends EffectOptions {
  /** Glyph palette (any CSS colour; alpha is ignored). `colors` is copied. */
  colors?: string[];
  characters?: string;
  /** Milliseconds between glitch ticks (>= 1). With `loop` the tick is stretched to divide the loop evenly. */
  glitchSpeed?: number;
  /** Tween each re-rolled cell to its new colour over 1/3 s. */
  smooth?: boolean;
  /** Black radial fade drawn on the canvas, as today's DOM overlays were. */
  vignette?: GlitchVignette;
}

/** Today's `<LetterGlitch>` defaults (`outerVignette` was on by default). */
export const GLITCH_DEFAULTS = Object.freeze({
  colors: Object.freeze(["#2b4539", "#61dca3", "#61b3dc"]),
  characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
  glitchSpeed: 50,
  smooth: true,
  vignette: "outer",
} as const);

const FONT_SIZE = 16;
const CELL_W = 10;
const CELL_H = 20;
/** Today: 5 % of the cells re-roll per tick. */
const CHANGE_RATE = 0.05;
/** Today: colourProgress += 0.05 per frame, i.e. 20 frames at 60 fps. */
const TWEEN_S = 20 / 60;
/** Without a loop every cell is still forced to change once per this many ticks. */
const FORCE_PERIOD = 400;
const VIGNETTES: readonly GlitchVignette[] = ["none", "outer", "center"];

const SALT_CHANGE = 0x9e3779b9;
const SALT_FORCE = 0x85ebca6b;
const SALT_STATE = 0xc2b2ae3d;

const mixIn = (h: number, v: number): number => {
  let x = Math.imul(h ^ v, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return x ^ (x >>> 16);
};

/** A well-mixed uint32 of (salt, seed, cell, tick). */
const hash = (salt: number, seed: number, cell: number, tick: number): number =>
  mixIn(mixIn(mixIn(salt, seed), cell), tick) >>> 0;

const wrap = (tick: number, ticksPerLoop: number): number =>
  ticksPerLoop > 0
    ? ((tick % ticksPerLoop) + ticksPerLoop) % ticksPerLoop
    : tick;

/** Ticks between guaranteed changes of one cell. */
const forcePeriod = (ticksPerLoop: number): number =>
  ticksPerLoop > 0 ? ticksPerLoop : FORCE_PERIOD;

/**
 * Does `cell` re-roll at `tick`? Each tick is a seeded Bernoulli draw, plus one
 * forced change per cell every `forcePeriod` ticks (at a per-cell offset) so a
 * cell's last change is always within that window. The draw rate is lowered by
 * the same amount, keeping the overall rate at 5 %. Without a loop, tick <= 0
 * is the initial state, which counts as a change.
 */
export function changedAt(
  seed: number,
  cell: number,
  tick: number,
  ticksPerLoop: number,
): boolean {
  if (ticksPerLoop === 0 && tick <= 0) return true;
  const period = forcePeriod(ticksPerLoop);
  const k = wrap(tick, ticksPerLoop);
  const forced = Math.floor(
    (hash(SALT_FORCE, seed, cell, 0) / 2 ** 32) * period,
  );
  if (k % period === forced) return true;
  const draw = Math.max(0, (CHANGE_RATE - 1 / period) / (1 - 1 / period));
  return hash(SALT_CHANGE, seed, cell, k) / 2 ** 32 < draw;
}

/** The most recent tick <= k at which `cell` re-rolled (k - period for a non-finite k). */
export function lastChange(
  seed: number,
  cell: number,
  k: number,
  ticksPerLoop: number,
): number {
  const period = forcePeriod(ticksPerLoop);
  for (let n = 0; n < period; n += 1)
    if (changedAt(seed, cell, k - n, ticksPerLoop)) return k - n;
  return k - period;
}

/** The char and colour `cell` took at its change `tick`. */
export function cellState(
  seed: number,
  cell: number,
  tick: number,
  ticksPerLoop: number,
  chars: string[],
  palette: Rgb[],
): { char: string; rgb: Rgb } {
  const rng = createRng(hash(SALT_STATE, seed, cell, wrap(tick, ticksPerLoop)));
  return { char: rng.pick(chars), rgb: rng.pick(palette) };
}

const channel = (v: number): number => Math.round(v * 255);
const toRgb = (c: string, i: number): Rgb => {
  const [r, g, b] = namedVec3(`colors[${String(i)}]`, c);
  return [channel(r), channel(g), channel(b)];
};
const css = (c: Rgb): string =>
  `rgb(${String(c[0])}, ${String(c[1])}, ${String(c[2])})`;
const lerp = (a: Rgb, b: Rgb, p: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * p),
  Math.round(a[1] + (b[1] - a[1]) * p),
  Math.round(a[2] + (b[2] - a[2]) * p),
];

function validate(o: ResolvedOptions<GlitchOptions>): void {
  // Typed unknown: a JS caller can pass anything, whatever the declared type says.
  const colors: unknown = o.colors;
  if (!Array.isArray(colors) || colors.length === 0)
    throw new VisError("colors must list at least one colour");
  validatePalette(o);
  validateCommon(o);
  const characters: unknown = o.characters;
  if (typeof characters !== "string" || characters === "")
    throw new VisError("characters must be a non-empty string");
  assertFinite("glitchSpeed", o.glitchSpeed, 1);
  const smooth: unknown = o.smooth;
  if (typeof smooth !== "boolean")
    throw new VisError(`smooth must be a boolean, got ${String(smooth)}`);
  const vignette: unknown = o.vignette;
  if (!VIGNETTES.includes(o.vignette))
    throw new VisError(
      `vignette must be one of ${VIGNETTES.join(", ")}, got ${String(vignette)}`,
    );
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  kind: GlitchVignette,
  w: number,
  h: number,
): void {
  if (kind === "none") return;
  // CSS `radial-gradient(circle, ...)` reaches the farthest corner.
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    0,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  if (kind === "outer") {
    // radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,1) 100%)
    g.addColorStop(0.6, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
  } else {
    // radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)
    g.addColorStop(0, "rgba(0,0,0,0.8)");
    g.addColorStop(0.6, "rgba(0,0,0,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** The stored options: `colors` always present (the defaults supply it, validate keeps it non-empty). */
type Resolved = ResolvedOptions<GlitchOptions> & { colors: string[] };

/** One cell at one tick. */
interface Cell {
  char: string;
  cur: Rgb;
  /** The colour it tweens from (`cur` when it does not tween). */
  prev: Rgb;
  /** Virtual time (s) of its last change. */
  since: number;
}

interface Frame {
  chars: string[];
  palette: Rgb[];
  seed: number;
  ticks: number;
  period: number;
  smooth: boolean;
}

/** Every cell's state at `tick`: a cache of the pure functions above. */
function buildCells(count: number, tick: number, f: Frame): Cell[] {
  return Array.from({ length: count }, (_, i): Cell => {
    const last = lastChange(f.seed, i, tick, f.ticks);
    const { char, rgb } = cellState(
      f.seed,
      i,
      last,
      f.ticks,
      f.chars,
      f.palette,
    );
    // The initial state (tick <= 0) is settled, as today's first frame is.
    const tweens = f.smooth && (f.ticks > 0 || last > 0);
    const before = lastChange(f.seed, i, last - 1, f.ticks);
    return {
      char,
      cur: rgb,
      prev: tweens
        ? cellState(f.seed, i, before, f.ticks, f.chars, f.palette).rgb
        : rgb,
      since: last * f.period,
    };
  });
}

/** Copies the array and object options so a caller mutating them later cannot bypass validation. */
const own = <P extends Patch<GlitchOptions>>(p: P): P => ({
  ...p,
  ...(Array.isArray(p.colors) && { colors: [...p.colors] }),
  ...(p.loop && { loop: { ...p.loop } }),
});

export function createGlitch(
  canvas: HTMLCanvasElement,
  opts: GlitchOptions = {},
): EffectHandle<GlitchOptions> {
  const o = merge<Resolved>(
    {
      ...COMMON_DEFAULTS,
      ...GLITCH_DEFAULTS,
      // A fresh mutable palette: the frozen default is shared by every glitch.
      colors: [...GLITCH_DEFAULTS.colors],
    },
    own(opts),
  );
  validate(o);
  // The cells for one tick, rebuilt when the tick or any input that shapes them changes.
  let cache: { sig: readonly unknown[]; cells: Cell[] } | undefined;

  const renderer = canvas2dRenderer((ctx, w, h, dpr, rawT) => {
    const t = Number.isFinite(rawT) ? rawT : 0;
    const cols = Math.ceil(w / CELL_W);
    const count = cols * Math.ceil(h / CELL_H);
    // Looping: stretch the tick so a whole number of them fills the loop and the seam is seamless.
    const ticks = o.loop
      ? Math.max(1, Math.round((o.loop.duration * 1000) / o.glitchSpeed))
      : 0;
    const period = o.loop ? o.loop.duration / ticks : o.glitchSpeed / 1000;
    const k = Math.floor(t / period);
    const tick = ticks > 0 ? k : Math.max(0, k);
    const { colors } = o;
    const sig = [
      o.seed,
      ticks,
      period,
      o.characters,
      colors,
      o.smooth,
      count,
      tick,
    ];
    let entry = cache;
    if (!entry || entry.sig.some((v, i) => v !== sig[i])) {
      entry = {
        sig,
        cells: buildCells(count, tick, {
          chars: Array.from(o.characters), // by code point
          palette: colors.map(toRgb),
          seed: o.seed,
          ticks,
          period,
          smooth: o.smooth,
        }),
      };
      cache = entry;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${String(FONT_SIZE)}px monospace`;
    ctx.textBaseline = "top";
    for (const [i, cell] of entry.cells.entries()) {
      const p = Math.min(1, Math.max(0, (t - cell.since) / TWEEN_S));
      ctx.fillStyle = css(lerp(cell.prev, cell.cur, p));
      ctx.fillText(
        cell.char,
        (i % cols) * CELL_W,
        Math.floor(i / cols) * CELL_H,
      );
    }
    drawVignette(ctx, o.vignette, w, h);
  });

  const handle = createRuntime<GlitchOptions>(canvas, o, validate, renderer);
  const update = handle.update.bind(handle);
  handle.update = (patch) => {
    update(own(patch));
  };
  return handle;
}
