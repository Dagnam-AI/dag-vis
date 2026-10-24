import { toHex } from "../core/color.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import {
  MAX_DIMENSION,
  assertOptions,
  bounded,
  orDefault,
  parseRgba,
} from "../core/validate.js";
import { LOGO_ICON_WEIGHT, logoMark } from "./logo.js";
import { BRAND } from "./tokens.js";

/**
 * The desktop app icon master, on Apple's 1024 icon grid: an 824 px plate
 * centred on a transparent 1024 canvas (100 px of margin each side), the heavy
 * mark centred on it. All numbers are canvas px.
 */
export const APP_ICON = {
  canvas: 1024,
  plate: 824,
  /** Superellipse exponent of the plate outline: 5 is the closest simple match to Apple's continuous-corner shape (a plain rounded square uses 2 arcs; this has no flat-to-arc seam). */
  exponent: 5,
  /** Side of the square the mark is fitted into, centred on the plate. */
  markBox: 480,
} as const;

const SHEEN = "app-icon-sheen";

/** Points per quadrant the outline is sampled at; a Catmull-Rom spline through them stays within 0.1 px of the exact curve. */
const SAMPLES = 32;

export interface AppIconSvgOptions {
  /** Output side in px, 1..16384 (the drawing scales). Default 1024. */
  size?: number;
  /** Mark colour. Default BRAND.mark, the deep red of every icon surface. */
  color?: string;
  /** Plate colour. Default BRAND.background.dark. */
  background?: string;
}

/** Sample `i` (wrapping) of the superellipse |x|^n + |y|^n = 1, in canvas px. */
function sample(i: number): [number, number] {
  const { canvas, plate, exponent } = APP_ICON;
  const count = 4 * SAMPLES;
  const t = ((((i % count) + count) % count) * Math.PI) / (2 * SAMPLES);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const half = plate / 2;
  return [
    canvas / 2 + half * Math.sign(c) * Math.abs(c) ** (2 / exponent),
    canvas / 2 + half * Math.sign(s) * Math.abs(s) ** (2 / exponent),
  ];
}

/** The squircle outline as one closed cubic path: the samples joined by a Catmull-Rom spline. */
function plateOutline(): string {
  const [x0, y0] = sample(0);
  let d = `M${fmt(x0)} ${fmt(y0)}`;
  for (let i = 0; i < 4 * SAMPLES; i++) {
    const [ax, ay] = sample(i - 1);
    const [bx, by] = sample(i);
    const [cx, cy] = sample(i + 1);
    const [dx, dy] = sample(i + 2);
    d += `C${fmt(bx + (cx - ax) / 6)} ${fmt(by + (cy - ay) / 6)} ${fmt(cx - (dx - bx) / 6)} ${fmt(cy - (dy - by) / 6)} ${fmt(cx)} ${fmt(cy)}`;
  }
  return `${d}Z`;
}

/**
 * The desktop app icon master as an SVG: the squircle plate and the heavy mark
 * on a transparent canvas. Pure and deterministic; `appIcon` (the Node entry)
 * rasterises it to the PNG set and the .icns.
 */
export function appIconSvg(opts: AppIconSvgOptions = {}): string {
  assertOptions(opts);
  const size = bounded(
    "app icon size",
    orDefault<unknown>(opts.size, APP_ICON.canvas),
    1,
    MAX_DIMENSION,
  );
  const mark = toHex(
    parseRgba("color", orDefault<unknown>(opts.color, BRAND.mark)),
  );
  const plate = toHex(
    parseRgba(
      "background",
      orDefault<unknown>(opts.background, BRAND.background.dark),
    ),
  );
  const { canvas, markBox } = APP_ICON;
  const outline = plateOutline();
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: `0 0 ${canvas} ${canvas}`,
    },
    el(
      "defs",
      {},
      el(
        "linearGradient",
        { id: SHEEN, x1: 0, y1: 0, x2: 0, y2: 1 },
        el("stop", {
          offset: 0,
          "stop-color": "#ffffff",
          "stop-opacity": 0.07,
        }),
        el("stop", { offset: 0.5, "stop-color": "#ffffff", "stop-opacity": 0 }),
      ),
    ),
    el("path", { d: outline, fill: plate }),
    el("path", { d: outline, fill: `url(#${SHEEN})` }),
    el("path", {
      d: outline,
      fill: "none",
      stroke: "#ffffff",
      "stroke-opacity": 0.1,
      "stroke-width": 3,
    }),
    logoMark(
      {
        x: (canvas - markBox) / 2,
        y: (canvas - markBox) / 2,
        size: markBox,
      },
      mark,
      LOGO_ICON_WEIGHT,
    ),
  );
}
