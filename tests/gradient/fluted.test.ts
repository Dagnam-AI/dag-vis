import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { createRng } from "../../src/core/rng.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import type { FlutedSpec, GradientSpec } from "../../src/gradient/index.js";
import { cssLayers } from "../helpers/css.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const source = {
  kind: "linear",
  angle: 90,
  stops: ["#ef4444", "#10abba"],
} as const;
const spec = {
  kind: "fluted",
  source,
  reeds: 4,
  size: { width: 80, height: 40 },
} as const;

type Rgb = readonly [number, number, number];
const RED: Rgb = [239, 68, 68];
const TEAL: Rgb = [16, 171, 186];

/** The 90deg source: left to right, #ef4444 to #10abba, padded outside the box. */
function sourceAt(px: number, width: number): Rgb {
  const t = Math.min(1, Math.max(0, px / width));
  const mix = (c: 0 | 1 | 2): number => RED[c] + (TEAL[c] - RED[c]) * t;
  return [mix(0), mix(1), mix(2)];
}

/**
 * What a browser paints for the CSS this kind emits: the source with the reed shade on
 * top, `repeating-linear-gradient(<theta>deg, black(0.6s) 0, clear 35%, clear 75%,
 * white(0.5s) 100%)` over one reed width W = L / reeds along the gradient line, where
 * L = |w sin(theta)| + |h cos(theta)|. Evaluated at pixel (x, y) from the CSS
 * definition alone (gradient line through the centre; position 0 at its start).
 */
function cssPixel(
  box: { width: number; height: number },
  reeds: number,
  shade: number,
  thetaDeg: number,
  x: number,
  y: number,
): { rgb: number[]; t: number } {
  const th = (thetaDeg * Math.PI) / 180;
  const length =
    Math.abs(box.width * Math.sin(th)) + Math.abs(box.height * Math.cos(th));
  const width = length / reeds;
  const s =
    (x + 0.5 - box.width / 2) * Math.sin(th) +
    (y + 0.5 - box.height / 2) * -Math.cos(th) +
    length / 2;
  const t = (((s % width) + width) % width) / width;
  let a = 0;
  let c = 0;
  if (t < 0.35) a = 0.6 * shade * (1 - t / 0.35);
  else if (t > 0.75) {
    a = 0.5 * shade * ((t - 0.75) / 0.25);
    c = 255;
  }
  const base = sourceAt(x + 0.5, box.width);
  return { rgb: base.map((v) => v * (1 - a) + c * a), t };
}

function expectClose(
  actual: readonly number[],
  expected: readonly number[],
  tol = 4,
): void {
  for (let c = 0; c < 3; c++) {
    expect(
      Math.abs(Number(actual[c]) - Number(expected[c])),
    ).toBeLessThanOrEqual(tol);
  }
}

