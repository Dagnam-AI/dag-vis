import { VisError, createRng } from "../core/index.js";
import { colourOf, namedVec3, validatePalette } from "./colour.js";
import { glRenderer } from "./gl.js";
import {
  COMMON_DEFAULTS,
  assertFinite,
  createRuntime,
  merge,
  validateCommon,
  type EffectHandle,
  type EffectOptions,
  type ResolvedOptions,
} from "./runtime.js";
import { TERMINAL_FRAG } from "./terminal.glsl.js";

export interface TerminalOptions extends EffectOptions {
  /**
   * Glyph tint (any CSS colour `parseColor` accepts). Falls back to
   * `colors[0]`, resolved on every frame so `update({ colors })` takes effect.
   */
  tint?: string;
  scale?: number;
  gridMul?: [number, number];
  digitSize?: number;
  /** Today's internal time multiplier (0.3). `speed` scales on top of it. */
  timeScale?: number;
  scanlineIntensity?: number;
  glitchAmount?: number;
  flickerAmount?: number;
  noiseAmp?: number;
  chromaticAberration?: number;
  /** 0..1 noise dither; `true` = 1. */
  dither?: number | boolean;
  curvature?: number;
  brightness?: number;
}

/** Today's `<FaultyTerminal>` defaults (minus mouse / page-load). */
export const TERMINAL_DEFAULTS = Object.freeze({
  /** Last fallback, after `tint` and `colors[0]`. */
  tint: "#ffffff",
  scale: 1,
  gridMul: Object.freeze([2, 1] as const),
  digitSize: 1.5,
  timeScale: 0.3,
  scanlineIntensity: 0.3,
  glitchAmount: 1,
  flickerAmount: 1,
  noiseAmp: 1,
  chromaticAberration: 0,
  dither: 0,
  curvature: 0.2,
  brightness: 1,
} as const);

/** The stored options keep `tint` optional: its fallback is resolved per frame, never captured. */
type Resolved = Omit<ResolvedOptions<TerminalOptions>, "tint"> & {
  tint?: string;
};

const { tint: FALLBACK_TINT, ...BASE_DEFAULTS } = TERMINAL_DEFAULTS;

const ditherValue = (d: number | boolean): number =>
  typeof d === "boolean" ? (d ? 1 : 0) : d;

/** `tint`, else `colors[0]`, else the default, named `tint` in the error. */
const tintVec = (o: Resolved): [number, number, number] =>
  namedVec3(
    "tint",
    colourOf(
      { ...o, ...(o.tint !== undefined && { color: o.tint }) },
      FALLBACK_TINT,
    ),
  );

function validate(o: Resolved): void {
  validatePalette(o);
  validateCommon(o);
  tintVec(o);
  assertFinite("scale", o.scale, 0, false);
  // Typed unknown: a JS caller can pass anything, whatever the declared tuple says.
  const grid: unknown = o.gridMul;
  if (!Array.isArray(grid) || grid.length !== 2)
    throw new VisError("gridMul must be [x, y]");
  assertFinite("gridMul[0]", o.gridMul[0], 0, false);
  assertFinite("gridMul[1]", o.gridMul[1], 0, false);
  assertFinite("digitSize", o.digitSize, 0, false);
  assertFinite("timeScale", o.timeScale, 0);
  for (const key of [
    "scanlineIntensity",
    "glitchAmount",
    "flickerAmount",
    "noiseAmp",
    "chromaticAberration",
    "curvature",
    "brightness",
  ] as const) {
    assertFinite(key, o[key], 0);
  }
  const d = ditherValue(o.dither);
  if (!(Number.isFinite(d) && d >= 0 && d <= 1))
    throw new VisError(
      `dither must be a finite number >= 0 and <= 1, got ${String(o.dither)}`,
    );
}

export function createTerminal(
  canvas: HTMLCanvasElement,
  opts: TerminalOptions = {},
): EffectHandle<TerminalOptions> {
  const o = merge<Resolved>(
    {
      ...COMMON_DEFAULTS,
      ...BASE_DEFAULTS,
      // A fresh mutable pair: the frozen default tuple is shared by every terminal.
      gridMul: [BASE_DEFAULTS.gridMul[0], BASE_DEFAULTS.gridMul[1]],
    },
    opts,
  );
  validate(o);
  const renderer = glRenderer({
    fragment: TERMINAL_FRAG,
    // ogl's Renderer default, and the landing card's: the compositor multiplies by alpha.
    premultipliedAlpha: false,
    blend: false,
    uniforms(p, t, width, height) {
      const [r, g, b] = tintVec(o); // validated in validate()
      // Today: `Math.random() * 100` seconds of phase; here it comes from the seed.
      const offset = createRng(o.seed).next() * 100;
      p.f1("iTime", (t + offset) * o.timeScale);
      p.f3("iResolution", width, height, width / height);
      p.f1("uScale", o.scale);
      p.f2("uGridMul", o.gridMul[0], o.gridMul[1]);
      p.f1("uDigitSize", o.digitSize);
      p.f1("uScanlineIntensity", o.scanlineIntensity);
      p.f1("uGlitchAmount", o.glitchAmount);
      p.f1("uFlickerAmount", o.flickerAmount);
      p.f1("uNoiseAmp", o.noiseAmp);
      p.f1("uChromaticAberration", o.chromaticAberration);
      p.f1("uDither", ditherValue(o.dither));
      p.f1("uCurvature", o.curvature);
      p.f3("uTint", r, g, b);
      p.f1("uBrightness", o.brightness);
    },
  });
  // `tint` stays optional in the stored options; only the draw callback above reads it.
  return createRuntime<TerminalOptions>(
    canvas,
    o as ResolvedOptions<TerminalOptions>,
    validate,
    renderer,
  );
}
