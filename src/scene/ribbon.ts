import { VisError } from "../core/errors.js";
import { el, svgDoc } from "../core/svg.js";
import { fmt } from "../core/format.js";
import {
  bounded,
  describeValue,
  finite,
  integerIn,
  orDefault,
  parseId,
  parsePaint,
  within,
} from "../core/validate.js";
import type { Paint } from "../core/validate.js";
import { gradient } from "../gradient/index.js";
import type { GradientSpec } from "../gradient/index.js";
import { curvesAt, parseRibbon } from "./ribbon-curves.js";
import type { RibbonConfig, RibbonOptions } from "./ribbon-curves.js";

/**
 * A static SVG ribbon. SVG only: there is no CSS form (a CSS background cannot
 * draw a family of curves); the animated renderer draws the same curves on a
 * canvas.
 */
export interface RibbonSvgOptions extends RibbonOptions {
  /**
   * 2..64 colours, spread evenly along the straight line from the spine's start to
   * its end; a bent spine does not bend the gradient (alpha honoured). Default `["#ef4444", "#7c3aed", "#10abba"]`.
   */
  colors?: readonly string[];
  /** Solid colour or any gradient spec. Default none (transparent). */
  background?: string | GradientSpec;
  /** Stroke width in output px, 0.001..64. Default 1. */
  strokeWidth?: number;
  /** Opacity of the whole ribbon, applied once to the group, 0..1. Default 0.8. */
  opacity?: number;
  /** Also draw the cross-section family: one polyline through the same sample of every curve. Default false. */
  mesh?: boolean;
  /** Cross-lines when `mesh`, integer 1..`samples`, spread evenly along the curves. Default `min(24, samples)`. */
  meshLines?: number;
  /**
   * `<defs>` id namespace: a letter or `_`, then up to 59 letters, digits, `_`
   * or `-` (a background gradient appends `-bg`, within its own 64-character
   * cap). Default `"vis" + seed`.
   */
  idPrefix?: string;
}

const DEFAULT_COLORS = ["#ef4444", "#7c3aed", "#10abba"];
const MAX_COLORS = 64;
/**
 * Most points one SVG may draw (curves plus mesh cross-lines). At the
 * largest canvas that is about 2 MB of path data; the default look is a tenth
 * of the limit.
 */
const MAX_SVG_POINTS = 100_000;

/** Every colour parsed, 2..64 of them. */
function parseColors(v: unknown): Paint[] {
  if (!Array.isArray(v))
    throw new VisError(
      `colors must be an array of 2..${MAX_COLORS} colours, got ${describeValue(v)}`,
    );
  if (v.length < 2 || v.length > MAX_COLORS)
    throw new VisError(
      `colors must hold 2..${MAX_COLORS} colours, got ${v.length}`,
    );
  return (v as unknown[]).map((c, i) => parsePaint(`colors[${i}]`, c));
}

/** The direction the stroke gradient runs: spine start to end, or to the farthest point of a closed spine. */
function strokeAxis(
  spine: RibbonConfig["spine"],
): [number, number, number, number] {
  const [first, second, ...others] = spine;
  const dist = (p: readonly [number, number]): number =>
    Math.hypot(p[0] - first[0], p[1] - first[1]);
  const last = others.at(-1) ?? second;
  const farthest = others.reduce(
    (far, p) => (dist(p) > dist(far) ? p : far),
    second,
  );
  // A closed spine ends where it began: there is no direction to run to, so run to its farthest point.
  const to = dist(last) > 0 ? last : farthest;
  return [first[0], first[1], to[0], to[1]];
}

/** `M x y L x y ...` for one polyline. */
const pathData = (pts: readonly (readonly [number, number])[]): string =>
  `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}`;

/**
 * The wave-mesh ribbon as a standalone SVG: `lines` thin curves stroked with a
 * gradient that runs along the spine, optionally over a background, optionally
 * with the cross-section family. The curves are exactly `ribbonCurves(opts)`.
 * Deterministic per seed. SVG only. `phase` (radians, any finite number,
 * default 0) advances the motion exactly as `ribbonCurves` does: the same
 * ribbon, moved, periodic with period 2*pi.
 *
 * @throws VisError naming the offending option and value; also when the
 *   drawing would exceed 100000 points (lower `lines`, `samples` or `meshLines`).
 */
