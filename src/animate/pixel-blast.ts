import { VisError, createRng } from "../core/index.js";
import {
  asResolved,
  resolveColour,
  validatePalette,
  withoutColour,
  type WithOptionalColour,
} from "./colour.js";
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
export const PIXEL_BLAST_DEFAULTS = Object.freeze({
  /** Last fallback, after `color` and `colors[0]`. */
  color: "#B497CF",
  pixelSize: 3,
  patternScale: 2,
  patternDensity: 1,
  edgeFade: 0.5,
  shape: "square",
} as const);

/** Today's component ran its clock at `speed = 0.5`; `speed: 1` here reproduces that. */
const TODAY_SPEED = 0.5;

type Resolved = WithOptionalColour<PixelBlastOptions>;

function validate(o: Resolved): void {
  validatePalette(o);
  validateCommon(o);
  if (!Object.hasOwn(SHAPES, o.shape))
    throw new VisError(
      `shape must be one of ${Object.keys(SHAPES).join(", ")}, got ${JSON.stringify(o.shape)}`,
    );
  assertFinite("pixelSize", o.pixelSize, 0, false);
  assertFinite("patternScale", o.patternScale, 0, false);
  assertFinite("patternDensity", o.patternDensity, 0);
  assertFinite("edgeFade", o.edgeFade, 0);
  resolveColour(o, PIXEL_BLAST_DEFAULTS.color);
}

export function createPixelBlast(
  canvas: HTMLCanvasElement,
  opts: PixelBlastOptions = {},
): EffectHandle<PixelBlastOptions> {
  const o = merge<Resolved>(
    { ...COMMON_DEFAULTS, ...withoutColour(PIXEL_BLAST_DEFAULTS) },
    opts,
  );
  validate(o);
  const renderer = glRenderer({
    fragment: PIXEL_BLAST_FRAG,
    premultipliedAlpha: true,
    blend: true,
    uniforms(p, t, width, height, dpr) {
      const [r, g, b] = resolveColour(o, PIXEL_BLAST_DEFAULTS.color); // validated in validate()
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
    asResolved<PixelBlastOptions>(o),
    validate,
    renderer,
  );
}
