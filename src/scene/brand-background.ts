import { LOGO } from "../brand/logo.js";
import { BRAND } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { focalScale, focalTransform } from "../core/geometry.js";
import { el, svgDoc } from "../core/svg.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  integerIn,
  orDefault,
  parseId,
  parsePaint,
  parseSeed,
  within,
} from "../core/validate.js";
import type { Paint } from "../core/validate.js";
import { gradient } from "../gradient/index.js";
import type { GradientSpec } from "../gradient/index.js";
import { pattern } from "../pattern/index.js";
import type { PatternSpec } from "../pattern/index.js";

export interface BrandBackgroundOptions {
  /** Canvas size in px, each side 1..16384. */
  width: number;
  height: number;
  /** Solid colour or any gradient spec. Default "#08080a". */
  base?: string | GradientSpec;
  /**
   * 1..64 colours; `palette[0]` colours the band, hairlines and glow (its
   * alpha is honoured). Default `[BRAND.accent.dark]`: the dark theme's deep red, never the bright BRAND.red, which washes pink over a dark base.
   */
  palette?: readonly string[];
  /** Motif centre in unit coords, each 0..1. Default [0.82, 0.5]. */
  focus?: readonly [number, number];
  /** Motif larger side as a multiple of the short canvas side, 0.01..50. Default 1.5. */
  scale?: number;
  /** Band fill opacity 0..1 at the motif's right edge; it fades to nothing leftwards. Default 0.12. */
  band?: number;
  /**
   * Opacity 0..1 of the motif's own outline: a crisp `hairlineWidth` stroke with a
   * faint glow either side, faded leftwards like the band. 0 draws none. Default 1.
   */
  edge?: number;
  /** Offset stroke copies of the curves (faded leftwards like the band), integer 0..16. Default 3. */
  hairlines?: number;
  /** Stroke width in output px (the motif's scale is divided out), 0.001..64. Default 1.8. */
  hairlineWidth?: number;
  /** Offset between copies as a fraction of the motif size, 0..1. Default 0.04. */
  hairlineGap?: number;
  /** Glow opacity 0..1. Default 0.85. */
  glow?: number;
  /** Glow centre in unit coords. Default [0.98, 0.52]: at the right edge, where the deep red pools. */
  glowAt?: readonly [number, number];
  /** Default = palette[0]. */
  glowColor?: string;
  /** Fraction of the short side, 0.01..10. Default 0.6. */
  glowRadius?: number;
  /**
   * A pattern laid over the glow. Its `size` and `idPrefix` are set here; its
   * `seed` defaults to this scene's.
   */
  pattern?: PatternSpec;
  /** Edge darkening 0..1. Default 0.5. */
  vignette?: number;
  /** Safe integer. Seeds a seeded `base`/`pattern` that has no seed of its own, and the default id. Default 1. */
  seed?: number;
  /**
   * `<defs>` id namespace: a letter or `_`, then up to 59 letters, digits, `_`
   * or `-` (the pattern layer appends `-pat-p`, within its own 64-character cap).
   * Default `"vis" + seed`.
   */
  idPrefix?: string;
}

const MAX_HAIRLINES = 16;
const DEFAULT_PALETTE = [BRAND.accent.dark];
/** [gradient offset, share of the glow opacity]: close to a Gaussian, and exactly zero at the radius. */
const GLOW_FALLOFF = [
  [0, 1],
  [0.3, 0.6],
  [0.6, 0.22],
  [1, 0],
] as const;
/** [stroke width as a multiple of `hairlineWidth`, share of the `edge` opacity]: glow, glow, crisp line. */
const EDGE_STROKES = [
  [7, 0.07],
  [3.5, 0.14],
  [1, 1],
] as const;
const MAX_PALETTE = 64;
const MAX_SCALE = 50;

function unit(name: string, v: unknown): number {
  return bounded(name, v, 0, 1);
}

function point(name: string, v: unknown): readonly [number, number] {
  if (!Array.isArray(v) || v.length !== 2)
    throw new VisError(`${name} must be [x, y], got ${describeValue(v)}`);
  const [x, y] = v as unknown[];
  return [unit(`${name}[0]`, x), unit(`${name}[1]`, y)];
}

