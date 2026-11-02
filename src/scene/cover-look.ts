import { createRng } from "../core/rng.js";
import type { GlowPoint, GradientSpec } from "../gradient/index.js";
import type { PatternSpec } from "../pattern/index.js";
import { BRAND_HUE, derive, fnv1a32, parse, round } from "./cover.js";
import type { CoverParams } from "./cover.js";
import {
  BANNER_SIZE,
  BANNER_ZONE,
  CARD_SIZE,
  scrimFor,
} from "./cover-contrast.js";
import { parseLookName } from "./cover-look-types.js";
import type {
  CoverLook,
  CoverLookInput,
  CoverLookName,
  CoverPalette,
  CoverTexture,
} from "./cover-look-types.js";
import { coverPalette, withA } from "./cover-palette.js";

/**
 * Where each look's share of a 0..100 roll ends, in percent (ember 35, aurora 25, contour
 * 15, silk 15); halftone takes the remaining 10.
 */
const CUTS: readonly (readonly [CoverLookName, number])[] = [
  ["ember", 35],
  ["aurora", 60],
  ["contour", 75],
  ["silk", 90],
];

/** The look a family gets when none is pinned: its own random stream, so `coverParams` draws are untouched. */
export function pickLook(familyKey: string): CoverLookName {
  const roll = createRng(fnv1a32(`look:${familyKey}`)).next() * 100;
  for (const [name, upTo] of CUTS) if (roll < upTo) return name;
  return "halftone";
}

type Pair = [number, number];

/**
 * A look takes the family's hue drift from the glows cover's +-15 degree range but
 * compresses it and leans warm: at the cooler end of that range OKLCH red turns crimson
 * and then pink, which on near black reads as washed magenta. The item's own spread (the
 * lessons of one chapter) is NOT compressed, it is widened: siblings must read as
 * different colours, from red to ember, so they do not look like duplicates in a grid.
 * The result stays within `min`..`max` degrees: below it OKLCH red turns crimson.
 */
const LOOK_HUE = { centre: 40, share: 0.4, itemGain: 1.5, min: 28, max: 54 };
/**
 * The lessons of an ordered family walk their glow round an ellipse about the family's
 * region (pulled `pull` of the way to the centre so the walk stays in the box), by index:
 * `x` and `y` percent of the box either way, so each sibling lights a different place.
 */
const WALK = { x: 20, y: 12, pull: 0.6 };
/** The glow stays this far inside the box edges (percent). */
const EDGE = { min: 12, max: 88 };
/** A light cover's glows reach this fraction of a dark one's: crisp accents, never a wash. */
const LIGHT_REACH = 0.65;

/** What a look builder gets: the derivation, the palette and the shared geometry. */
interface Ctx {
  dark: boolean;
  banner: boolean;
  pal: CoverPalette;
  /** The editor's intensity, scaling every glow's alpha. */
  k: number;
  /** The main glow's centre and size in percent, and its mirror. */
  at: Pair;
  echo: Pair;
  size: Pair;
  /** CSS angle of the floor gradient: from the light, across the box. */
  tilt: number;
  /** Seeds the family-level randomness (aurora blobs, contour rings, the grain). */
  seed: number;
}

interface Built {
  layers: GradientSpec[];
  grain: number;
  texture: CoverTexture | null;
}

const TRANSPARENT = "rgba(0,0,0,0)";
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const pct = (v: number): number => Math.min(100, Math.max(0, round(v)));

/** A glow of `hex` at `alpha` (before the editor's intensity). */
const glow = (
  c: Ctx,
  hex: string,
  size: Pair,
  at: Pair,
  alpha: number,
): GlowPoint => ({
  size: [round(size[0]), round(size[1])],
  at: [pct(at[0]), pct(at[1])],
  color: withA(hex, Math.min(1, r3(alpha * c.k))),
});

/** `glows` over nothing, bottom first. */
const glows = (list: GlowPoint[]): GradientSpec => ({
  kind: "glows",
  base: TRANSPARENT,
  glows: list,
});

/** The floor: deep colour near the light, easing to the page. */
const floor = (c: Ctx): GradientSpec => ({
  kind: "linear",
  angle: c.tilt,
  stops: [
    { color: c.pal.deep, at: 0 },
    { color: c.pal.base, at: 0.7 },
  ],
});

/** Dark covers darken towards the edges so the title sits in shadow; light covers stay clean. */
const vignette = (c: Ctx): GradientSpec[] =>
  c.dark
    ? [
        {
          kind: "radial",
          shape: "ellipse",
          at: [0.5, 0.5],
          radius: 0.75,
          stops: [
            { color: TRANSPARENT, at: 0.45 },
            { color: "rgba(0,0,0,0.55)", at: 1 },
          ],
        },
      ]
    : [];