describe("fluted glass", () => {
  it("clips the source into reeds, each scaled about its centre and shaded", () => {
    const g = gradient(spec);
    expect(g.defs).toContain('<linearGradient id="vis1-src-g"');
    expect((g.defs.match(/<clipPath /g) ?? []).length).toBe(4);
    expect((g.defs.match(/fill="url\(#vis1-src-g\)"/g) ?? []).length).toBe(5); // base rect + 4 reeds
    expect(g.defs).toContain('<linearGradient id="vis1-shade"');
    expect((g.defs.match(/fill="url\(#vis1-shade\)"/g) ?? []).length).toBe(4);
    expect(g.defs).toContain("scale(0.65 1)");
  });

  it("defaults to 24 vertical reeds", () => {
    const g = gradient({ kind: "fluted", source, size: spec.size });
    expect((g.defs.match(/<clipPath /g) ?? []).length).toBe(24);
    expect(g.css).toContain("repeating-linear-gradient(90deg,");
  });

  it("falls back in CSS to the source plus the same repeating reed shade", () => {
    // 80px / 4 reeds = 20px per reed; 0.6 x 0.5 and 0.5 x 0.5 are the edge opacities
    expect(gradient(spec).css).toBe(
      "background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.3) 0px, rgba(0, 0, 0, 0) 7px, rgba(255, 255, 255, 0) 15px, rgba(255, 255, 255, 0.25) 20px), linear-gradient(90deg, #ef4444 0%, #10abba 100%);",
    );
    expect(cssLayers(gradient(spec).css)).toHaveLength(2);
    // reeds run along the other axis for horizontal ones
    expect(gradient({ ...spec, direction: "horizontal" }).css).toContain(
      "repeating-linear-gradient(180deg,",
    );
    // a reed 10px tall on 40px
    expect(gradient({ ...spec, direction: "horizontal" }).css).toContain(
      "rgba(0, 0, 0, 0) 3.5px,",
    );
    // no shade, no shade layer: exactly the source
    expect(gradient({ ...spec, shade: 0 }).css).toBe(
      "background: linear-gradient(90deg, #ef4444 0%, #10abba 100%);",
    );
    expect(gradient({ ...spec, shade: 0 }).defs).not.toContain("vis1-shade");
  });

  it("keeps the source's per-image blend list aligned with the shade layer on top", () => {
    const layered: GradientSpec = {
      kind: "layers",
      blend: "multiply",
      layers: [
        source,
        { kind: "linear", angle: 0, stops: ["#ffffff", "#808080"] },
      ],
    };
    const g = gradient({ ...spec, source: layered });
    expect(cssLayers(g.css)).toHaveLength(3);
    expect(g.css).toMatch(/background-blend-mode: normal, multiply, normal;$/);
  });

  it("supports horizontal and angled reeds, and seeded jitter", () => {
    const h = gradient({ ...spec, direction: "horizontal" });
    expect(h.defs).toContain("scale(1 0.65)");
    const a = gradient({ ...spec, direction: "angle", angle: 30 });
    expect(a.defs).toContain("rotate(30 40 20)");
    expect(a.defs).toContain("rotate(-30 40 20)");
    expect(gradient({ ...spec, direction: "angle" }).defs).toContain(
      "rotate(20 40 20)",
    );
    expect(gradient({ ...spec, seed: 2 }).defs).not.toBe(gradient(spec).defs);
    expect(gradient({ ...spec, refraction: 0 }).defs).toContain("scale(1 1)");
  });

  it("validates", () => {
    expect(() => gradient({ ...spec, reeds: 1 })).toThrow(VisError);
    expect(() => gradient({ ...spec, reeds: 2.5 })).toThrow(VisError);
    expect(() => gradient({ ...spec, reeds: 300 })).toThrow("300");
    expect(gradient({ ...spec, reeds: 256 }).css).toContain(
      "repeating-linear-gradient",
    );
    expect(() => gradient({ ...spec, refraction: 2 })).toThrow(VisError);
    expect(() => gradient({ ...spec, refraction: Number.NaN })).toThrow(
      "refraction",
    );
    expect(() => gradient({ ...spec, shade: -1 })).toThrow(VisError);
    expect(() => gradient({ ...spec, shade: Infinity })).toThrow("shade");
    expect(() => gradient({ ...spec, direction: "diag" as never })).toThrow(
      VisError,
    );
    expect(() => gradient({ ...spec, direction: "diag" as never })).toThrow(
      "diag",
    );
    for (const angle of [Number.NaN, Infinity]) {
      expect(() => gradient({ ...spec, direction: "angle", angle })).toThrow(
        "angle",
      );
    }
    expect(() => gradient({ ...spec, source: undefined as never })).toThrow(
      "source",
    );
    expect(() => gradient({ ...spec, source: "x" as never })).toThrow(VisError);
    expect(() =>
      gradient({ ...spec, source: { kind: "linear", stops: [] } }),
    ).toThrow(VisError);
  });

  it("paints the reed shade exactly as the CSS does (resvg vs CSS maths, no refraction)", () => {
    const box = { width: 80, height: 40 };
    const cases: [string, FlutedSpec, number][] = [
      ["vertical", { ...spec, refraction: 0 }, 90],
      ["horizontal", { ...spec, refraction: 0, direction: "horizontal" }, 180],
      [
        "angle 30",
        { ...spec, refraction: 0, direction: "angle", angle: 30 },
        120,
      ],
      [
        "angle -20, 7 reeds",
        {
          ...spec,
          refraction: 0,
          reeds: 7,
          direction: "angle",
          angle: -20,
          shade: 0.9,
        },
        70,
      ],
    ];
    for (const [name, s, theta] of cases) {
      // the emitted CSS carries the angle and the reed period the maths below assumes
      const th = (theta * Math.PI) / 180;
      const period =
        (Math.abs(box.width * Math.sin(th)) +
          Math.abs(box.height * Math.cos(th))) /
        (s.reeds ?? 24);
      const { css } = gradient(s);
      expect(css, name).toContain(`repeating-linear-gradient(${theta}deg, `);
      expect(css, name).toContain(
        `rgba(255, 255, 255, ${Math.round(0.5 * (s.shade ?? 0.5) * 1000) / 1000}) ${Math.round(period * 1000) / 1000}px)`,
      );
      const raster = rasterize(gradientSvg(s));
      let checked = 0;
      for (let y = 0; y < box.height; y += 3) {
        for (let x = 0; x < box.width; x += 3) {
          const expected = cssPixel(
            box,
            s.reeds ?? 24,
            s.shade ?? 0.5,
            theta,
            x,
            y,
          );
          // a pixel on a reed edge is anti-aliased between two reeds; the CSS has no such seam
          if (expected.t < 0.1 || expected.t > 0.9) continue;
          const px = pixelAt(raster, x, y);
          expectClose(px, expected.rgb);
          expect(px[3], `${name} ${x},${y}`).toBe(255);
          checked++;
        }
      }
      expect(checked, name).toBeGreaterThan(150);
    }
  });

  it("refracts each reed: the source scaled about the reed centre, nudged by seeded jitter", () => {
    const box = { width: 80, height: 40 };
    const refraction = 0.35;
    const k = 1 - refraction;
    const reeds = 4;
    const reed = box.width / reeds;
    const rng = createRng(1);
    const jitter = Array.from(
      { length: reeds },
      () => rng.range(-0.5, 0.5) * refraction * reed,
    );
    const s: FlutedSpec = { ...spec, shade: 0 };
    const raster = rasterize(gradientSvg(s));
    let differs = 0;
    for (let y = 2; y < box.height; y += 9) {
      for (let x = 0; x < box.width; x++) {
        const i = Math.floor(x / reed);
        const px = x + 0.5;
        if (Math.min(px - i * reed, (i + 1) * reed - px) < 1.5) continue;
        const centre = (i + 0.5) * reed;
        const src = centre + (px - centre - Number(jitter[i])) / k;
        // a gradient source keeps going past the canvas, so even an end reed's
        // sliver (src < 0 or > width) shows the refracted source, not the unscaled one
        const expected = sourceAt(src, box.width);
        expectClose(pixelAt(raster, x, y), expected, 3);
        if (
          Math.abs(sourceAt(src, box.width)[0] - sourceAt(px, box.width)[0]) > 8
        )
          differs++;
      }
    }
    expect(differs).toBeGreaterThan(20); // refraction visibly moves colours
  });

  it("refracts angled reeds in the reeds' own frame while the source stays upright", () => {
    const box = { width: 80, height: 40 };
    const refraction = 0.35;
    const k = 1 - refraction;
    const reeds = 4;
    const a = (30 * Math.PI) / 180;
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    const length = box.width * cos + box.height * sin;
    const u0 = box.width / 2 - length / 2;
    const reed = length / reeds;
    const rng = createRng(1);
    const jitter = Array.from(
      { length: reeds },
      () => rng.range(-0.5, 0.5) * refraction * reed,
    );
    const s: FlutedSpec = { ...spec, direction: "angle", angle: 30, shade: 0 };
    const raster = rasterize(gradientSvg(s));
    const [cx, cy] = [box.width / 2, box.height / 2];
    let checked = 0;
    for (let y = 0; y < box.height; y += 2) {
      for (let x = 0; x < box.width; x += 2) {
        const [dx, dy] = [x + 0.5 - cx, y + 0.5 - cy];
        // into the reeds' frame (rotate by -angle about the centre)
        const u = cx + dx * cos + dy * sin;
        const v = cy - dx * sin + dy * cos;
        const i = Math.floor((u - u0) / reed);
        if (Math.min(u - u0 - i * reed, u0 + (i + 1) * reed - u) < 1.5)
          continue;
        const centre = u0 + (i + 0.5) * reed;
        const su = centre + (u - centre - Number(jitter[i])) / k;
        // back out to the upright source
        // (the linear source only varies along x, so y is not needed)
        const qx = cx + (su - cx) * cos - (v - cy) * sin;
        // the whole canvas, slanted top and bottom edges of the scaled copy included
        expectClose(pixelAt(raster, x, y), sourceAt(qx, box.width), 3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(600);
  });

  it("draws a gradient source only where the reed shows it, and a pattern at canvas size", () => {
    const pieceRects = (g: string): string[] =>
      g.match(/<rect [^>]*fill="url\(#vis1-src-g\)"[^>]*\/>/g) ?? [];
    const rects = (source: GradientSpec): string[] =>
      pieceRects(gradient({ ...spec, source }).defs).slice(1); // [0] is the base
    for (const gradientSource of [
      source,
      { kind: "radial", stops: ["#000", "#fff"] },
      { kind: "banded", bands: 3, stops: ["#000", "#fff"] },
    ] as const) {
      expect(rects(gradientSource), gradientSource.kind).toHaveLength(4);
      for (const r of rects(gradientSource)) expect(r).toContain(" x=");
    }
    for (const source of [
      { kind: "conic", stops: ["#000", "#fff"] },
      { kind: "radial", shape: "ellipse", stops: ["#000", "#fff"] },
    ] as const) {
      expect(rects(source)).toHaveLength(4);
      for (const r of rects(source)) {
        expect(r).toContain('width="80" height="40"');
        expect(r).not.toContain(" x=");
      }
    }
  });

  it("caps render cost across nesting, naming the cost and the limit", () => {
    const linear: GradientSpec = { kind: "linear", stops: ["#000", "#fff"] };
    const conic: GradientSpec = { kind: "conic", stops: ["#000", "#fff"] };
    const over = (source: GradientSpec, reeds?: number): FlutedSpec =>
      reeds === undefined
        ? { kind: "fluted", source, size: spec.size }
        : { kind: "fluted", source, reeds, size: spec.size };
    const refused = (s: FlutedSpec): void => {
      expect(() => gradient(s)).toThrow(VisError);
      expect(() => gradient(s)).toThrow("exceeds 256");
    };
    // one level: 256 reeds over a gradient is the legal worst case; patterns weigh 4
    expect(() => gradient(over(linear, 256))).not.toThrow();
    expect(() => gradient(over(conic, 64))).not.toThrow();
    refused(over(conic, 65));
    expect(() => gradient(over(conic, 256))).toThrow("cost 1024");
    // nested directly: the reeds multiply, down to the leaf's weight
    expect(() => gradient(over(over(linear, 16), 16))).not.toThrow();
    expect(() => gradient(over(over(conic, 8), 8))).not.toThrow();
    expect(() => gradient(over(over(over(linear, 4), 4), 4))).not.toThrow();
    refused(over(over(linear, 16), 17));
    refused(over(over(conic, 8), 9));
    refused(over(over(conic, 16), 16));
    refused(over(over(over(linear, 8), 8), 8));
    expect(() => gradient(over(over(linear, 64), 64))).toThrow("cost 4096");
    // default reeds (24) count too
    refused(over(over(linear)));
    // through layers: the layers add, the enclosing reeds multiply
    const layered = (...layers: GradientSpec[]): GradientSpec => ({
      kind: "layers",
      layers,
    });
    expect(() => gradient(over(layered(linear, linear), 128))).not.toThrow();
    refused(over(layered(linear, linear), 129));
    expect(() =>
      gradient(over(layered(linear, over(linear, 4)), 8)),
    ).not.toThrow();
    refused(over(layered(over(linear, 16), over(linear, 16)), 9));
    refused(over(layered(layered(over(linear, 16), over(linear, 16))), 9));
  });

  it("leaves malformed nested specs to their own validation", () => {
    const wrap = (source: unknown): FlutedSpec => ({
      kind: "fluted",
      source: source as never,
      reeds: 2,
      size: spec.size,
    });
    expect(() =>
      gradient(wrap({ kind: "fluted", reeds: "x", source: 5 })),
    ).toThrow(VisError);
    expect(() => gradient(wrap({ kind: "layers", layers: "x" }))).toThrow(
      VisError,
    );
  });

  it("reeds a pattern-based source (conic) without moving it when nothing refracts", () => {
    const conic = {
      kind: "conic",
      stops: ["#ef4444", "#10abba", "#ef4444"],
    } as const;
    const box = { width: 40, height: 40 };
    const plain = rasterize(gradientSvg({ ...conic, size: box }));
    const reeded = rasterize(
      gradientSvg({
        kind: "fluted",
        source: conic,
        reeds: 4,
        refraction: 0,
        shade: 0,
        size: box,
      }),
    );
    let checked = 0;
    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) {
        if (Math.abs((x % 10) - 5) > 3) continue; // clear of the reed edges
        expectClose(pixelAt(reeded, x, y), pixelAt(plain, x, y), 2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(600);
  });

  it("nests inside layers with a valid CSS stack", () => {
    const g = gradient({
      kind: "layers",
      layers: [{ kind: "linear", stops: ["#000", "#fff"] }, spec],
      size: spec.size,
    });
    expect(cssLayers(g.css)).toHaveLength(3);
  });

  it("is byte-identical for the same spec", () => {
    expect(gradient(spec)).toEqual(gradient({ ...spec }));
  });

  it("matches its golden", () => {
    expectGolden("gradient/fluted.svg", gradientSvg({ ...spec, grain: 0.2 }));
  });
});
