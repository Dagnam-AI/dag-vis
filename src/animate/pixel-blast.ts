import { VisError, createRng, toVec3 } from "../core/index.js";
import { glRenderer } from "./gl.js";
import { PIXEL_BLAST_FRAG } from "./pixel-blast.glsl.js";
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

export type PixelShape = "square" | "circle" | "triangle" | "diamond";
const SHAPES: Record<PixelShape, number> = {
  square: 0,
  circle: 1,
  triangle: 2,
  diamond: 3,
};

export interface PixelBlastOptions extends EffectOptions {
  /**
   * Pixel colour (sRGB CSS colour, passed straight through: today's three.js
   * linearise + shader re-encode was an identity). Falls back to `colors[0]`,
   * resolved on every frame so `update({ colors })` takes effect.
   */
  color?: string;
  /** Pixel size in CSS px (uploaded × dpr). */
  pixelSize?: number;
  patternScale?: number;
  patternDensity?: number;
  edgeFade?: number;
  shape?: PixelShape;
}

/** Today's `<PixelBlast>` defaults (the non-liquid subset). */
export const PIXEL_BLAST_DEFAULTS = {
  /** Last fallback, after `color` and `colors[0]`. */
  color: "#B497CF",
  pixelSize: 3,
  patternScale: 2,
  patternDensity: 1,
  edgeFade: 0.5,
  shape: "square" as PixelShape,
};

/** Today's component ran its clock at `speed = 0.5`; `speed: 1` here reproduces that. */
const TODAY_SPEED = 0.5;

/** `color` stays optional once resolved: the fallback to `colors[0]` is applied at draw time. */
type Resolved = Omit<ResolvedOptions<PixelBlastOptions>, "color"> & {
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
  o.color ?? o.colors?.[0] ?? PIXEL_BLAST_DEFAULTS.color;

function validate(o: Resolved): void {
  o.colors?.forEach((c, i) => vec3(`colors[${String(i)}]`, c));
  validateCommon(o);
  if (!Object.hasOwn(SHAPES, o.shape))
    throw new VisError(
      `shape must be one of ${Object.keys(SHAPES).join(", ")}, got ${JSON.stringify(o.shape)}`,
    );
  assertFinite("pixelSize", o.pixelSize, 0, false);
  assertFinite("patternScale", o.patternScale, 0, false);
  assertFinite("patternDensity", o.patternDensity, 0);
  assertFinite("edgeFade", o.edgeFade, 0);
  vec3("color", colourOf(o));
}

export function createPixelBlast(
  canvas: HTMLCanvasElement,
  opts: PixelBlastOptions = {},
): EffectHandle<PixelBlastOptions> {
  const base: Resolved = { ...COMMON_DEFAULTS, ...PIXEL_BLAST_DEFAULTS };
  // The default colour is the last fallback in colourOf, not a stored option.
  delete base.color;
  const o = merge<Resolved>(base, opts);
  validate(o);
  const renderer = glRenderer({
    fragment: PIXEL_BLAST_FRAG,
    premultipliedAlpha: true,
    blend: true,
    uniforms(p, t, width, height, dpr) {
      const [r, g, b] = toVec3(colourOf(o)); // validated in validate()
      // Today: `timeOffset = crypto-random × 1000`; here the phase comes from the seed.
      const offset = createRng(o.seed).next() * 1000;
      p.f2("uResolution", width, height);
      p.f1("uTime", offset + t * TODAY_SPEED);
      p.f3("uColor", r, g, b);
      p.f1("uPixelSize", o.pixelSize * dpr);
      p.f1("uScale", o.patternScale);
      p.f1("uDensity", o.patternDensity);
      p.f1("uEdgeFade", o.edgeFade);
      p.i1("uShapeType", SHAPES[o.shape]);
    },
  });
  return createRuntime<PixelBlastOptions>(
    canvas,
    o as ResolvedOptions<PixelBlastOptions>,
    validate,
    renderer,
  );
}