const mask = (
  c: Ctx,
  radius: Pair,
  floorLevel: number,
): CoverTexture["mask"] => ({
  at: [pct(c.at[0]), pct(c.at[1])],
  radius,
  floor: floorLevel,
});

const texture = (
  c: Ctx,
  pattern: PatternSpec,
  opacity: number,
  radius: Pair,
  floorLevel: number,
): CoverTexture => ({
  pattern,
  opacity,
  mask: mask(c, radius, floorLevel),
});

/**
 * The main glow's core, a little up and left of its centre: the ember's pale hot centre on
 * dark, a deep ruby on light (a white core would read as a bullseye).
 */
const core = (c: Ctx, alpha: number): GlowPoint =>
  glow(
    c,
    c.dark ? c.pal.highlight : c.pal.ink,
    [c.size[0] * 0.35, c.size[1] * 0.35],
    [c.at[0] - 3, c.at[1] - 4],
    alpha,
  );

/**
 * The main glow, bottom first. Dark: the accent (`alpha`) and the pale core (`coreAlpha`,
 * none at 0). Light: a salmon halo, the accent at 62% of its size and the ruby core, so
 * the middle is red, not a half-transparent pink.
 */
const main = (c: Ctx, alpha: number, coreAlpha: number): GlowPoint[] =>
  c.dark
    ? [
        glow(c, c.pal.accent, c.size, c.at, alpha),
        ...(coreAlpha > 0 ? [core(c, coreAlpha)] : []),
      ]
    : [
        glow(c, c.pal.highlight, c.size, c.at, 0.55),
        glow(c, c.pal.accent, [c.size[0] * 0.62, c.size[1] * 0.62], c.at, 0.75),
        core(c, 0.5 + coreAlpha * 0.6),
      ];

/** The radius a texture's mask fades out at: the glow itself on light, the box on dark. */
const reach = (c: Ctx, dark: Pair): Pair =>
  c.dark ? dark : [c.size[0] * 1.1, c.size[1] * 1.1];

/** The mirrored, fainter glow opposite the light. */
const echo = (c: Ctx, hex: string, alpha: number): GlowPoint =>
  glow(c, hex, [c.size[0] * 0.7, c.size[1] * 0.7], c.echo, alpha);

const BUILDERS: Record<CoverLookName, (c: Ctx) => Built> = {
  ember: (c) => ({
    layers: [
      floor(c),
      glows([
        echo(c, c.dark ? c.pal.ink : c.pal.highlight, c.dark ? 0.25 : 0.2),
        ...main(c, 0.75, 0.55),
      ]),
      ...vignette(c),
    ],
    grain: c.dark ? 0.26 : 0.1,
    texture: texture(
      c,
      {
        kind: "lines",
        angle: round(c.tilt + 90),
        spacing: 6,
        strokeWidth: 0.6,
        color: c.pal.line,
      },
      c.dark ? 0.07 : 0.14,
      reach(c, [100, 100]),
      c.dark ? 0.15 : 0,
    ),
  }),
  // A mesh of wide glows at seeded places: siblings share the layout, the item moves the hue.
  aurora: (c) => {
    const rng = createRng(c.seed);
    const k = c.dark ? 1 : 0.75;
    // [colour, alpha, size factor]. No teal on light, and a small dim one on dark: it
    // is a counter-tone, not a patch.
    const mesh: (readonly [string, number, number])[] = c.dark
      ? [
          [c.pal.ink, 0.7, 1],
          [c.pal.accent, 0.5, 1],
          [c.pal.cool, 0.4, 0.45],
          [c.pal.ink, 0.6, 1],
          [c.pal.deep, 0.7, 1],
        ]
      : [
          [c.pal.highlight, 0.5, 1],
          [c.pal.accent, 0.35, 1],
          [c.pal.highlight, 0.4, 1],
          [c.pal.accent, 0.3, 0.6],
          [c.pal.deep, 0.8, 1],
        ];
    const blobs = mesh.map(([hex, alpha, f]) =>
      glow(
        c,
        hex,
        [rng.range(30, 55) * k * f, rng.range(80, 130) * k * f],
        [rng.range(8, 92), rng.range(8, 92)],
        alpha,
      ),
    );
    return {
      layers: [
        { ...floor(c), angle: 200 },
        glows([...blobs, ...main(c, 0.45, 0.4)]),
        ...vignette(c),
      ],
      grain: c.dark ? 0.28 : 0.1,
      texture: null,
    };
  },
  contour: (c) => ({
    layers: [
      floor(c),
      glows([
        echo(c, c.dark ? c.pal.ink : c.pal.highlight, 0.2),
        ...main(c, 0.5, 0),
      ]),
      ...vignette(c),
    ],
    grain: c.dark ? 0.24 : 0.08,
    texture: texture(
      c,
      {
        kind: "contours",
        // A card has 16 KB: 16 rings, against the banner's 36.
        density: c.banner ? 3 : 2,
        rings: c.banner ? 12 : 8,
        spacing: c.banner ? 26 : 13,
        strokeWidth: c.banner ? 1.1 : 0.7,
        color: c.pal.line,
        seed: c.seed,
      },
      c.dark ? 0.3 : 0.45,
      reach(c, [90, 130]),
      c.dark ? 0.3 : 0.05,
    ),
  }),
  silk: (c) => ({
    layers: [
      {
        kind: "fluted",
        source: {
          kind: "glows",
          base: c.pal.base,
          glows: [
            echo(c, c.dark ? c.pal.ink : c.pal.highlight, 0.3),
            ...main(c, 0.7, 0.4),
          ],
        },
        reeds: c.banner ? 40 : 24,
        direction: "angle",
        angle: 20,
        refraction: 0.2,
        // No edge shade on light: it would stripe the whole white field, not just the glow.
        shade: c.dark ? 0.12 : 0,
      },
      ...vignette(c),
    ],
    grain: c.dark ? 0.2 : 0.08,
    texture: null,
  }),
  halftone: (c) => ({
    layers: [floor(c), glows(main(c, 0.6, 0.35)), ...vignette(c)],
    grain: c.dark ? 0.24 : 0.06,
    texture: texture(
      c,
      {
        kind: "dots",
        spacing: c.banner ? 14 : 8,
        radius: c.banner ? 1.7 : 1,
        color: c.pal.line,
      },
      c.dark ? 0.5 : 0.55,
      [c.size[0] * 0.7, c.size[1] * 0.7],
      0,
    ),
  }),
};

