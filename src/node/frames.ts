import { VisError } from "../core/index.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  integerIn,
} from "../core/validate.js";
import {
  MAX_FRAME_PIXELS,
  MAX_T,
  renderField,
  resolveField,
} from "../field/index.js";
import { gradientSvg } from "../gradient/index.js";
import type { GradientSpec } from "../gradient/index.js";
import { ribbon } from "../scene/index.js";
import type { RibbonSvgOptions } from "../scene/index.js";
import { encodePng } from "./png.js";
import { renderPng, renderRgba } from "./render-png.js";

/**
 * One drawing as frames. `background` (any CSS colour `renderPng` takes) flattens
 * transparency onto that colour, for formats that cannot hold it; field frames
 * are always opaque and ignore it. `svg` never takes one: SVG keeps its alpha.
 */
export interface FrameSource {
  /** false for gradient specs: vector, with no time axis */
  animated: boolean;
  /** `width * height * 4` bytes, STRAIGHT alpha, row 0 on top */
  rgba(t: number, background?: string): Promise<Uint8Array>;
  png(t: number, background?: string): Promise<Buffer>;
  svg(t: number): string;
}

/** Ribbon phase advance per second without a loop (rad/s); a loop advances 2*pi per period. */
const RIBBON_RATE = 0.5;

/** Field kinds are per-pixel, so their SVG is a labelled raster: `<image>` with the PNG inlined. Vector kinds stay vector. */
export function rasterSvg(png: Buffer, width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-dag-vis="raster-in-svg">` +
    `<!-- raster-in-SVG: field kinds are computed per pixel; vector kinds (gradient, pattern, scene, ribbon) stay true vector -->` +
    `<image width="${width}" height="${height}" href="data:image/png;base64,${png.toString("base64")}"/></svg>`
  );
}

/** Phase in radians at `t`: 0.5 rad/s, or one full turn per `loop` seconds so frames `loop` apart match. */
function ribbonPhase(t: number, loop: number | undefined): number {
  if (loop === undefined) return t * RIBBON_RATE;
  return (2 * Math.PI * (((t % loop) + loop) % loop)) / loop;
}

/** The kinds that exist as a field; `fluted` is also a gradient kind, so it needs a flow or fluid source to count. */
function isField(spec: { kind: string; source?: unknown }): boolean {
  if (spec.kind === "flow" || spec.kind === "fluid") return true;
  const source = spec.source as { kind?: unknown } | null | undefined;
  return (
    spec.kind === "fluted" &&
    typeof source === "object" &&
    source !== null &&
    (source.kind === "flow" || source.kind === "fluid")
  );
}

/** A promise for `run()`: a throw becomes a rejection, like the resvg-backed sources. */
const later = <T>(run: () => T): Promise<T> =>
  new Promise((resolve) => {
    resolve(run());
  });
const instant = (t: unknown): number => bounded("t", t, -MAX_T, MAX_T);
const flatten = (background: string | undefined): { background?: string } =>
  background === undefined ? {} : { background };

/**
 * One frame source per spec family: a CPU field (flow, fluid, fluted over a
 * flow or fluid), a ribbon drawn as SVG per frame and rasterised by resvg, or a
 * static gradient SVG. `width` and `height` are whole pixels (1..16384, at most
 * 2^25 pixels together); `loop` is a period in seconds above 0 that makes
 * frames `loop` apart identical. Everything that can be checked is checked
 * here, before any frame is asked for: a VisError names the parameter. Frames
 * are a pure function of the arguments.
 */
export function frameSource(
  spec: unknown,
  width: number,
  height: number,
  loop?: number,
): FrameSource {
  if (
    typeof spec !== "object" ||
    spec === null ||
    typeof (spec as { kind?: unknown }).kind !== "string"
  )
    throw new VisError(
      `spec must be an object with a string kind, got ${describeValue(spec)}`,
    );
  const named = spec as { kind: string; source?: unknown };
  integerIn("width", width, 1, MAX_DIMENSION);
  integerIn("height", height, 1, MAX_DIMENSION);
  if (width * height > MAX_FRAME_PIXELS)
    throw new VisError(
      `width x height must be at most ${MAX_FRAME_PIXELS} pixels, got ${width} x ${height}`,
    );
  const period =
    loop === undefined ? undefined : bounded("loop", loop, 0, MAX_T);
  if (period === 0) throw new VisError("loop must be above 0, got 0");

  if (isField(named)) {
    const resolved = resolveField(spec);
    const frame = (t: number) =>
      renderField(resolved, {
        width,
        height,
        t: instant(t),
        ...(period === undefined ? {} : { loop: period }),
      });
    const png = (t: number) => encodePng(frame(t).data, width, height);
    return {
      animated: true,
      rgba: (t) => later(() => new Uint8Array(frame(t).data.buffer)),
      png: (t) => later(() => png(t)),
      svg: (t) => rasterSvg(png(t), width, height),
    };
  }
  if (named.kind === "ribbon") {
    const options = { ...spec, width, height } as RibbonSvgOptions;
    const svg = (t: number) => ribbon(options, ribbonPhase(instant(t), period));
    svg(0); // the options are checked now, not at the first frame
    return {
      animated: true,
      svg,
      rgba: async (t, background) =>
        (await renderRgba(svg(t), { width, ...flatten(background) })).data,
      png: (t, background) =>
        renderPng(svg(t), { width, ...flatten(background) }),
    };
  }
  // Validates the spec; a VisError for a kind that is neither a field, a ribbon nor a gradient.
  const svg = gradientSvg(spec as GradientSpec, { width, height });
  return {
    animated: false,
    svg: () => svg,
    rgba: async (_t, background) =>
      (await renderRgba(svg, { width, ...flatten(background) })).data,
    png: (_t, background) => renderPng(svg, { width, ...flatten(background) }),
  };
}
