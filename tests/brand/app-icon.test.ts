import { describe, expect, it } from "vitest";

import { APP_ICON, appIconSvg } from "../../src/brand/app-icon.js";
import { BRAND } from "../../src/brand/tokens.js";
import { VisError } from "../../src/core/errors.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const MARK = [0xca, 0x03, 0x03, 255];
const PLATE = [0x0a, 0x0a, 0x0a];

describe("APP_ICON", () => {
  it("is Apple's icon grid: an 824 px plate centred on a 1024 canvas", () => {
    expect(APP_ICON).toEqual({
      canvas: 1024,
      plate: 824,
      exponent: 5,
      markBox: 480,
    });
  });
});

describe("appIconSvg", () => {
  it("draws the plate and the heavy deep-red mark on a transparent 1024 canvas", () => {
    const svg = appIconSvg();
    expect(svg).toContain('width="1024" height="1024" viewBox="0 0 1024 1024"');
    expect(svg).toContain('fill="#0a0a0a"'); // plate: BRAND.background.dark
    expect(svg).toContain('fill="#ca0303" stroke="#ca0303" stroke-width="48"');
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg).not.toContain("<rect"); // no square backdrop: the corners are transparent
    expectGolden("brand/app-icon.svg", svg);
  });

  it("takes its default colours from the brand tokens, not a second copy", () => {
    expect(appIconSvg()).toBe(
      appIconSvg({ color: BRAND.mark, background: BRAND.background.dark }),
    );
  });

  it("rasterises with the margin transparent, the plate opaque and the mark deep red", () => {
    const r = rasterize(appIconSvg());
    expect(r.width).toBe(1024);
    expect(pixelAt(r, 4, 4)[3]).toBe(0); // canvas corner
    expect(pixelAt(r, 60, 512)[3]).toBe(0); // inside the 100 px margin
    expect(pixelAt(r, 964, 512)[3]).toBe(0);
    expect(pixelAt(r, 512, 60)[3]).toBe(0);
    expect(pixelAt(r, 125, 125)[3]).toBe(0); // the plate's rounded corner is cut away
    for (const [x, y] of [
      [140, 512],
      [884, 512],
      [512, 140],
      [512, 884],
    ] as const) {
      const [pr, pg, pb, pa] = pixelAt(r, x, y);
      expect(pa).toBe(255);
      // the plate is #0a0a0a under a faint top sheen: dark, neutral, never red
      expect(pr).toBeLessThan(40);
      expect(pr - pb).toBeLessThan(3);
      expect(pg).toBe(pr);
      expect(pr).toBeGreaterThanOrEqual(PLATE[0] ?? 0);
    }
    expect(pixelAt(r, 340, 512)).toEqual(MARK); // the middle bar
  });

  it("outlines a squircle: the plate edge follows |x|^5 + |y|^5 = 1 at every angle", () => {
    const r = rasterize(appIconSvg());
    const half = APP_ICON.plate / 2;
    for (let deg = 0; deg < 90; deg += 7.5) {
      const t = (deg * Math.PI) / 180;
      const ex = half * Math.cos(t) ** (2 / APP_ICON.exponent);
      const ey = half * Math.sin(t) ** (2 / APP_ICON.exponent);
      const at = (k: number): number =>
        pixelAt(
          r,
          Math.round(APP_ICON.canvas / 2 + k * ex),
          Math.round(APP_ICON.canvas / 2 + k * ey),
        )[3];
      expect(at(0.985), `${deg} deg inside`).toBe(255);
      expect(at(1.02), `${deg} deg outside`).toBe(0);
    }
  });

  it("scales the whole drawing to `size`", () => {
    const small = appIconSvg({ size: 64 });
    expect(small).toContain('width="64" height="64" viewBox="0 0 1024 1024"');
    const r = rasterize(small);
    expect(r.width).toBe(64);
    expect(pixelAt(r, 0, 0)[3]).toBe(0);
    expect(pixelAt(r, 32, 32)[3]).toBe(255);
  });

  it("honours colour and plate overrides, normalising them", () => {
    const svg = appIconSvg({ color: "RGB(255, 255, 255)", background: "#ABC" });
    expect(svg).toContain('fill="#ffffff" stroke="#ffffff"');
    expect(svg).toContain('fill="#aabbcc"');
    expect(svg).not.toContain("#ca0303");
  });

  it("is deterministic", () => {
    expect(appIconSvg({ size: 128 })).toBe(appIconSvg({ size: 128 }));
  });

  it("validates size and colours by name", () => {
    for (const size of [0, 0.5, 16385, Number.NaN, "64", null, {}])
      expect(() => appIconSvg({ size } as never)).toThrow(/app icon size/);
    for (const color of ["nope", 5, null, {}])
      expect(() => appIconSvg({ color } as never)).toThrow(/^color/);
    for (const background of ["nope", 5, null, {}])
      expect(() => appIconSvg({ background } as never)).toThrow(/^background/);
    for (const opts of [null, 5, "x"])
      expect(() => appIconSvg(opts as never)).toThrow(VisError);
    expect(
      appIconSvg({
        size: undefined,
        color: undefined,
        background: undefined,
      } as never),
    ).toBe(appIconSvg());
  });
});
