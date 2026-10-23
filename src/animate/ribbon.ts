import { VisError, parseColor, toCss } from "../core/index.js";
import { MAX_DIMENSION } from "../core/validate.js";
import { ribbonCurves } from "../scene/index.js";
import { canvas2dRenderer } from "./canvas2d.js";
import { validatePalette } from "./colour.js";
import {
  COMMON_DEFAULTS,
  createRuntime,
  merge,
  validateCommon,
  type EffectHandle,
  type EffectOptions,
  type Patch,
  type ResolvedOptions,
} from "./runtime.js";

export interface RibbonEffectOptions extends EffectOptions {
  /** Curve count, integer 1..400 (the rules of `scene.ribbonCurves`). */
  lines?: number;
  /** Half-turns of the family along the spine, -1000..1000. */
  twist?: number;
  /** Wave amplitude as a fraction of the short side, -100..100. */
  amplitude?: number;
  /** Wave cycles along the spine, -1000..1000. */
  frequency?: number;
  /** Gradient stops along the spine, 1..64 CSS colours (alpha honoured). `colors` is copied. */
  colors?: string[];
  /** Stroke width in CSS px, 0.001..64. */
  strokeWidth?: number;
  /** Opacity of each line, 0..1. */
  opacity?: number;
  /** Phase advance in radians per second when not looping. */
  drift?: number;
}

/**
 * The static `ribbon()`'s defaults, so the animated and the static ribbon are
 * the same ribbon at phase 0.
 */
export const RIBBON_DEFAULTS = Object.freeze({
  lines: 120,
  twist: 2,
  amplitude: 0.12,
  frequency: 1.5,
  colors: Object.freeze(["#ef4444", "#7c3aed", "#10abba"]),
  strokeWidth: 1,
  opacity: 0.8,
  drift: 0.5,
} as const);

const MAX_COLORS = 64;
const MIN_STROKE = 0.001;
const MAX_STROKE = 64;

/** The stored options: `colors` always present (the defaults supply it, validate keeps it non-empty). */
type Resolved = ResolvedOptions<RibbonEffectOptions> & { colors: string[] };

function validate(o: ResolvedOptions<RibbonEffectOptions>): void {
  // Typed unknown: a JS caller can pass anything, whatever the declared type says.
  const colors: unknown = o.colors;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_COLORS)
    throw new VisError(`colors must list 1..${String(MAX_COLORS)} colours`);
  validatePalette(o);
  validateCommon(o);
  // The geometry rules (lines, twist, amplitude, frequency, seed) are ribbonCurves' own,
  // so a bad value throws here and never inside the render callback.
  ribbonCurves(
    {
      width: 1,
      height: 1,
      samples: 2,
      lines: o.lines,
      twist: o.twist,
      amplitude: o.amplitude,
      frequency: o.frequency,
      seed: o.seed,
    },
    0,
  );
  if (!(
    Number.isFinite(o.strokeWidth) &&
    o.strokeWidth >= MIN_STROKE &&
    o.strokeWidth <= MAX_STROKE
  ))
    throw new VisError(
      `strokeWidth must be a finite number >= ${String(MIN_STROKE)} and <= ${String(MAX_STROKE)}, got ${String(o.strokeWidth)}`,
    );
  if (!(Number.isFinite(o.opacity) && o.opacity >= 0 && o.opacity <= 1))
    throw new VisError(
      `opacity must be a finite number >= 0 and <= 1, got ${String(o.opacity)}`,
    );
  if (!Number.isFinite(o.drift))
    throw new VisError(`drift must be a finite number, got ${String(o.drift)}`);
}

/** Copies the array and object options so a caller mutating them later cannot bypass validation. */
const own = <P extends Patch<RibbonEffectOptions>>(p: P): P => ({
  ...p,
  ...(Array.isArray(p.colors) && { colors: [...p.colors] }),
  ...(p.loop && { loop: { ...p.loop } }),
});

export function createRibbon(
  canvas: HTMLCanvasElement,
  opts: RibbonEffectOptions = {},
): EffectHandle<RibbonEffectOptions> {
  const o = merge<Resolved>(
    {
      ...COMMON_DEFAULTS,
      ...RIBBON_DEFAULTS,
      // A fresh mutable palette: the frozen default is shared by every ribbon.
      colors: [...RIBBON_DEFAULTS.colors],
    },
    own(opts),
  );
  validate(o);

  const renderer = canvas2dRenderer((ctx, rawW, rawH, dpr, t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rawW, rawH);
    // A 0-px canvas (before layout, display: none) has nothing to draw on.
    if (rawW < 1 || rawH < 1) return;
    const w = Math.min(rawW, MAX_DIMENSION);
    const h = Math.min(rawH, MAX_DIMENSION);
    // 2π per loop: the runtime wrapped t into [0, duration), so frames 0 and duration are the same.
    const raw = o.loop ? (2 * Math.PI * t) / o.loop.duration : t * o.drift;
    // A non-finite t (or an overflowing t × drift) would throw inside ribbonCurves.
    const phase = Number.isFinite(raw) ? raw : 0;
    const curves = ribbonCurves(
      {
        width: w,
        height: h,
        lines: o.lines,
        twist: o.twist,
        amplitude: o.amplitude,
        frequency: o.frequency,
        seed: o.seed,
      },
      phase,
    );
    // Bottom-left to top-right: the static ribbon's diagonal spine.
    const gradient = ctx.createLinearGradient(0, h, w, 0);
    const last = Math.max(1, o.colors.length - 1);
    o.colors.forEach((c, i) => {
      gradient.addColorStop(i / last, toCss(parseColor(c)));
    });
    ctx.strokeStyle = gradient;
    ctx.lineWidth = o.strokeWidth;
    ctx.globalAlpha = o.opacity;
    ctx.lineJoin = "round";
    for (const curve of curves) {
      ctx.beginPath();
      curve.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  });

  const handle = createRuntime<RibbonEffectOptions>(
    canvas,
    o,
    validate,
    renderer,
  );
  const update = handle.update.bind(handle);
  handle.update = (patch) => {
    update(own(patch));
  };
  return handle;
}
