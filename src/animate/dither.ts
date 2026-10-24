import {
  asResolved,
  resolveColour,
  validatePalette,
  withoutColour,
  type WithOptionalColour,
} from "./colour.js";
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
} from "./runtime.js";

export interface DitherOptions extends EffectOptions {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  colorNum?: number;
  /** Dither cell size in CSS px (uploaded × dpr). */
  pixelSize?: number;
  /**
   * Wave colour (any CSS colour `parseColor` accepts). Falls back to `colors[0]`,
   * resolved on every frame so `update({ colors })` takes effect. The parsed
   * channel values are used as linear light, as today's `waveColor` was, and the
   * shader sRGB-encodes the result: on screen the crests read lighter than the
   * CSS colour (for `#e64040` the red levels on screen are 156 and 213).
   */
  color?: string;
}

/** Today's `<Dither>` defaults. */
export const DITHER_DEFAULTS = Object.freeze({
  waveSpeed: 0.05,
  waveFrequency: 3,
  waveAmplitude: 0.3,
  colorNum: 4,
  pixelSize: 2,
  /** Last fallback, after `color` and `colors[0]`. */
  color: "#808080",
} as const);

type Resolved = WithOptionalColour<DitherOptions>;

function validate(o: Resolved): void {
  validatePalette(o);
  validateCommon(o);
  assertFinite("waveSpeed", o.waveSpeed, 0);
  assertFinite("waveFrequency", o.waveFrequency, 0, false);
  assertFinite("waveAmplitude", o.waveAmplitude, 0);
  assertFinite("colorNum", o.colorNum, 2);
  assertFinite("pixelSize", o.pixelSize, 0, false);
  resolveColour(o, DITHER_DEFAULTS.color);
}

export function createDither(
  canvas: HTMLCanvasElement,
  opts: DitherOptions = {},
): EffectHandle<DitherOptions> {
  const o = merge<Resolved>(
    { ...COMMON_DEFAULTS, ...withoutColour(DITHER_DEFAULTS) },
    opts,
  );
  validate(o);
  const renderer = glRenderer({
    fragment: DITHER_FRAG,
    premultipliedAlpha: true,
    blend: false,
    uniforms(p, t, width, height, dpr) {
      const [r, g, b] = resolveColour(o, DITHER_DEFAULTS.color); // validated in validate()
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
  return createRuntime<DitherOptions>(
    canvas,
    asResolved<DitherOptions>(o),
    validate,
    renderer,
  );
}
