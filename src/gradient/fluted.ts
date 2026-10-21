import { toCss } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import type { Ctx, FlutedSpec, KindOutput } from "./types.js";

const DIRECTIONS = ["vertical", "horizontal", "angle"] as const;
const MAX_REEDS = 256;
/** Edge shade of one reed: dark at its start, clear in the middle, light at its end. */
const DARK = 0.6;
const LIGHT = 0.5;
const DARK_END = 0.35;
const LIGHT_START = 0.75;

/** JS callers can pass anything; renderKind would fail on a property read of `undefined`. */
function assertSource(source: unknown): void {
  if (typeof source !== "object" || source === null)
    throw new VisError(
      `fluted needs a \`source\` gradient spec, got ${JSON.stringify(source)}`,
    );
}

/**
 * Fluted / "fractal glass": the source gradient seen through N reeds.
 *
 * A reed is a strip of the canvas. The reed shows the source scaled by `1 - refraction`
 * about the reed's centre line (nudged by seeded jitter), with a dark-to-clear-to-light
 * edge shade over it. Strips run along the canvas for "vertical" and "horizontal"; for
 * "angle" they are rotated by `angle` about the canvas centre and cover the whole canvas.
 * The source itself stays upright: only the strips and the scaling axis rotate.
 *
 * CSS cannot rescale the source per reed, so its output is the unrefracted source with the
 * same reed shade on top (a `repeating-linear-gradient` with one reed per period); with
 * `refraction` 0 the two outputs are the same picture.
 */
export function renderFluted(spec: FlutedSpec, ctx: Ctx): KindOutput {
  const reeds = spec.reeds ?? 24;
  if (!Number.isInteger(reeds) || reeds < 2 || reeds > MAX_REEDS)
    throw new VisError(
      `fluted reeds must be an integer in 2..${MAX_REEDS}, got ${String(reeds)}`,
    );
  const refraction = spec.refraction ?? 0.35;
  const shade = spec.shade ?? 0.5;
  for (const [k, v] of [
    ["refraction", refraction],
    ["shade", shade],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 1)
      throw new VisError(`fluted ${k} must be in 0..1, got ${String(v)}`);
  }
  const direction: string = spec.direction ?? "vertical"; // JS callers can pass anything
  if (!(DIRECTIONS as readonly string[]).includes(direction))
    throw new VisError(
      `fluted direction must be one of ${DIRECTIONS.join(", ")}, got ${JSON.stringify(direction)}`,
    );
  const angle = spec.angle ?? 20;
  if (!Number.isFinite(angle))
    throw new VisError(
      `fluted angle must be a finite number, got ${String(angle)}`,
    );
  assertSource(spec.source);
  const { width, height } = ctx.size;
  const source = ctx.render(spec.source, `${ctx.id}-src`);
  const id = `${ctx.id}-g`;
  const shadeId = `${ctx.id}-shade`;
  const horizontal = direction === "horizontal";
  const a = direction === "angle" ? angle : 0;
  const cos = Math.cos((a * Math.PI) / 180);
  const sin = Math.sin((a * Math.PI) / 180);
  // `along` is the extent the reeds divide (the canvas projected on the reed normal),
  // `across` the extent each reed runs over (the projection on the reed axis).
  const along = horizontal
    ? height
    : Math.abs(width * cos) + Math.abs(height * sin);
  const across = horizontal
    ? width
    : Math.abs(width * sin) + Math.abs(height * cos);
  const origin = horizontal ? 0 : width / 2 - along / 2;
  const lateral = horizontal ? 0 : height / 2 - across / 2;
  const reedSize = along / reeds;
  const k = 1 - refraction;
  const turn = (deg: number): string =>
    `rotate(${fmt(deg)} ${fmt(width / 2)} ${fmt(height / 2)})`;
  // The reeds' frame is the canvas rotated by `a`; a strip is a rect in that frame.
  const strip = (
    start: number,
  ): Record<string, number | string | undefined> => ({
    x: horizontal ? 0 : start,
    y: horizontal ? start : lateral,
    width: horizontal ? across : reedSize,
    height: horizontal ? reedSize : across,
    transform: a === 0 ? undefined : turn(a),
  });
  const clips: string[] = [];
  const pieces: string[] = [];
  for (let i = 0; i < reeds; i++) {
    const start = origin + i * reedSize;
    const centre = start + reedSize / 2;
    const jitter = ctx.rng.range(-0.5, 0.5) * refraction * reedSize;
    const cid = `${ctx.id}-c${i}`;
    clips.push(el("clipPath", { id: cid }, el("rect", strip(start))));
    // Scale about the reed centre in the reeds' frame: M * T * M^-1 on an upright source.
    const scaled = horizontal
      ? `translate(0 ${fmt(centre + jitter)}) scale(1 ${fmt(k)}) translate(0 ${fmt(-centre)})`
      : `translate(${fmt(centre + jitter)} 0) scale(${fmt(k)} 1) translate(${fmt(-centre)} 0)`;
    pieces.push(
      el(
        "g",
        { "clip-path": `url(#${cid})` },
        el("rect", {
          width,
          height,
          fill: source.fill,
          transform: a === 0 ? scaled : `${turn(a)} ${scaled} ${turn(-a)}`,
        }),
        shade > 0
          ? el("rect", {
              ...strip(start),
              fill: `url(#${shadeId})`,
              opacity: shade,
            })
          : "",
      ),
    );
  }
  const shadeDefs =
    shade > 0
      ? el(
          "linearGradient",
          horizontal
            ? { id: shadeId, x1: 0, y1: 0, x2: 0, y2: 1 }
            : { id: shadeId, x1: 0, y1: 0, x2: 1, y2: 0 },
          el("stop", {
            offset: 0,
            "stop-color": "#000000",
            "stop-opacity": DARK,
          }),
          el("stop", {
            offset: DARK_END,
            "stop-color": "#000000",
            "stop-opacity": 0,
          }),
          el("stop", {
            offset: LIGHT_START,
            "stop-color": "#ffffff",
            "stop-opacity": 0,
          }),
          el("stop", {
            offset: 1,
            "stop-color": "#ffffff",
            "stop-opacity": LIGHT,
          }),
        )
      : "";
  const out: KindOutput = {
    defs:
      source.defs +
      shadeDefs +
      clips.join("") +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        el("rect", { width, height, fill: source.fill }),
        ...pieces,
      ),
    fill: `url(#${id})`,
    cssImages: source.cssImages,
  };
  if (source.cssBlend !== undefined) out.cssBlend = source.cssBlend;
  if (shade > 0) {
    // The gradient line of a CSS angle theta starts at the reeds' first edge, so
    // positions along it are the reeds' own coordinates, one period per reed.
    const stop = (c: 0 | 1, alpha: number, at: number): string =>
      `${toCss({ r: c, g: c, b: c, a: alpha })} ${fmt(at * reedSize)}px`;
    out.cssImages = [
      `repeating-linear-gradient(${fmt(horizontal ? 180 : 90 + a)}deg, ${[
        stop(0, DARK * shade, 0),
        stop(0, 0, DARK_END),
        stop(1, 0, LIGHT_START),
        stop(1, LIGHT * shade, 1),
      ].join(", ")})`,
      ...source.cssImages,
    ];
    if (source.cssBlend !== undefined)
      out.cssBlend = `normal, ${source.cssBlend}`;
  }
  return out;
}