/** The accent (first colour), with every other colour validated too. */
function parsePalette(v: unknown): Paint {
  if (!Array.isArray(v))
    throw new VisError(
      `palette must be an array of 1..${MAX_PALETTE} colours, got ${describeValue(v)}`,
    );
  if (v.length < 1 || v.length > MAX_PALETTE)
    throw new VisError(
      `palette must hold 1..${MAX_PALETTE} colours, got ${v.length}`,
    );
  const colours = v as unknown[];
  const first = parsePaint("palette[0]", colours[0]);
  colours.slice(1).forEach((c, i) => {
    parsePaint(`palette[${i + 1}]`, c);
  });
  return first;
}

/** The og-default background as `<defs>` + body, for composition. */
export function brandBackgroundLayers(opts: BrandBackgroundOptions): {
  defs: string;
  body: string;
} {
  // JS callers can pass anything.
  const input: unknown = opts;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `options must be an object, got ${describeValue(input)}`,
    );
  const width = bounded("width", opts.width, 1, MAX_DIMENSION);
  const height = bounded("height", opts.height, 1, MAX_DIMENSION);
  const seed = parseSeed(opts.seed);
  const id = parseId(
    "idPrefix",
    orDefault<unknown>(opts.idPrefix, `vis${seed}`),
    60,
  );
  const accent = parsePalette(
    orDefault<unknown>(opts.palette, DEFAULT_PALETTE),
  );
  const focus = point("focus", orDefault<unknown>(opts.focus, [0.82, 0.5]));
  const scale = bounded(
    "scale",
    orDefault<unknown>(opts.scale, 1.5),
    0.01,
    MAX_SCALE,
  );
  const band = unit("band", orDefault<unknown>(opts.band, 0.12));
  const edge = unit("edge", orDefault<unknown>(opts.edge, 1));
  const hairlines = integerIn(
    "hairlines",
    orDefault<unknown>(opts.hairlines, 3),
    0,
    MAX_HAIRLINES,
  );
  const hairlineWidth = bounded(
    "hairlineWidth",
    orDefault<unknown>(opts.hairlineWidth, 1.8),
    0.001,
    64,
  );
  const hairlineGap = unit(
    "hairlineGap",
    orDefault<unknown>(opts.hairlineGap, 0.04),
  );
  const glow = unit("glow", orDefault<unknown>(opts.glow, 0.85));
  const glowAt = point("glowAt", orDefault<unknown>(opts.glowAt, [0.98, 0.52]));
  const glowPaint =
    opts.glowColor === undefined
      ? accent
      : parsePaint("glowColor", opts.glowColor);
  const glowRadius = bounded(
    "glowRadius",
    orDefault<unknown>(opts.glowRadius, 0.6),
    0.01,
    10,
  );
  const vignette = unit("vignette", orDefault<unknown>(opts.vignette, 0.5));
  const minSide = Math.min(width, height);

  let defs = "";
  const body: string[] = [];

  // 1. base
  const base = orDefault<unknown>(opts.base, "#08080a");
  if (typeof base === "string") {
    const p = parsePaint("base", base);
    body.push(
      el("rect", {
        width,
        height,
        fill: p.hex,
        "fill-opacity": p.alpha < 1 ? p.alpha : undefined,
      }),
    );
  } else if (typeof base === "object" && base !== null) {
    const spec = base as GradientSpec;
    const g = within("base", () =>
      gradient({
        ...spec,
        seed: orDefault(spec.seed, seed),
        size: { width, height },
        idPrefix: `${id}-base`,
      }),
    );
    defs += g.defs;
    body.push(g.svg);
  } else {
    throw new VisError(
      `base must be a colour string or a gradient spec, got ${describeValue(base)}`,
    );
  }

  // 2. band + 3. hairlines, in motif space
  const bandId = `${id}-band`;
  defs += el(
    "linearGradient",
    { id: bandId, x1: 0, y1: 0, x2: 1, y2: 0 },
    el("stop", { offset: 0, "stop-color": accent.hex, "stop-opacity": 0 }),
    el("stop", {
      offset: 0.55,
      "stop-color": accent.hex,
      "stop-opacity": band * accent.alpha * 0.3,
    }),
    el("stop", {
      offset: 1,
      "stop-color": accent.hex,
      "stop-opacity": band * accent.alpha,
    }),
  );
  // Hairlines fade in with the band, so the motif's left edge never shows.
  const hairId = `${id}-hair`;
  if (hairlines > 0 || edge > 0)
    defs += el(
      "linearGradient",
      { id: hairId, x1: 0, y1: 0, x2: 1, y2: 0 },
      el("stop", { offset: 0, "stop-color": accent.hex, "stop-opacity": 0 }),
      el("stop", {
        offset: 0.55,
        "stop-color": accent.hex,
        "stop-opacity": 0.45,
      }),
      el("stop", { offset: 1, "stop-color": accent.hex, "stop-opacity": 1 }),
    );
  const motif = { width: LOGO.width, height: LOGO.height };
  const transform = `${focalTransform({ width, height, focus, scale, motif })} translate(${fmt(-LOGO.x)} ${fmt(-LOGO.y)})`;
  // The motif's scale, as focalTransform computes it. resvg ignores
  // vector-effect="non-scaling-stroke", so the stroke is divided by it here to
  // come out `hairlineWidth` px wide in every renderer.
  const k = focalScale({ width, height, scale, motif });
  const curves: string[] = [
    el("path", { d: LOGO.path, fill: `url(#${bandId})` }),
  ];
  // The outline itself: a crisp line over two wider, fainter strokes (no filter, so
  // every renderer draws the same glow and nothing bands).
  if (edge > 0)
    for (const [widen, weight] of EDGE_STROKES)
      curves.push(
        el("path", {
          d: LOGO.path,
          fill: "none",
          stroke: `url(#${hairId})`,
          "stroke-width": (hairlineWidth * widen) / k,
          "stroke-linejoin": "round",
          opacity: edge * weight * accent.alpha,
        }),
      );
  for (let i = 1; i <= hairlines; i++) {
    const dx = i * hairlineGap * LOGO.width;
    curves.push(
      el("path", {
        d: LOGO.path,
        fill: "none",
        stroke: `url(#${hairId})`,
        "stroke-width": hairlineWidth / k,
        opacity: 0.5 * 0.6 ** (i - 1) * accent.alpha,
        transform: `translate(${fmt(dx)} ${fmt(-dx * 0.3)})`,
      }),
    );
  }
  body.push(el("g", { transform }, ...curves));

  // 4. glow
  if (glow > 0) {
    const glowId = `${id}-glow`;
    defs += el(
      "radialGradient",
      {
        id: glowId,
        gradientUnits: "userSpaceOnUse",
        cx: glowAt[0] * width,
        cy: glowAt[1] * height,
        r: glowRadius * minSide,
      },
      // Eased out, not linear: a straight line to zero leaves a visible wall at the radius.
      ...GLOW_FALLOFF.map(([offset, share]) =>
        el("stop", {
          offset,
          "stop-color": glowPaint.hex,
          "stop-opacity": glow * glowPaint.alpha * share,
        }),
      ),
    );
    body.push(el("rect", { width, height, fill: `url(#${glowId})` }));
  }

  // 5. pattern
  if (opts.pattern !== undefined) {
    const spec: unknown = opts.pattern;
    if (typeof spec !== "object" || spec === null)
      throw new VisError(
        `pattern must be a pattern spec object, got ${describeValue(spec)}`,
      );
    const given = opts.pattern;
    const p = within("pattern", () =>
      pattern({
        ...given,
        seed: orDefault(given.seed, seed),
        size: { width, height },
        idPrefix: `${id}-pat`,
      }),
    );
    defs += p.defs;
    body.push(el("rect", { width, height, fill: p.fill }));
  }

  // 6. vignette
  if (vignette > 0) {
    const vigId = `${id}-vig`;
    defs += el(
      "radialGradient",
      {
        id: vigId,
        gradientUnits: "userSpaceOnUse",
        cx: width / 2,
        cy: height / 2,
        r: 0.75 * Math.max(width, height),
      },
      el("stop", { offset: 0.55, "stop-color": "#000000", "stop-opacity": 0 }),
      el("stop", {
        offset: 1,
        "stop-color": "#000000",
        "stop-opacity": vignette,
      }),
    );
    body.push(el("rect", { width, height, fill: `url(#${vigId})` }));
  }

  return { defs, body: body.join("") };
}

/** The og-default background as a standalone SVG. */
export function brandBackground(opts: BrandBackgroundOptions): string {
  const { defs, body } = brandBackgroundLayers(opts);
  return svgDoc(
    { width: opts.width, height: opts.height },
    el("defs", {}, defs),
    body,
  );
}
