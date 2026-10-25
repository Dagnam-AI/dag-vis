import { describe, expect, it } from "vitest";

import { MOONHOUSE } from "../../src/brand/moonhouse-metrics.js";
import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import { ogCard } from "../../src/scene/og-card.js";
import { fontWidth } from "../../src/scene/text-fonts.js";
import { textContent } from "../helpers/svg-text.js";
import { rasterize } from "../helpers/render.js";
import type { Raster } from "../helpers/render.js";

const card = ogCard({
  title: "Build AI Systems Visually",
  subtitle: "A simpler way to design and orchestrate modern AI workflows.",
  eyebrow: "Docs",
  footer: "Visual • Modular • Production-ready",
  theme: "light",
});

/** WCAG relative luminance of an sRGB colour given as 0..255 channels. */
function luminance([r, g, b]: readonly number[]): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((v = 0) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hex(h: string): number[] {
  return [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}

/** The darkest background pixel inside a box, the worst case for dark text. */
function darkest(r: Raster, x0: number, y0: number, x1: number, y1: number) {
  let best = [255, 255, 255];
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(r.height, y1); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(r.width, x1); x++) {
      const i = (y * r.width + x) * 4;
      const px = [r.pixels[i] ?? 0, r.pixels[i + 1] ?? 0, r.pixels[i + 2] ?? 0];
      if (luminance(px) < luminance(best)) best = px;
    }
  return best;
}

describe("ogCard light theme", () => {
  it("is a crisp deep-red hairline motif, not a pink wash", () => {
    const { width, height, pixels } = rasterize(card);
    // Pale red-tinted pixels that are neither white nor a drawn line. The old
    // card (wide glow, band 0.18, grey vignette) measured 19.9%; the fog now
    // stays inside a tight glow and the strokes' own halo.
    let haze = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const rg = (pixels[i] ?? 0) - (pixels[i + 1] ?? 0);
      if (rg >= 8 && rg <= 70 && (pixels[i + 1] ?? 0) > 180) haze++;
    }
    // Measured 0.0621 (the earlier wider glow measured 0.0793; fonts do not matter, it
    // was 0.0791 without text) against this 0.07 bound: about 0.8 points of headroom,
    // 13 points under the old card. A tweak that moves it past the bound is a real
    // change to the look, not noise.
    expect(haze / (width * height)).toBeLessThan(0.07);
    // A white page: the far-left corner is pure white (no vignette).
    expect([...pixels.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it("draws the accents in the deep mark red", () => {
    expect(card).toContain('fill="#ca0303">.AI</tspan>');
    expect(card).toContain('fill="#ca0303" fill-opacity="1">•</tspan>');
    expect(card).not.toContain("#ef4444");
  });

  it("keeps title >= 7:1 and subtitle, footer, eyebrow >= 4.5:1 over the darkest background behind each line", () => {
    // The text-free card is the background alone.
    const bg = rasterize(card.replace(/<text[\s\S]*?<\/text>/g, ""));
    const seen: Record<string, number> = {};
    /** Contrast of `colour` at `alpha` over the darkest background pixel in the box. */
    const over = (
      colour: number[],
      alpha: number,
      box: [number, number, number, number],
    ): number => {
      const behind = darkest(bg, ...box);
      const ink = colour.map(
        (c, i) => c * alpha + (behind[i] ?? 0) * (1 - alpha),
      );
      return contrast(ink, behind);
    };
    const tspans: { colour: string; glyph: string; ratio: number }[] = [];
    for (const m of card.matchAll(/<text ([^>]*)>(.*?)<\/text>/g)) {
      const attrs = m[1] ?? "";
      const num = (name: string): number =>
        Number(new RegExp(`${name}="([-\\d.]+)"`).exec(attrs)?.[1]);
      const size = num("font-size");
      const [x, y] = [num("x"), num("y")];
      const colour = hex(/fill="(#[0-9a-f]{6})"/.exec(attrs)?.[1] ?? "#000000");
      // `opacity` or `fill-opacity`: the regex matches the tail of both.
      const alpha = Number(/opacity="([\d.]+)"/.exec(attrs)?.[1] ?? 1);
      const font = /font-family="moonhouse/i.test(attrs)
        ? MOONHOUSE
        : UNBOUNDED;
      const line = textContent(m[2] ?? "");
      const wide =
        fontWidth(font, line, size) +
        (num("letter-spacing") || 0) * Array.from(line).length;
      const box: [number, number, number, number] = [
        x,
        y - size,
        x + wide,
        y + 0.25 * size,
      ];
      seen[String(size)] = Math.min(
        seen[String(size)] ?? Infinity,
        over(colour, alpha, box),
      );
      // The red `.AI` and the red bullets are tspans with their own fill: check them over
      // the whole line's box, which is the darkest background they can sit on.
      for (const t of (m[2] ?? "").matchAll(
        /<tspan [^>]*fill="(#[0-9a-f]{6})"[^>]*>(.*?)<\/tspan>/g,
      ))
        tspans.push({
          colour: t[1] ?? "",
          glyph: t[2] ?? "",
          // A tspan's own fill-opacity replaces the line's, as in SVG.
          ratio: over(
            hex(t[1] ?? "#000000"),
            Number(/fill-opacity="([\d.]+)"/.exec(t[0])?.[1] ?? alpha),
            box,
          ),
        });
    }
    // The title is the largest text on the card; every other line is held to 4.5:1.
    const title = Math.max(...Object.keys(seen).map(Number));
    expect(Object.keys(seen).length).toBeGreaterThan(3);
    for (const [size, ratio] of Object.entries(seen))
      expect(ratio, `font-size ${size}`).toBeGreaterThanOrEqual(
        Number(size) === title ? 7 : 4.5,
      );
    // `.AI` (wordmark) and the footer's bullets are red on the page: 4.5:1. The bullets sit
    // in a 60% line (3.3:1 as it was), so they carry their own full fill-opacity.
    expect(tspans.map((t) => t.glyph).sort()).toEqual([".AI", "•", "•"]);
    for (const { colour, glyph, ratio } of tspans) {
      expect(colour).toBe("#ca0303");
      expect(ratio, `tspan ${glyph}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
