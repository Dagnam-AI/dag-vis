import { describe, expect, it } from "vitest";

import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "./render.js";

describe("conic gradient", () => {
  it("renders CSS conic and an SVG wedge pattern", () => {
    const g = gradient({
      kind: "conic",
      from: 30,
      at: [0.25, 0.75],
      stops: ["#f00", "#0f0", "#00f"],
      size: { width: 100, height: 100 },
    });
    expect(g.css).toBe(
      "background: conic-gradient(from 30deg at 25% 75%, #ff0000 0%, #00ff00 50%, #0000ff 100%);",
    );
    expect(g.defs).toContain(
      '<pattern id="vis1-g" patternUnits="userSpaceOnUse" width="100" height="100">',
    );
    expect((g.defs.match(/<path /g) ?? []).length).toBe(360);
  });

  it("supports repeat (repeating-conic-gradient, wrapped sampling) and reverse", () => {
    const g = gradient({
      kind: "conic",
      stops: [
        { color: "#000", at: 0 },
        { color: "#fff", at: 0.5 },
      ],
      repeat: true,
      reverse: true,
    });
    expect(g.css).toContain(
      "repeating-conic-gradient(from 0deg at 50% 50%, #ffffff 50%, #000000 100%)",
    );
    expect((g.defs.match(/<path /g) ?? []).length).toBe(360);
  });

  it("emits fill-opacity only for translucent wedges", () => {
    const g = gradient({
      kind: "conic",
      stops: [
        { color: "#fff", at: 0, opacity: 0.5 },
        { color: "#fff", at: 1, opacity: 0.5 },
      ],
    });
    expect(g.defs).toContain("fill-opacity=");
    expect(g.defs).toContain('fill="#ffffff" fill-opacity="0.5"/>');
  });

  it("interpolates in sRGB like CSS (red→green midpoint is #808000, not OKLab's #d0a800)", () => {
    const img = rasterize(
      gradientSvg({
        kind: "conic",
        stops: ["#f00", "#0f0"],
        size: { width: 100, height: 100 },
      }),
    );
    // 180° (straight down from the centre) is t = 0.5.
    const [r, g, b] = pixelAt(img, 50, 90);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(3);
    expect(Math.abs(g - 128)).toBeLessThanOrEqual(3);
    expect(b).toBe(0);
    // and the wedge colours themselves are sRGB lerps (wedge 179/180 straddle t = 0.5)
    const fills = [
      ...gradient({ kind: "conic", stops: ["#f00", "#0f0"] }).defs.matchAll(
        /<path [^>]*fill="(#[0-9a-f]{6})"/g,
      ),
    ].map((m) => m[1]);
    expect(fills).toHaveLength(360);
    expect(fills[179]).toBe("#807f00");
    expect(fills[180]).toBe("#7f8000");
  });

  it("has no seams: every pixel of an opaque 1200×630 conic is fully opaque", () => {
    const img = rasterize(
      gradientSvg({
        kind: "conic",
        at: [0.3, 0.6],
        stops: ["#ef4444", "#edc41c", "#1bd766", "#10abba", "#ef4444"],
        size: { width: 1200, height: 630 },
      }),
    );
    let min = 255;
    for (let i = 3; i < img.pixels.length; i += 4) {
      min = Math.min(min, Number(img.pixels[i]));
    }
    expect(min).toBe(255);
  });

  it("draws translucent conics without seams or doubled alpha", () => {
    const img = rasterize(
      gradientSvg({
        kind: "conic",
        stops: [
          { color: "#fff", at: 0, opacity: 0.5 },
          { color: "#fff", at: 1, opacity: 0.5 },
        ],
        size: { width: 1200, height: 630 },
      }),
    );
    let min = 255;
    let max = 0;
    for (let i = 3; i < img.pixels.length; i += 4) {
      min = Math.min(min, Number(img.pixels[i]));
      max = Math.max(max, Number(img.pixels[i]));
    }
    expect(min).toBeGreaterThanOrEqual(126);
    expect(max).toBeLessThanOrEqual(129);
  });

  it("matches its golden", () => {
    expectGolden(
      "gradient/conic.svg",
      gradientSvg({
        kind: "conic",
        stops: ["#ef4444", "#edc41c", "#1bd766", "#10abba", "#ef4444"],
        size: { width: 80, height: 60 },
      }),
    );
  });
});
