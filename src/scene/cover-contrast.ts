import { parseColor, toHex, withAlpha } from "../core/color.js";
import type { Rgba } from "../core/color.js";
import { VisError } from "../core/errors.js";
import type { Size } from "../core/geometry.js";
import { normalizeStops, sampleStops } from "../gradient/index.js";
import type { GradientSpec } from "../gradient/index.js";
import type {
  CoverLook,
  CoverScrim,
  CoverTexture,
  Zone,
} from "./cover-look-types.js";

/**
 * The analytic contrast model of a cover: composites the look at a grid of points in a
 * text zone and returns the lowest WCAG ratio of the text colour. Each glow's alpha at a
 * point is its colour's alpha times `max(0, 1 - d / 0.7)` (`d` the ellipse-normalised
 * distance: the stop profile `renderGlows` writes), linear and radial layers are sampled directly, a texture counts at its full
 * opacity wherever its mask exceeds 0.1 (the worst case for a thin line), and grain is
 * ignored (a fraction of one contrast step). Colours composite in gamma space, as a
 * browser does. The size the cover is drawn at matters because glow radii are percentages of the box.
 */

/** The title zone of a banner: the middle 70% x 56% of the box. */
export const BANNER_ZONE: Zone = { x: 0.15, y: 0.22, w: 0.7, h: 0.56 };
/** The title block of the 1200x630 social card. */
export const OG_ZONE: Zone = { x: 0.067, y: 0.12, w: 0.867, h: 0.48 };
/** The sizes a variant is drawn at when none is given (px). */
export const BANNER_SIZE: Size = { width: 1600, height: 512 };
export const CARD_SIZE: Size = { width: 400, height: 225 };
export const OG_SIZE: Size = { width: 1200, height: 630 };

/** WCAG's target for normal text. */
export const TARGET_RATIO = 4.5;
const GRID = { x: 9, y: 5 };
/** The scrim steps tried, smallest first. */
const SCRIM_STEP = 0.05;
const SCRIM_MAX = 0.7;
/** The scrim's ellipse reaches this multiple of the zone's size, and is solid to half of it. */
const SCRIM_REACH = 0.9;
export const SCRIM_SOLID = 0.5;
/** Where the texture's mask counts as present. */
const MASK_PRESENT = 0.1;

const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mixed = (t: number, b: number): number =>
    (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return {
    r: mixed(top.r, bottom.r),
    g: mixed(top.g, bottom.g),
    b: mixed(top.b, bottom.b),
    a,
  };
};

const linear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = (c: Rgba): number =>
  0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
const ratio = (a: Rgba, b: Rgba): number => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

interface Point {
  x: number;
  y: number;
}

