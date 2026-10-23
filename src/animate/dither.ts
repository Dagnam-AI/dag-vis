import { VisError, toVec3 } from "../core/index.js";
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
export const DITHER_DEFAULTS = {
  waveSpeed: 0.05,
  waveFrequency: 3,
  waveAmplitude: 0.3,
  colorNum: 4,
  pixelSize: 2,
  /** Last fallback, after `color` and `colors[0]`. */
  color: "#808080",
} as const;

/** `color` stays optional once resolved: the fallback to `colors[0]` is applied at draw time. */
type Resolved = Omit<ResolvedOptions<DitherOptions>, "color"> & {
  color?: string;
};

/** toVec3, with the failing option named in the error. */
function vec3(name: string, value: string): [number, number, number] {
  try {
    return toVec3(value);
  } catch (error) {
    throw new VisError(`${name}: ${(error as VisError).message}`);
  }
}

const colourOf = (o: Resolved): string =>
  o.color ?? o.colors?.[0] ?? DITHER_DEFAULTS.color;

function validate(o: Resolved): void {
  o.colors?.forEach((c, i) => vec3(`colors[${String(i)}]`, c));
  validateCommon(o);
  assertFinite("waveSpeed", o.waveSpeed, 0);
  assertFinite("waveFrequency", o.waveFrequency, 0, false);
  assertFinite("waveAmplitude", o.waveAmplitude, 0);
  assertFinite("colorNum", o.colorNum, 2);
  assertFinite("pixelSize", o.pixelSize, 0, false);
  vec3("color", colourOf(o));
}

export function createDither(
  canvas: HTMLCanvasElement,
  opts: DitherOptions = {},
): EffectHandle<DitherOptions> {
  const base: Resolved = { ...COMMON_DEFAULTS, ...DITHER_DEFAULTS };
  // The default colour is the last fallback in colourOf, not a stored option.
  delete base.color;
  const o = merge<Resolved>(base, opts);
  validate(o);
  const renderer = glRenderer({
    fragment: DITHER_FRAG,
    premultipliedAlpha: true,
    blend: false,
    uniforms(p, t, width, height, dpr) {
      const [r, g, b] = toVec3(colourOf(o)); // validated in validate()
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
    o as ResolvedOptions<DitherOptions>,
    validate,
    renderer,
  );
}
