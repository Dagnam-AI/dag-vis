import { toHex } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import type { Attrs } from "../core/svg.js";
import {
  MAX_DIMENSION,
  assertOptions,
  bounded,
  describeValue,
  orDefault,
  parseRgba,
} from "../core/validate.js";
import { resolveAppIconLook } from "./app-icon-options.js";
import type {
  AppIconLookOptions,
  ResolvedAppIconLook,
} from "./app-icon-options.js";
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

export interface AppIconSvgOptions extends AppIconLookOptions {
  /** Output side in px, 1..16384 (the drawing scales). Default 1024. */
  size?: number;
  /** Mark colour. Default BRAND.mark, the deep red of every icon surface. */
  color?: string;
  /** Plate colour. Default BRAND.background.dark. */
  background?: string;
}

/** Sample `i` (wrapping) of the superellipse |x|^n + |y|^n = 1 of side `plate`, in canvas px. */
function sample(i: number, plate: number): [number, number] {
  const { canvas, exponent } = APP_ICON;
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
function squircleOutline(plate: number): string {
  const [x0, y0] = sample(0, plate);
  let d = `M${fmt(x0)} ${fmt(y0)}`;
  for (let i = 0; i < 4 * SAMPLES; i++) {
    const [ax, ay] = sample(i - 1, plate);
    const [bx, by] = sample(i, plate);
    const [cx, cy] = sample(i + 1, plate);
    const [dx, dy] = sample(i + 2, plate);
    d += `C${fmt(bx + (cx - ax) / 6)} ${fmt(by + (cy - ay) / 6)} ${fmt(cx - (dx - bx) / 6)} ${fmt(cy - (dy - by) / 6)} ${fmt(cx)} ${fmt(cy)}`;
  }
  return `${d}Z`;
}

/** One plate element of `look` (`plate` px wide, centred on the canvas) with the given paint attributes. */
function plateElement(
  look: ResolvedAppIconLook,
  plate: number,
  paint: Attrs,
): string {
  const { canvas } = APP_ICON;
  const at = (canvas - plate) / 2;
  switch (look.shape) {
    case "squircle":
      return el("path", { d: squircleOutline(plate), ...paint });
    case "circle":
      return el("circle", {
        cx: canvas / 2,
        cy: canvas / 2,
        r: plate / 2,
        ...paint,
      });
    case "rounded":
    case "square":
      return el("rect", {
        x: at,
        y: at,
        width: plate,
        height: plate,
        rx: look.shape === "rounded" ? look.cornerRadius * plate : undefined,
        ...paint,
      });
  }
}

/**
 * The desktop app icon master as an SVG: the plate and the heavy mark on a
 * 1024-unit canvas. The default is the macOS dock icon (squircle plate, 100
 * units of transparent margin, sheen and hairline); `preset`, `shape`,
 * `cornerRadius`, `margin`, `markScale`, `flat` and `opaque` reshape it (see
 * `APP_ICON_PRESETS`). Pure and deterministic; `appIcon` (the Node entry)
 * rasterises it to the PNG set and the .icns.
 */
export function appIconSvg(opts: AppIconSvgOptions = {}): string {
  assertOptions(opts);
  if (Array.isArray(opts))
    throw new VisError(`options must be an object, got ${describeValue(opts)}`);
  const size = bounded(
    "app icon size",
    orDefault<unknown>(opts.size, APP_ICON.canvas),
    1,
    MAX_DIMENSION,
  );
  const mark = toHex(
    parseRgba("color", orDefault<unknown>(opts.color, BRAND.mark)),
  );
  const background = parseRgba(
    "background",
    orDefault<unknown>(opts.background, BRAND.background.dark),
  );
  const plateColor = toHex(background);
  const look = resolveAppIconLook(opts);
  if (look.opaque && background.a !== 1)
    throw new VisError(
      `app icon opaque needs an opaque background, got ${describeValue(opts.background)}`,
    );
  const { canvas } = APP_ICON;
  const plate = canvas * (1 - 2 * look.margin);
  const markBox = look.markScale * plate;
  const sheen = el(
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
  );
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: `0 0 ${canvas} ${canvas}`,
    },
    ...(look.flat ? [] : [sheen]),
    plateElement(look, plate, { fill: plateColor }),
    ...(look.flat
      ? []
      : [
          plateElement(look, plate, { fill: `url(#${SHEEN})` }),
          plateElement(look, plate, {
            fill: "none",
            stroke: "#ffffff",
            "stroke-opacity": 0.1,
            "stroke-width": 3,
          }),
        ]),
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