/** The colour of `spec` at `p` (px); alpha is the layer's own coverage. */
function colourAt(spec: GradientSpec, p: Point, size: Size): Rgba {
  const { width: w, height: h } = size;
  switch (spec.kind) {
    case "layers": {
      let acc: Rgba = { r: 0, g: 0, b: 0, a: 0 };
      for (const layer of spec.layers)
        acc = over(colourAt(layer, p, size), acc);
      return acc;
    }
    case "fluted":
      return colourAt(spec.source, p, size);
    case "linear": {
      const rad = ((spec.angle ?? 180) * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const t = ((p.x - w / 2) * dx + (p.y - h / 2) * dy) / (2 * half) + 0.5;
      return sampleStops(normalizeStops(spec.stops, spec.reverse), t);
    }
    case "radial": {
      const [ux, uy] = spec.at ?? [0.5, 0.5];
      const radius = spec.radius ?? 0.5;
      const [rx, ry] =
        spec.shape === "ellipse"
          ? [radius * w, radius * h]
          : [radius * Math.min(w, h), radius * Math.min(w, h)];
      const d = Math.hypot((p.x - ux * w) / rx, (p.y - uy * h) / ry);
      return sampleStops(normalizeStops(spec.stops, spec.reverse), d);
    }
    case "glows": {
      let acc = parseColor(spec.base);
      for (const g of spec.glows) {
        const c = parseColor(g.color);
        const d = Math.hypot(
          (p.x - (g.at[0] / 100) * w) / ((g.size[0] / 100) * w),
          (p.y - (g.at[1] / 100) * h) / ((g.size[1] / 100) * h),
        );
        acc = over(withAlpha(c, c.a * Math.max(0, 1 - d / 0.7)), acc);
      }
      return acc;
    }
    default:
      throw new VisError(
        `coverContrast cannot model a ${spec.kind} layer (a cover look is layers, fluted, linear, radial or glows)`,
      );
  }
}

/** How present the texture is at `p`: the mask's radial ramp from 1 at its centre to `floor`. */
function maskAt(t: CoverTexture, p: Point, size: Size): number {
  const { at, radius, floor } = t.mask;
  const d = Math.hypot(
    (p.x - (at[0] / 100) * size.width) / ((radius[0] / 100) * size.width),
    (p.y - (at[1] / 100) * size.height) / ((radius[1] / 100) * size.height),
  );
  return floor + (1 - floor) * Math.max(0, 1 - d);
}

/** The scrim's alpha at `p`: solid to `SCRIM_SOLID` of its ellipse, then easing to zero. */
export function scrimAt(s: CoverScrim, p: Point, size: Size): number {
  const d = Math.hypot(
    (p.x - (s.at[0] / 100) * size.width) / ((s.radius[0] / 100) * size.width),
    (p.y - (s.at[1] / 100) * size.height) / ((s.radius[1] / 100) * size.height),
  );
  return s.alpha * Math.min(1, Math.max(0, (1 - d) / (1 - SCRIM_SOLID)));
}

/** The lowest contrast ratio over the zone's grid, with `scrim` (null: none) laid on the picture. */
function minRatio(
  look: CoverLook,
  scrim: CoverScrim | null,
  zone: Zone,
  size: Size,
): number {
  const { palette: pal } = look;
  const page = parseColor(pal.base);
  const text = parseColor(pal.foreground);
  const line = parseColor(pal.line);
  const veil = scrim && { scrim, colour: parseColor(scrim.color) };
  let worst = Infinity;
  for (let j = 0; j < GRID.y; j++)
    for (let i = 0; i < GRID.x; i++) {
      const p = {
        x: (zone.x + (zone.w * i) / (GRID.x - 1)) * size.width,
        y: (zone.y + (zone.h * j) / (GRID.y - 1)) * size.height,
      };
      let c = over(colourAt(look.spec, p, size), page);
      if (look.texture && maskAt(look.texture, p, size) > MASK_PRESENT)
        c = over(withAlpha(line, look.texture.opacity), c);
      if (veil)
        c = over(withAlpha(veil.colour, scrimAt(veil.scrim, p, size)), c);
      worst = Math.min(worst, ratio(text, c));
    }
  return worst;
}

/** The look's minimum text contrast in `zone` (default: its own), with its scrim. */
export function coverContrast(
  look: CoverLook,
  zone: Zone = look.contrast.zone,
  size: Size = look.variant === "banner" ? BANNER_SIZE : CARD_SIZE,
): number {
  return minRatio(look, look.scrim, zone, size);
}

/**
 * The faintest scrim (alpha in 0.05 steps up to 0.7) that lifts the picture's contrast in
 * `zone` to 4.5:1, or none when the picture already meets it. Ignores `look.scrim`.
 */
export function scrimFor(
  look: CoverLook,
  zone: Zone,
  size: Size,
): { scrim: CoverScrim | null; before: number; after: number } {
  const before = minRatio(look, null, zone, size);
  if (before >= TARGET_RATIO) return { scrim: null, before, after: before };
  const colour = toHex(parseColor(look.palette.base));
  const at: [number, number] = [
    (zone.x + zone.w / 2) * 100,
    (zone.y + zone.h / 2) * 100,
  ];
  const radius: [number, number] = [
    zone.w * 100 * SCRIM_REACH,
    zone.h * 100 * SCRIM_REACH,
  ];
  // The faintest of 0.05, 0.10, ... 0.70 that reaches the target; the strongest if none does.
  const steps = Array.from(
    { length: Math.round(SCRIM_MAX / SCRIM_STEP) },
    (_, i) => Math.round((i + 1) * SCRIM_STEP * 100) / 100,
  );
  let best = { scrim: null as CoverScrim | null, after: before };
  for (const alpha of steps) {
    const scrim = { at, radius, color: colour, alpha };
    best = { scrim, after: minRatio(look, scrim, zone, size) };
    if (best.after >= TARGET_RATIO) break;
  }
  return { ...best, before };
}
