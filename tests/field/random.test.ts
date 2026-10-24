import { describe, expect, it } from "vitest";

import { VisError, parseColor } from "../../src/core/index.js";
import { rgbToOklab } from "../../src/field/oklab.js";
import { randomFlow } from "../../src/field/random.js";
import type { FlowMood } from "../../src/field/random.js";
import { resolveField } from "../../src/field/spec.js";

const MOODS: readonly FlowMood[] = ["dark", "light", "vivid"];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

/** OKLab lightness and chroma of a palette entry as the renderer sees it (gamut-clamped). */
function lightAndChroma(colour: string): { L: number; C: number } {
  const c = parseColor(colour);
  const [L, a, b] = rgbToOklab(c.r, c.g, c.b);
  return { L, C: Math.hypot(a, b) };
}

const palette = (seed: number, mood: FlowMood): string[] => [
  ...randomFlow({ seed, mood }).palette,
];

describe("randomFlow", () => {
  it("is deterministic per seed, differs between seeds and validates", () => {
    const a = randomFlow({ seed: 5 });
    expect(randomFlow({ seed: 5 })).toEqual(a);
    expect(a.seed).toBe(5);
    expect(a.kind).toBe("flow");
    expect(() => resolveField(a)).not.toThrow();
    const distinct = new Set(
      SEEDS.map((seed) => JSON.stringify(randomFlow({ seed }))),
    );
    expect(distinct.size).toBe(SEEDS.length);
  });

  it("defaults to seed 1 and the dark mood, only for undefined", () => {
    expect(randomFlow()).toEqual(randomFlow({ seed: 1, mood: "dark" }));
    expect(randomFlow({})).toEqual(randomFlow());
    expect(randomFlow({ seed: undefined, mood: undefined })).toEqual(
      randomFlow(),
    );
    expect(() => randomFlow(undefined)).not.toThrow();
  });

  it("accepts the whole seed range the resolver accepts", () => {
    for (const seed of [0, 4294967295]) {
      expect(randomFlow({ seed }).seed).toBe(seed);
      expect(() => resolveField(randomFlow({ seed }))).not.toThrow();
    }
  });

  it("returns specs that resolve, with 3 to 5 colours, in every mood", () => {
    for (const mood of MOODS)
      for (const seed of SEEDS) {
        const spec = randomFlow({ seed, mood });
        expect(spec.palette.length).toBeGreaterThanOrEqual(3);
        expect(spec.palette.length).toBeLessThanOrEqual(5);
        expect(() => resolveField(spec)).not.toThrow();
      }
  });

  it("writes the lightness and chroma it asked for into each colour string", () => {
    for (const mood of MOODS)
      for (const seed of SEEDS)
        for (const c of palette(seed, mood)) {
          const L = Number(/oklch\(([\d.]+)%/.exec(c)?.[1]);
          const chroma = Number(/% ([\d.]+) /.exec(c)?.[1]);
          if (mood === "dark") expect(L).toBeLessThanOrEqual(60);
          if (mood === "light") expect(L).toBeGreaterThanOrEqual(65);
          if (mood === "vivid") expect(chroma).toBeGreaterThanOrEqual(0.2);
        }
  });

  // The bands are written into the oklch() strings (previous test). These bounds are on the
  // colours as displayed, clamped to sRGB: dark reaches a real L of 0.647 (written 0.60),
  // vivid chroma falls to 0.077 (mean 0.183) and a few palettes are not monotone once
  // clamped, so the tolerances are wider than the bands on purpose.
  it("dark palettes are dark, light palettes are light and vivid ones are saturated, by real luminance", () => {
    const mean = (xs: number[]): number =>
      xs.reduce((s, x) => s + x, 0) / xs.length;
    const meanL: Record<string, number> = {};
    const meanC: Record<string, number> = {};
    for (const mood of MOODS) {
      const all = SEEDS.flatMap((seed) =>
        palette(seed, mood).map(lightAndChroma),
      );
      meanL[mood] = mean(all.map((x) => x.L));
      meanC[mood] = mean(all.map((x) => x.C));
      for (const { L, C } of all) {
        // Out-of-gamut colours are clamped, which can lift a dark one a little past 0.60.
        if (mood === "dark") expect(L).toBeLessThan(0.66);
        if (mood === "light") expect(L).toBeGreaterThan(0.62);
        if (mood === "vivid") {
          expect(L).toBeGreaterThan(0.38);
          expect(L).toBeLessThan(0.9);
          expect(C).toBeGreaterThan(0.05);
        }
      }
      // The last colour is lighter than the first (not every step: clamping can dent a few palettes).
      for (const seed of SEEDS) {
        const ls = palette(seed, mood).map((c) => lightAndChroma(c).L);
        expect(ls[0]).toBeLessThan(ls.at(-1)!);
      }
    }
    expect(meanL.dark).toBeLessThan(0.45);
    expect(meanL.light).toBeGreaterThan(0.75);
    expect(meanL.dark).toBeLessThan(meanL.vivid!);
    expect(meanL.vivid).toBeLessThan(meanL.light!);
    expect(meanC.vivid).toBeGreaterThan(0.15);
    expect(meanC.vivid).toBeGreaterThan(meanC.dark!);
    expect(meanC.vivid).toBeGreaterThan(meanC.light!);
  });

  it("rejects an unknown mood, including names that exist on every object", () => {
    for (const mood of [
      "__proto__",
      "toString",
      "constructor",
      "hasOwnProperty",
      "Dark",
      "",
      5,
      null,
      {},
    ])
      expect(() => randomFlow({ mood } as never), JSON.stringify(mood)).toThrow(
        /mood/,
      );
    expect(() => randomFlow({ mood: "toString" } as never)).toThrow(VisError);
  });

  it("rejects seeds the generator cannot honour", () => {
    for (const seed of [
      1.5,
      Number.NaN,
      Infinity,
      2 ** 53,
      -1,
      4294967296,
      "5",
      null,
      {},
    ])
      expect(() => randomFlow({ seed } as never), JSON.stringify(seed)).toThrow(
        /seed/,
      );
  });

  it("rejects options that are not an object", () => {
    for (const opts of [null, 5, "dark", true])
      expect(() => randomFlow(opts as never), String(opts)).toThrow(
        /options must be an object/,
      );
  });
});
