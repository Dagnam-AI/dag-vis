import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { LOGO, LOGO_ICON_WEIGHT, logoSvg } from "../../src/brand/logo.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("LOGO", () => {
  it("carries the verbatim viewBox and a single closed path", () => {
    expect(LOGO.viewBox).toBe("199 193 628 628");
    expect(LOGO).toMatchObject({ x: 199, y: 193, width: 628, height: 628 });
    expect(LOGO.path.startsWith("M615.026245,442.038239")).toBe(true);
    expect(LOGO.path.endsWith("Z")).toBe(true);
    expect(LOGO.path).not.toMatch(/\s{2,}|\n/);
  });
});

describe("LOGO_ICON_WEIGHT", () => {
  it("is the one named stroke weight of the icon surfaces, in mark units", () => {
    expect(LOGO_ICON_WEIGHT).toBe(48);
  });
});

describe("logoSvg", () => {
  it("defaults to a 256px transparent mark in brand red", () => {
    const svg = logoSvg();
    expect(svg).toContain('width="256" height="256"');
    expect(svg).toContain('fill="#ef4444"');
    expect(svg).not.toContain("<rect");
    expectGolden("brand/logo-default.svg", svg);
  });

  it("adds an opaque background and padding when asked", () => {
    const svg = logoSvg({
      color: "#ffffff",
      size: 180,
      background: "#0a0a0a",
      padding: 0.125,
    });
    expect(svg).toContain('<rect width="180" height="180" fill="#0a0a0a"/>');
    expect(svg).toContain("translate(22.5 22.5)");
    expectGolden("brand/logo-apple-touch.svg", svg);
  });

  it("is deterministic", () => {
    expect(logoSvg({ size: 64 })).toBe(logoSvg({ size: 64 }));
  });

  it("validates colour, size and padding", () => {
    expect(() => logoSvg({ color: "nope" })).toThrow(VisError);
    expect(() => logoSvg({ size: 0 })).toThrow(VisError);
    expect(() => logoSvg({ padding: 0.5 })).toThrow(VisError);
    expect(() => logoSvg({ padding: -0.1 })).toThrow(VisError);
  });

  it("names the colour parameter and takes null or a non-string for none", () => {
    for (const color of [5, null, {}, [], true, "nope", "x".repeat(200)])
      expect(() => logoSvg({ color } as never)).toThrow(/^color/);
    for (const background of [5, null, {}, [], true, "nope"])
      expect(() => logoSvg({ background } as never)).toThrow(/^background/);
    for (const bad of [5, null])
      expect(() => logoSvg({ color: bad } as never)).toThrow(VisError);
    expect(logoSvg({ color: undefined, background: undefined } as never)).toBe(
      logoSvg(),
    );
    expect(logoSvg({ color: "rgb(255 0 0 / 50%)" })).toContain(
      'fill="#ff000080"',
    );
  });

  it("caps the size at 16384 and rejects null and non-numeric values by name", () => {
    expect(logoSvg({ size: 16384 })).toContain('width="16384"');
    expect(logoSvg({ size: 1 })).toContain('width="1"');
    for (const size of [16385, 0.5, Number.NaN, null, "64", {}])
      expect(() => logoSvg({ size } as never)).toThrow(/logo size/);
    for (const padding of [null, "0.1", {}])
      expect(() => logoSvg({ padding } as never)).toThrow(/logo padding/);
    for (const opts of [null, 5, "x"])
      expect(() => logoSvg(opts as never)).toThrow(/options must be an object/);
  });

  describe("weight", () => {
    it("adds a same-colour round-joined stroke and keeps the plain mark untouched", () => {
      const heavy = logoSvg({ weight: LOGO_ICON_WEIGHT, padding: 0.06 });
      expect(heavy).toContain(
        'fill="#ef4444" stroke="#ef4444" stroke-width="48" stroke-linejoin="round"',
      );
      expect(logoSvg({ weight: 0 })).toBe(logoSvg());
      expect(logoSvg()).not.toContain("stroke");
      expectGolden("brand/logo-icon-weight.svg", heavy);
    });

    it("grows the fitted box by the weight, so the ink stays inside the padding", () => {
      // Opaque red on transparent: the first and last columns/rows holding ink bound the mark.
      const size = 256;
      const padding = 0.1;
      for (const weight of [0, 24, LOGO_ICON_WEIGHT, 200]) {
        const r = rasterize(logoSvg({ size, padding, weight }));
        let minX = size;
        let maxX = -1;
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++)
            if (pixelAt(r, x, y)[3] > 0) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x + 1);
            }
        expect(minX, `weight ${weight}`).toBeGreaterThanOrEqual(
          size * padding - 1,
        );
        expect(maxX, `weight ${weight}`).toBeLessThanOrEqual(
          size * (1 - padding) + 1,
        );
        // the mark's own width (614 of the 628 box) fills the box to within the viewBox slack
        expect(maxX - minX).toBeGreaterThan(size * (1 - 2 * padding) * 0.9);
      }
    });

    it("is thicker: more pixels covered at the same size", () => {
      const covered = (weight: number): number => {
        const r = rasterize(logoSvg({ size: 64, padding: 0.05, weight }));
        let n = 0;
        for (let i = 3; i < r.pixels.length; i += 4) n += Number(r.pixels[i]);
        return n;
      };
      expect(covered(LOGO_ICON_WEIGHT)).toBeGreaterThan(covered(0) * 1.5);
    });

    it("validates the weight by name", () => {
      for (const weight of [-1, 201, Number.NaN, Infinity, "48", null, {}])
        expect(() => logoSvg({ weight } as never)).toThrow(/logo weight/);
      expect(logoSvg({ weight: undefined } as never)).toBe(logoSvg());
    });
  });
});