export function ribbon(opts: RibbonSvgOptions, phase = 0): string {
  const cfg = parseRibbon(opts);
  const shift = finite("phase", phase);
  const { width, height, lines, samples } = cfg;
  const id = parseId(
    "idPrefix",
    orDefault<unknown>(opts.idPrefix, `vis${cfg.seed}`),
    60,
  );
  const colors = parseColors(orDefault<unknown>(opts.colors, DEFAULT_COLORS));
  const strokeWidth = bounded(
    "strokeWidth",
    orDefault<unknown>(opts.strokeWidth, 1),
    0.001,
    64,
  );
  const opacity = bounded(
    "opacity",
    orDefault<unknown>(opts.opacity, 0.8),
    0,
    1,
  );
  const mesh = orDefault<unknown>(opts.mesh, false);
  if (typeof mesh !== "boolean")
    throw new VisError(`mesh must be a boolean, got ${describeValue(mesh)}`);
  const meshLines = integerIn(
    "meshLines",
    orDefault<unknown>(opts.meshLines, Math.min(24, samples)),
    1,
    samples,
  );
  const points = lines * (samples + (mesh ? meshLines : 0));
  if (points > MAX_SVG_POINTS)
    throw new VisError(
      `ribbon would draw ${points} points (lines x samples, plus lines x meshLines with a mesh); the limit is ${MAX_SVG_POINTS}: lower lines, samples or meshLines`,
    );

  let defs = "";
  const body: string[] = [];
  const background: unknown = opts.background;
  if (typeof background === "string") {
    const p = parsePaint("background", background);
    body.push(
      el("rect", {
        width,
        height,
        fill: p.hex,
        "fill-opacity": p.alpha < 1 ? p.alpha : undefined,
      }),
    );
  } else if (
    typeof background === "object" &&
    background !== null &&
    !Array.isArray(background)
  ) {
    const spec = background as GradientSpec;
    const g = within("background", () =>
      gradient({
        ...spec,
        seed: orDefault(spec.seed, cfg.seed),
        size: { width, height },
        idPrefix: `${id}-bg`,
      }),
    );
    defs += g.defs;
    body.push(g.svg);
  } else if (background !== undefined) {
    throw new VisError(
      `background must be a colour string or a gradient spec, got ${describeValue(background)}`,
    );
  }

  // The colours run along the undisplaced spine, start to end, in canvas px.
  const [x1, y1, x2, y2] = strokeAxis(cfg.spine);
  const gradId = `${id}-ribbon`;
  defs += el(
    "linearGradient",
    { id: gradId, gradientUnits: "userSpaceOnUse", x1, y1, x2, y2 },
    ...colors.map((c, i) =>
      el("stop", {
        offset: i / (colors.length - 1),
        "stop-color": c.hex,
        "stop-opacity": c.alpha < 1 ? c.alpha : undefined,
      }),
    ),
  );

  const curves = curvesAt(cfg, shift);
  const strokes = curves.map((c) => el("path", { d: pathData(c) }));
  // A cross-line joins one point per curve, so a single curve has none to draw.
  if (mesh && lines > 1)
    for (let k = 0; k < meshLines; k++) {
      // Evenly spread over the samples; one cross-line is the first sample.
      const j = Math.round((k / Math.max(meshLines - 1, 1)) * (samples - 1));
      strokes.push(
        el("path", { d: pathData(curves.flatMap((c) => c.slice(j, j + 1))) }),
      );
    }
  body.push(
    el(
      "g",
      {
        opacity,
        fill: "none",
        stroke: `url(#${gradId})`,
        "stroke-width": strokeWidth,
        "stroke-linejoin": "round",
      },
      ...strokes,
    ),
  );
  return svgDoc({ width, height }, el("defs", {}, defs), ...body);
}
