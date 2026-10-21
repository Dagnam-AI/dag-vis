import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const spec = {
  kind: "aurora",
  palette: ["#ef4444", "#10abba", "#edc41c"],
  size: { width: 120, height: 80 },
} as const;

interface Stop {
  rgb: [number, number, number];
  a: number;
  f: number;
}
interface CssBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  stops: Stop[];
}

/** Read the CSS this kind emits: blobs top first (in px of `size`), then the base colour. */
function parseCss(
  css: string,
  size: { width: number; height: number },
): { blobs: CssBlob[]; base: [number, number, number] } {
  const blobs = [
    ...css.matchAll(
      /radial-gradient\(ellipse ([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%, (.*?)\)(?=,|;)(?!,\s\d)/g,
    ),
  ].map((m) => ({
    rx: (Number(m[1]) / 100) * size.width,
    ry: (Number(m[2]) / 100) * size.height,
    x: (Number(m[3]) / 100) * size.width,
    y: (Number(m[4]) / 100) * size.height,
    stops: [
      ...(m[5] ?? "").matchAll(
        /rgba\((\d+), (\d+), (\d+), ([\d.]+)\) ([\d.]+)%/g,
      ),
    ].map((s) => ({
      rgb: [Number(s[1]), Number(s[2]), Number(s[3])] as [
        number,
        number,
        number,
      ],
      a: Number(s[4]),
      f: Number(s[5]) / 100,
    })),
  }));
  const hex = /, #([0-9a-f]{6});$/.exec(css)?.[1] ?? "";
  const n = parseInt(hex, 16);
  return { blobs, base: [(n >> 16) & 255, (n >> 8) & 255, n & 255] };
}

/** CSS alpha at normalised radius f: linear between stops, transparent past the last. */
function alphaAt(stops: readonly Stop[], f: number): number {
  const hi = stops.findIndex((s) => s.f >= f);
  const b = stops[hi];
  if (!b) return 0;
  const a = stops[hi - 1];
  return a ? a.a + ((b.a - a.a) * (f - a.f)) / (b.f - a.f) : b.a;
}

/** What a browser paints at pixel (x, y): blobs composited bottom to top over the base. */
function cssPixel(
  parsed: ReturnType<typeof parseCss>,
  x: number,
  y: number,
): number[] {
  let out: number[] = [...parsed.base];
  for (const b of [...parsed.blobs].reverse()) {
    const f = Math.hypot((x + 0.5 - b.x) / b.rx, (y + 0.5 - b.y) / b.ry);
    const a = alphaAt(b.stops, f);
    const rgb = b.stops[0]?.rgb ?? [0, 0, 0];
    out = out.map((v, c) => v * (1 - a) + Number(rgb[c]) * a);
  }
  return out;
}

describe("aurora gradient", () => {
  it("draws seeded blurred ellipses over a dark base, with a CSS radial fallback", () => {
    const g = gradient(spec);
    expect(g.defs).toContain('<filter id="vis1-blur"');
    expect(g.defs).toContain("<feGaussianBlur");
    expect((g.defs.match(/<ellipse /g) ?? []).length).toBe(5);
    expect(g.defs).toContain('fill="#0a0a0a"');
    expect(g.css.startsWith("background: radial-gradient(")).toBe(true);
    expect(g.css.endsWith(", #0a0a0a;")).toBe(true);
  });

  it("changes with the seed and blob count, and honours base", () => {
    expect(gradient({ ...spec, seed: 2 }).defs).not.toBe(gradient(spec).defs);
    expect(
      (gradient({ ...spec, blobs: 2 }).defs.match(/<ellipse /g) ?? []).length,
    ).toBe(2);
    expect(gradient({ ...spec, base: "#ffffff" }).defs).toContain(
      'fill="#ffffff"',
    );
  });

  it("is byte-identical for the same seed", () => {
    expect(gradient(spec)).toEqual(gradient({ ...spec }));
  });

  it("validates palette, blob count and base", () => {
    expect(() => gradient({ ...spec, palette: [] })).toThrow(VisError);
    expect(() => gradient({ ...spec, palette: "x" as never })).toThrow(
      VisError,
    );
    expect(() => gradient({ ...spec, blobs: 0 })).toThrow(VisError);
    expect(() => gradient({ ...spec, blobs: 65 })).toThrow(VisError);
    expect(() => gradient({ ...spec, blobs: 1.5 })).toThrow(VisError);
    expect(() => gradient({ ...spec, base: "nope" })).toThrow(VisError);
  });

  it("CSS fallback describes the blobs the SVG blurs (resvg vs CSS maths)", () => {
    let worst = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = { ...spec, seed, size: { width: 200, height: 120 } } as const;
      const parsed = parseCss(gradient(s).css, s.size);
      expect(parsed.blobs).toHaveLength(5);
      const raster = rasterize(gradientSvg(s));
      for (let y = 0; y < 120; y += 3) {
        for (let x = 0; x < 200; x += 3) {
          const want = cssPixel(parsed, x, y);
          const px = pixelAt(raster, x, y);
          for (let c = 0; c < 3; c++)
            worst = Math.max(worst, Math.abs(Number(px[c]) - Number(want[c])));
        }
      }
    }
    // Measured worst channel error is 10.3 of 255 (4%), in overlaps and thin blobs; the
    // SVG blur is resvg's box-blur approximation of a Gaussian. 12 leaves headroom.
    expect(worst).toBeLessThanOrEqual(12);
  });

  it("the CSS ellipse is the SVG ellipse grown by the feather, same centre", () => {
    const one = {
      ...spec,
      blobs: 1,
      size: { width: 200, height: 120 },
    } as const;
    const g = gradient(one);
    const svg =
      /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+) ([\d.]+)\)/.exec(g.defs);
    const blob = parseCss(g.css, one.size).blobs[0];
    expect(blob?.x).toBeCloseTo(Number(svg?.[1]), 0);
    expect(blob?.y).toBeCloseTo(Number(svg?.[2]), 0);
    expect(blob?.rx).toBeCloseTo(Number(svg?.[3]) * 1.5, 0);
    expect(blob?.ry).toBeCloseTo(Number(svg?.[4]) * 1.5, 0);
  });

  it("matches its golden", () => {
    expectGolden("gradient/aurora.svg", gradientSvg(spec));
  });
});
