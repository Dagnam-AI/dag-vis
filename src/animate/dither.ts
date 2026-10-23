import { toVec3 } from "../core/index.js";
import { DITHER_FRAG } from "./dither.glsl.js";
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

export interface DitherOptions extends EffectOptions {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  colorNum?: number;
  /** Dither cell size in CSS px (uploaded × dpr). */
  pixelSize?: number;
  /** Wave colour (any CSS colour `parseColor` accepts). Falls back to `colors[0]`. */
  color?: string;
}

/** Today's `<Dither>` defaults. */
export const DITHER_DEFAULTS = {
  waveSpeed: 0.05,
  waveFrequency: 3,
  waveAmplitude: 0.3,
  colorNum: 4,
  pixelSize: 2,
  color: "#808080",
} as const;

function validate(o: ResolvedOptions<DitherOptions>): void {
  validateCommon(o);
  assertFinite("waveSpeed", o.waveSpeed, 0);
  assertFinite("waveFrequency", o.waveFrequency, 0, false);
  assertFinite("waveAmplitude", o.waveAmplitude, 0);
  assertFinite("colorNum", o.colorNum, 2);
  assertFinite("pixelSize", o.pixelSize, 0, false);
  toVec3(o.color);
}

export function createDither(
  canvas: HTMLCanvasElement,
  opts: DitherOptions = {},
): EffectHandle<DitherOptions> {
  const o = merge<ResolvedOptions<DitherOptions>>(
    {
      ...COMMON_DEFAULTS,
      ...DITHER_DEFAULTS,
      color: opts.colors?.[0] ?? DITHER_DEFAULTS.color,
    },
    opts,
  );
  validate(o);
  const renderer = glRenderer({
    fragment: DITHER_FRAG,
    premultipliedAlpha: true,
    blend: false,
    uniforms(p, t, width, height, dpr) {
      const [r, g, b] = toVec3(o.color);
      p.f2("resolution", width, height);
      p.f1("time", t);
      p.f1("waveSpeed", o.waveSpeed);
      p.f1("waveFrequency", o.waveFrequency);
      p.f1("waveAmplitude", o.waveAmplitude);
      p.f3("waveColor", r, g, b);
      p.f1("colorNum", o.colorNum);
      p.f1("pixelSize", o.pixelSize * dpr);
    },
  });
  return createRuntime<DitherOptions>(canvas, o, validate, renderer);
}
