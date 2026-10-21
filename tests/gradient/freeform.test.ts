import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  FREEFORM_PALETTES,
  freeformPalette,
  freeformRandom,
} from "../../src/gradient/freeform.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import type { FreeformSpec } from "../../src/gradient/index.js";
import { cssLayers } from "../helpers/css.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const size = { width: 120, height: 80 };
const spec: FreeformSpec = {
  kind: "freeform",
  points: freeformPalette("dawn"),
  size,
};

interface CssPoint {
  x: number;
  y: number;
  r: number;
  rgb: [number, number, number];
  stops: { f: number; a: number }[];
}

/**
 * The CSS this kind emits, read back the way a browser reads it: per point a
 * `radial-gradient(circle Rpx at X% Y%, <stops>)` (top first), then the final base colour.
 */
function parseCss(
  css: string,
  box: { width: number; height: number },
): { points: CssPoint[]; base: [number, number, number] } {
  const layers = cssLayers(css);
  const rgbOf = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const points = layers.slice(0, -1).map((layer) => {
    const m =
      /^radial-gradient\(circle ([\d.]+)px at ([\d.]+)% ([\d.]+)%, (.*)\)$/.exec(
        layer,
      );
    const stops = [
      ...(m?.[4] ?? "").matchAll(
        /(?:(#[0-9a-f]{6})|rgba\((\d+), (\d+), (\d+), ([\d.]+)\)) ([\d.]+)%/g,
      ),
    ];
    const first = stops[0];
    return {
      r: Number(m?.[1]),
      x: (Number(m?.[2]) / 100) * box.width,
      y: (Number(m?.[3]) / 100) * box.height,
      rgb:
        first?.[1] !== undefined
          ? rgbOf(first[1])
          : ([Number(first?.[2]), Number(first?.[3]), Number(first?.[4])] as [
              number,
              number,
              number,
            ]),
      stops: stops.map((s) => ({
        a: s[1] !== undefined ? 1 : Number(s[5]),
        f: Number(s[6]) / 100,
      })),
    };
  });
  return { points, base: rgbOf(layers.at(-1) ?? "#000000") };
}

/** CSS alpha at normalised radius f: linear between stops, flat outside them. */
function alphaAt(
  stops: readonly CssPoint["stops"][number][],
  f: number,
): number {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 0;
  if (f <= first.f) return first.a;
  if (f >= last.f) return last.a;
  const hi = stops.findIndex((s) => s.f >= f);
  const a = stops[hi - 1];
  const b = stops[hi];
  if (!a || !b) return 0;
  return a.a + ((b.a - a.a) * (f - a.f)) / (b.f - a.f);
}

/** What a browser paints at pixel (x, y): points composited bottom to top over the base. */
function cssPixel(
  parsed: ReturnType<typeof parseCss>,
  x: number,
  y: number,
): number[] {
  let out: number[] = [...parsed.base];
  for (const p of [...parsed.points].reverse()) {
    const f = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / p.r;
    const a = alphaAt(p.stops, f);
    out = out.map((v, c) => v * (1 - a) + Number(p.rgb[c]) * a);
  }
  return out;
}

/**
 * Independent reference for one blurred point: the cone `max(0, 1 - rho/r)` convolved
 * with a 2-D Gaussian of deviation `sigma`, integrated in polar coordinates about the
 * cone's own centre (midpoint in rho, trapezoid in theta), evaluated at distance `d`.
 */
function blurredCone(d: number, r: number, sigma: number): number {
  if (sigma === 0) return Math.max(0, 1 - d / r);
  const nr = 200;
  const nt = 360;
  let total = 0;
  for (let i = 0; i < nr; i++) {
    const rho = ((i + 0.5) * r) / nr;
    for (let j = 0; j < nt; j++) {
      const t = (2 * Math.PI * j) / nt;
      const dist2 = d * d + rho * rho - 2 * d * rho * Math.cos(t);
      total += (1 - rho / r) * rho * Math.exp(-dist2 / (2 * sigma * sigma));
    }
  }
  return (
    (total * (r / nr) * ((2 * Math.PI) / nt)) / (2 * Math.PI * sigma * sigma)
  );
}

describe("freeform gradient", () => {
  it("renders a base plus one soft radial per point, in CSS (top first) and SVG", () => {
    const g = gradient(spec);
    expect((g.defs.match(/<radialGradient /g) ?? []).length).toBe(5);
    expect(g.defs).toContain('<rect width="120" height="80" fill="#ffffff"/>'); // base = first point
    expect(g.defs).not.toContain("<filter"); // softness is in the stops, so CSS can match
    const layers = cssLayers(g.css);
    expect(layers).toHaveLength(6);
    expect(layers.at(-1)).toBe("#ffffff");
    // later points paint over earlier ones, so the last point is the first CSS layer
    expect(layers[0]).toContain("at 85% 90%");
    expect(layers[4]).toContain("at 10% 10%");
  });

  it("sizes each blob from spread and softness, and honours base", () => {
    const one = {
      ...spec,
      softness: 0.5,
      base: "#000000",
      points: [{ at: [0.5, 0.5], color: "#ef4444", spread: 1 }],
    } as const;
    const g = gradient(one);
    // radius 1 x 80 = 80, feather 3 x (0.5 x 80); the blob reaches 80 + 120
    expect(g.defs).toContain('r="200"');
    expect(g.css).toContain("circle 200px at 50% 50%");
    expect(g.defs).toContain('fill="#000000"');
    expect(g.css.endsWith(", #000000;")).toBe(true);
    // no softness: exactly the cone, two stops
    const hard = gradient({ ...one, softness: 0 });
    expect(hard.css).toBe(
      "background: radial-gradient(circle 80px at 50% 50%, #ef4444 0%, rgba(239, 68, 68, 0) 100%), #000000;",
    );
    expect((hard.defs.match(/<stop /g) ?? []).length).toBe(2);
  });

  it("emits the Gaussian-blurred cone as stops (CSS evaluated vs an independent integral)", () => {
    // (spread, softness) on 120x80: radius/feather in px = 48/9.6, 80/40, 16/48, 80/1.6, 8/80
    for (const [spread, softness] of [
      [0.6, 0.12],
      [1, 0.5],
      [0.2, 0.6],
      [1, 0.02],
      [0.1, 1],
    ] as const) {
      const r = spread * 80;
      const sigma = softness * 80;
      const parsed = parseCss(
        gradient({
          kind: "freeform",
          size,
          base: "#000000",
          points: [{ at: [0.5, 0.5], color: "#ffffff", spread }],
          softness,
        }).css,
        size,
      );
      const p = parsed.points[0];
      expect(p?.r).toBeCloseTo(r + 3 * sigma, 2);
      let worst = 0;
      for (let k = 0; k <= 50; k++) {
        const d = (k / 50) * (r + 3 * sigma);
        const emitted = alphaAt(p?.stops ?? [], d / (p?.r ?? 1));
        worst = Math.max(worst, Math.abs(emitted - blurredCone(d, r, sigma)));
      }
      expect(worst).toBeLessThan(0.004); // under one 8-bit level
    }
  });

  it("stays finite and falls off monotonically at the extremes of softness and spread", () => {
    for (const [spread, softness] of [
      [0.6, 0.0001],
      [0.001, 0.0001],
      [0.001, 1],
      [50, 1],
      [50, 0.001],
      [0.6, 1],
    ] as const) {
      const css = gradient({
        kind: "freeform",
        size,
        points: [{ at: [0, 1], color: "#ffffff", spread }],
        softness,
      }).css;
      const point = parseCss(css, size).points[0];
      const alphas = (point?.stops ?? []).map((s) => s.a);
      expect(alphas.length).toBeGreaterThan(1);
      expect(alphas.at(-1)).toBe(0);
      alphas.forEach((a, i) => {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        if (i > 0) expect(a).toBeLessThanOrEqual(Number(alphas[i - 1]));
      });
      expect(css).not.toContain("NaN");
    }
  });

  it("rasterises to what the emitted CSS paints (resvg vs CSS maths)", () => {
    const box = { width: 90, height: 60 };
    const points = [
      { at: [0.25, 0.3], color: "#ef4444", spread: 0.7 },
      { at: [0.75, 0.6], color: "rgba(16, 171, 186, 0.6)", spread: 0.5 },
      { at: [0.5, 0.5], color: "#edc41c", spread: 0.25 },
    ] as const;
    // resvg stores each layer as 8-bit premultiplied, which rounds the faint tails up by
    // about 0.7 per layer (measured mean +0.67 for one point), so tolerance grows with layers.
    for (const [layers, tolerance] of [
      [1, 3],
      [3, 5],
    ] as const) {
      const s: FreeformSpec = {
        kind: "freeform",
        size: box,
        base: "#102030",
        softness: 0.2,
        points: points.slice(0, layers),
      };
      expect(() => cssLayers(gradient(s).css)).not.toThrow();
      const parsed = parseCss(gradient(s).css, box);
      const raster = rasterize(gradientSvg(s));
      let checked = 0;
      for (let y = 0; y < box.height; y += 5) {
        for (let x = 0; x < box.width; x += 5) {
          const expected = cssPixel(parsed, x, y);
          const px = pixelAt(raster, x, y);
          for (let c = 0; c < 3; c++) {
            expect(
              Math.abs(Number(px[c]) - Number(expected[c])),
            ).toBeLessThanOrEqual(tolerance);
          }
          expect(px[3]).toBe(255);
          checked++;
        }
      }
      expect(checked).toBe(216);
    }
  });

  it("validates", () => {
    expect(() => gradient({ ...spec, points: [] })).toThrow(VisError);
    expect(() => gradient({ ...spec, points: "x" as never })).toThrow(VisError);
    for (const softness of [2, -0.1, Number.NaN, Infinity]) {
      expect(() => gradient({ ...spec, softness })).toThrow(VisError);
      expect(() => gradient({ ...spec, softness })).toThrow("softness");
    }
    for (const spread of [0, -1, Number.NaN, Infinity]) {
      expect(() =>
        gradient({ ...spec, points: [{ at: [0, 0], color: "#fff", spread }] }),
      ).toThrow("spread");
    }
    expect(() =>
      gradient({ ...spec, points: [{ at: [1.5, 0], color: "#fff" }] }),
    ).toThrow("`at`");
    expect(() => gradient({ ...spec, base: "nope" })).toThrow("nope");
    expect(() =>
      gradient({ ...spec, points: [{ at: [0, 0], color: "nope" }] }),
    ).toThrow("nope");
  });

  it("rejects malformed points, naming the index and the value", () => {
    const bad = (...points: unknown[]) =>
      gradient({ ...spec, points: points as never });
    expect(() => bad(null)).toThrow("freeform point 0 must be an object");
    expect(() => bad("x")).toThrow("freeform point 0 must be an object");
    expect(() => bad(new Array<unknown>(2))).toThrow("point 0");
    expect(() => bad({ color: "#fff" })).toThrow("point 0 needs `at`");
    expect(() => bad({ at: [0.5], color: "#fff" })).toThrow("needs `at`");
    expect(() => bad({ at: [0.5, 0.5] })).toThrow("point 0 needs a `color`");
    expect(() => bad({ at: [0.5, 0.5], color: 7 })).toThrow("needs a `color`");
    expect(() => bad(spec.points[0], null)).toThrow(
      "freeform point 1 must be an object",
    );
  });

  it("caps the number of points, naming the count", () => {
    const point = { at: [0.5, 0.5], color: "#fff" } as const;
    expect(
      (
        gradient({
          ...spec,
          points: Array.from({ length: 64 }, () => point),
        }).defs.match(/<radialGradient /g) ?? []
      ).length,
    ).toBe(64);
    expect(() =>
      gradient({ ...spec, points: Array.from({ length: 65 }, () => point) }),
    ).toThrow("65");
  });

  it("ships the four presets with the dawn reference layout", () => {
    expect(Object.keys(FREEFORM_PALETTES)).toEqual([
      "dawn",
      "aurora",
      "ember",
      "brand",
    ]);
    const dawn = freeformPalette("dawn");
    expect(dawn.map((p) => p.color)).toEqual([
      "#ffffff",
      "#7c3aed",
      "#ff7f6e",
      "#f472b6",
      "#3b82f6",
    ]);
    // white top-left, violet top, coral bottom-left, pink right, blue bottom-right
    expect(dawn.map((p) => p.at)).toEqual([
      [0.1, 0.1],
      [0.5, 0.05],
      [0.15, 0.85],
      [0.95, 0.5],
      [0.85, 0.9],
    ]);
    expect(() => freeformPalette("nope")).toThrow(VisError);
    expect(() => freeformPalette("nope")).toThrow("nope");
    // inherited object keys are not palettes
    expect(() => freeformPalette("constructor")).toThrow(VisError);
    expect(() => freeformPalette("toString")).toThrow(VisError);
    for (const name of Object.keys(FREEFORM_PALETTES)) {
      expect(() =>
        gradient({ ...spec, points: freeformPalette(name) }),
      ).not.toThrow();
    }
  });

  it("freezes the shared presets so a caller cannot edit them", () => {
    expect(Object.isFrozen(FREEFORM_PALETTES)).toBe(true);
    for (const name of Object.keys(FREEFORM_PALETTES)) {
      const palette = freeformPalette(name);
      expect(Object.isFrozen(palette), name).toBe(true);
      for (const p of palette) {
        expect(Object.isFrozen(p)).toBe(true);
        expect(Object.isFrozen(p.at)).toBe(true);
      }
    }
    const dawn = freeformPalette("dawn");
    const first = dawn[0];
    expect(Reflect.set(dawn, 0, dawn[1])).toBe(false);
    expect(() => Array.prototype.push.call(dawn, dawn[1])).toThrow(TypeError);
    expect(Reflect.set(first ?? {}, "color", "#000000")).toBe(false);
    expect(Reflect.set(first?.at ?? [], 0, 0.9)).toBe(false);
    expect(freeformPalette("dawn")[0]?.color).toBe("#ffffff");
    expect(freeformPalette("dawn")[0]?.at).toEqual([0.1, 0.1]);
    // the frozen presets still render
    expect(() => gradient({ ...spec, points: dawn })).not.toThrow();
  });

  it("scatters points deterministically from a seed", () => {
    const palette = ["#f00", "#0f0"];
    const a = freeformRandom({ count: 4, palette, seed: 3 });
    expect(a).toEqual(freeformRandom({ count: 4, palette, seed: 3 }));
    expect(a).not.toEqual(freeformRandom({ count: 4, palette, seed: 4 }));
    expect(freeformRandom({ count: 2, palette })).toEqual(
      freeformRandom({ count: 2, palette, seed: 1 }),
    );
    expect(a).toHaveLength(4);
    for (const p of a) {
      expect(palette).toContain(p.color);
      for (const c of p.at) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expect(p.spread).toBeGreaterThanOrEqual(0.4);
      expect(p.spread).toBeLessThanOrEqual(0.8);
    }
    // scattered points render
    expect(() => gradient({ ...spec, points: a })).not.toThrow();
  });

  it("freeformRandom rejects options that are not an object", () => {
    for (const opts of [null, 5, "x"])
      expect(() => freeformRandom(opts as never)).toThrow(
        /options must be an object/,
      );
  });

  it("validates the scatter options at the boundary", () => {
    const palette = ["#f00"];
    for (const count of [0, -1, 1.5, Number.NaN, 65]) {
      expect(() => freeformRandom({ count, palette })).toThrow(VisError);
      expect(() => freeformRandom({ count, palette })).toThrow("count");
    }
    expect(freeformRandom({ count: 64, palette })).toHaveLength(64);
    expect(() => freeformRandom({ count: 2, palette: [] })).toThrow(VisError);
    expect(() => freeformRandom({ count: 2, palette: "x" as never })).toThrow(
      VisError,
    );
    // entries are checked up front, naming the value, not when the points render
    expect(() =>
      freeformRandom({ count: 2, palette: ["#f00", "nope"] }),
    ).toThrow("nope");
    expect(() => freeformRandom({ count: 2, palette: ["#f00", ""] })).toThrow(
      VisError,
    );
    expect(() =>
      freeformRandom({ count: 2, palette: ["#f00", 7 as never] }),
    ).toThrow("got 7");
    expect(() =>
      freeformRandom({ count: 2, palette: [null as never] }),
    ).toThrow("got null");
    for (const seed of [Number.NaN, Infinity, 1.5, 2 ** 53]) {
      expect(() => freeformRandom({ count: 2, palette, seed })).toThrow(
        VisError,
      );
      expect(() => freeformRandom({ count: 2, palette, seed })).toThrow("seed");
    }
  });

  it("is byte-identical for the same spec", () => {
    expect(gradient(spec)).toEqual(gradient({ ...spec }));
  });

  it("matches its golden", () => {
    expectGolden("gradient/freeform.svg", gradientSvg(spec));
  });
});