/**
 * The item's anchor: the family's jittered one, or for a lesson of an ordered family its
 * place on the walk (a pure function of the region and the index, so it never depends on
 * the item's jitter).
 */
function walked(params: CoverParams, count: number): Pair {
  if (count < 2) return params.anchor;
  const clamp = (v: number): number =>
    Math.min(EDGE.max, Math.max(EDGE.min, v));
  const angle = params.phase * 2 * Math.PI + params.regionIndex;
  const [rx, ry] = params.region;
  return [
    clamp(50 + (rx - 50) * WALK.pull + WALK.x * Math.cos(angle)),
    clamp(50 + (ry - 50) * WALK.pull + WALK.y * Math.sin(angle)),
  ];
}

/**
 * A cover with a named look: a gradient spec (`spec`), an optional masked texture, and,
 * for a banner, the faintest scrim that keeps the title zone at 4.5:1. The look is the
 * pinned `look`, else drawn from the FAMILY key, so a family shares one look while its
 * hue, anchor and radius still differ per item.
 */
export function coverLook(input: CoverLookInput): CoverLook {
  const parsed = parse(input);
  const pinned = parseLookName((input as { look?: unknown }).look);
  const derived = derive(parsed);
  // The look's own anchor: lessons of an ordered family walk it, so the glow, the mask and
  // the field's highlight all follow.
  const params = { ...derived, anchor: walked(derived, parsed.count) };
  const name = pinned ?? pickLook(params.familyKey);
  const { theme, variant } = parsed;
  const banner = variant === "banner";
  const hue =
    LOOK_HUE.centre +
    LOOK_HUE.share * (params.familyHue - BRAND_HUE) +
    LOOK_HUE.itemGain * (params.hue - params.familyHue);
  const pal = coverPalette(
    Math.min(LOOK_HUE.max, Math.max(LOOK_HUE.min, hue)),
    theme,
  );
  const [ax, ay] = params.anchor;
  const ctx: Ctx = {
    dark: theme === "dark",
    banner,
    pal,
    k: params.intensity,
    at: [ax, ay],
    echo: [100 - ax, 100 - ay],
    size:
      theme === "dark"
        ? params.radius
        : [params.radius[0] * LIGHT_REACH, params.radius[1] * LIGHT_REACH],
    tilt: round(
      ((((Math.atan2(50 - ax, ay - 50) * 180) / Math.PI) % 360) + 360) % 360,
    ),
    seed: fnv1a32(params.familyKey),
  };
  const built = BUILDERS[name](ctx);
  const spec: GradientSpec = {
    kind: "layers",
    layers: built.layers,
    grain: built.grain,
    grainBlend: ctx.dark ? "overlay" : "multiply",
    seed: ctx.seed,
  };
  const bare: CoverLook = {
    look: name,
    theme,
    variant,
    params,
    palette: pal,
    spec,
    texture: built.texture,
    scrim: null,
    contrast: { zone: BANNER_ZONE, before: 0, after: 0 },
  };
  const size = banner ? BANNER_SIZE : CARD_SIZE;
  const { scrim, before, after } = scrimFor(bare, BANNER_ZONE, size);
  return {
    ...bare,
    scrim: banner ? scrim : null,
    contrast: { zone: BANNER_ZONE, before, after: banner ? after : before },
  };
}
