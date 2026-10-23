import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createRng } from "../../src/core/rng.js";
import { VisError } from "../../src/core/errors.js";
import { gradient } from "../../src/gradient/index.js";
import { coverLayers, coverParams, coverSpec } from "../../src/scene/cover.js";
import type { CoverInput } from "../../src/scene/cover.js";
import { cssLayers } from "../helpers/css.js";

interface Vectors {
  fnv1a32: Record<string, number>;
  cases: {
    input: CoverInput;
    params: ReturnType<typeof coverParams>;
    css: string;
  }[];
}

const vectors = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "cover-vectors.json"),
    "utf8",
  ),
) as Vectors;

const round = (v: number): number => Math.round(v * 100) / 100;

/** The reference CSS for a cover's layers: what a consumer writes from `coverLayers`. */
function css(input: CoverInput): string {
  const { base, glows } = coverLayers(input);
  return [
    ...glows.map(
      ({ size: [w, h], at: [x, y], colour }) =>
        `radial-gradient(ellipse ${round(w)}% ${round(h)}% at ${round(x)}% ${round(y)}%, ${colour}, transparent 70%)`,
    ),
    base,
  ].join(", ");
}

const near = (got: readonly number[], want: readonly number[]): void => {
  expect(got).toHaveLength(want.length);
  want.forEach((w, i) => {
    expect(got[i]).toBeCloseTo(w, 9);
  });
};

const ITEM: CoverInput = { item: "post", theme: "dark", variant: "card" };

describe("coverParams and coverLayers reproduce the reference vectors", () => {
  it.each(vectors.cases.map((c, i) => [i, c] as const))(
    "case %i: params to 1e-9",
    (_i, { input, params }) => {
      const got = coverParams(input);
      expect(got.familyHue).toBeCloseTo(params.familyHue, 9);
      expect(got.hue).toBeCloseTo(params.hue, 9);
      expect(got.region).toEqual(params.region);
      near(got.anchor, params.anchor);
      near(got.familyRadius, params.familyRadius);
      near(got.radius, params.radius);
      expect(got.phase).toBe(params.phase);
      expect(got.intensity).toBe(params.intensity);
    },
  );

  it.each(vectors.cases.map((c, i) => [i, c] as const))(
    "case %i: layers format to the reference CSS exactly",
    (_i, { input, css: want }) => {
      expect(css(input)).toBe(want);
    },
  );

  it("has the six documented cases", () => {
    expect(vectors.cases).toHaveLength(6);
  });

  it("hashes the family and item keys with FNV-1a (the pins, through the params)", () => {
    // fnv1a32 is private, so test it where it shows: each stream starts from the
    // hash of its key, and the first draw is the family's hue drift. "hello" and
    // "hello-world" are pins no other test depends on being reachable; the "" pin
    // is not reachable (an empty item is rejected).
    const pins = vectors.fnv1a32;
    for (const key of ["hello", "hello-world"]) {
      const drift = createRng(pins[key]).range(-1, 1) * 15;
      expect(coverParams({ ...ITEM, item: key }).familyHue).toBeCloseTo(
        25.3 + drift,
        9,
      );
      // a seed replaces the key by the same hash
      expect(coverParams({ ...ITEM, seed: key }).familyHue).toBeCloseTo(
        25.3 + drift,
        9,
      );
    }
    // a different key must not share the hash: one character changes the stream
    expect(coverParams({ ...ITEM, item: "hello!" }).familyHue).not.toBeCloseTo(
      coverParams({ ...ITEM, item: "hello" }).familyHue,
      3,
    );
  });
});

describe("coverSpec", () => {
  it.each(vectors.cases.map((c, i) => [i, c] as const))(
    "case %i: renders the glows with the reference's ellipse percents and centres",
    (_i, { input, params }) => {
      const out = gradient(coverSpec(input)).css;
      expect(() => cssLayers(out)).not.toThrow();
      const [main, echo] = coverLayers(input).glows;
      const f = (n: number): string => String(Math.round(n * 1000) / 1000);
      for (const g of [main, echo])
        expect(out).toContain(
          `radial-gradient(ellipse ${f(g.size[0])}% ${f(g.size[1])}% at ${f(g.at[0])}% ${f(g.at[1])}%, `,
        );
      expect(main.size[0]).toBeCloseTo(params.radius[0], 9);
      expect(out.endsWith(`, ${coverLayers(input).base};`)).toBe(true);
    },
  );

  it("is the glows kind over the theme's base, in paint order (echo first, main last)", () => {
    const spec = coverSpec(ITEM);
    expect(spec.kind).toBe("glows");
    expect(spec).toMatchObject({ base: "#0a0a0a" });
    const { glows } = coverLayers(ITEM);
    expect(spec.glows).toEqual(
      glows.map((g) => ({ size: g.size, at: g.at, color: g.colour })).reverse(),
    );
    expect(coverSpec({ ...ITEM, theme: "light" }).base).toBe("#ffffff");
  });

  it("paints the main glow on top in CSS and in SVG", () => {
    const input = vectors.cases[0]!.input;
    const [main, echo] = coverLayers(input).glows;
    const spec = { ...coverSpec(input), size: { width: 100, height: 100 } };
    const f = (n: number): string => String(Math.round(n * 1000) / 1000);
    // CSS: the first layer is the top one
    const layers = cssLayers(gradient(spec).css);
    expect(layers[0]).toContain(
      `ellipse ${f(main.size[0])}% ${f(main.size[1])}% at ${f(main.at[0])}% ${f(main.at[1])}%`,
    );
    expect(layers[1]).toContain(
      `ellipse ${f(echo.size[0])}% ${f(echo.size[1])}% at ${f(echo.at[0])}% ${f(echo.at[1])}%`,
    );
    // SVG: the last rect is the top one, and its gradient is centred on the main glow
    const { defs } = gradient(spec);
    const rects = [...defs.matchAll(/fill="url\(#(vis1-g-p\d)\)"/g)].map(
      (m) => m[1],
    );
    const top = rects[rects.length - 1];
    expect(defs).toContain(
      `<radialGradient id="${top}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${f(main.at[0])} ${f(main.at[1])}) scale(${f(main.size[0])} ${f(main.size[1])})">`,
    );
  });

  it("gives the first case's CSS in the pipeline's own colours", () => {
    expect(gradient(coverSpec(vectors.cases[0]!.input)).css).toMatch(
      /^background: radial-gradient\(ellipse 81\.513% 119\.91% at 23\.691% 31\.306%, rgba\(\d+, \d+, \d+, 0\.6\), transparent 70%\), radial-gradient\(ellipse 57\.059% 83\.937% at 76\.309% 68\.694%, rgba\(\d+, \d+, \d+, 0\.21\), transparent 70%\), #0a0a0a;$/,
    );
  });
});

/**
 * The reference colours as sRGB, pinned: [main, echo] "r, g, b, a" per vector case, as
 * `gradient(coverSpec(...))` writes them. Generated once from the pipeline's output and
 * checked below against an independent oklch to sRGB conversion.
 */
const PINNED_RGBA = [
  ["230, 43, 53, 0.6", "230, 43, 53, 0.21"],
  ["253, 115, 109, 0.5", "253, 115, 109, 0.18"],
  ["230, 41, 64, 0.6", "230, 41, 64, 0.21"],
  ["230, 46, 34, 0.6", "230, 46, 34, 0.21"],
  ["227, 57, 0, 0.6", "227, 57, 0, 0.21"],
  ["229, 51, 0, 0.78", "229, 51, 0, 0.27"],
] as const;

/** oklch(L C H / A) to "r, g, b, a" (gamut-clipped sRGB), from the published OKLab matrices. */
function srgbOf(colour: string): string {
  const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)$/.exec(colour)!;
  const [L, C, H, A] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const ch = lin.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round(
      (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255,
    );
  });
  return `${ch.join(", ")}, ${A}`;
}

describe("the cover colours, pinned exactly", () => {
  it.each(vectors.cases.map((c, i) => [i, c] as const))(
    "case %i: coverSpec writes the pinned rgba, which an independent conversion of the oklch agrees with",
    (i, { input }) => {
      const written = [
        ...gradient(coverSpec(input)).css.matchAll(/rgba\(([^)]*)\)/g),
      ].map((m) => m[1]);
      // CSS lists the top glow first: main, then echo
      expect(written).toEqual(PINNED_RGBA[i]);
      const independent = coverLayers(input).glows.map((g) => srgbOf(g.colour));
      expect(independent).toEqual(PINNED_RGBA[i]);
    },
  );
});

describe("derivation rules", () => {
  it("is deterministic", () => {
    expect(coverLayers(ITEM)).toEqual(coverLayers({ ...ITEM }));
  });

  it("applies the theme envelope", () => {
    expect(coverLayers(ITEM).glows[0].colour).toMatch(/^oklch\(0\.6 0\.22 /);
    expect(coverLayers({ ...ITEM, theme: "light" }).glows[0].colour).toMatch(
      /^oklch\(0\.72 0\.17 /,
    );
  });

  it("mirrors the echo: 0.7 size, 0.35 alpha, 100 - anchor", () => {
    const [main, echo] = coverLayers(ITEM).glows;
    near(echo.size, [main.size[0] * 0.7, main.size[1] * 0.7]);
    near(echo.at, [100 - main.at[0], 100 - main.at[1]]);
    expect(main.colour).toMatch(/ \/ 0\.6\)$/);
    expect(echo.colour).toMatch(/ \/ 0\.21\)$/);
  });

  it("draws the radii from the variant's ranges", () => {
    const card = coverParams(ITEM).familyRadius;
    const banner = coverParams({ ...ITEM, variant: "banner" }).familyRadius;
    expect(card[0]).toBeGreaterThanOrEqual(55);
    expect(card[0]).toBeLessThan(75);
    expect(banner[0]).toBeGreaterThanOrEqual(50);
    expect(banner[0]).toBeLessThan(70);
    expect(banner[1]).toBeGreaterThanOrEqual(100);
    expect(banner[1]).toBeLessThan(130);
  });

  it("an independent post is its own family: no item hue nudge", () => {
    const p = coverParams(ITEM);
    expect(p.hue).toBe(p.familyHue);
    const same = coverParams({ ...ITEM, family: "post" });
    expect(same.hue).toBe(same.familyHue);
    expect(same.familyHue).toBe(p.familyHue);
  });

  it("siblings in an unordered family share the family and differ by item", () => {
    const a = coverParams({ ...ITEM, family: "tag:ml", item: "a" });
    const b = coverParams({ ...ITEM, family: "tag:ml", item: "b" });
    expect(a.familyHue).toBe(b.familyHue);
    expect(a.region).toEqual(b.region);
    expect(a.familyRadius).toEqual(b.familyRadius);
    expect(a.hue).not.toBe(b.hue);
    expect(Math.abs(a.hue - a.familyHue)).toBeLessThanOrEqual(6);
    expect(a.anchor).not.toEqual(b.anchor);
    for (const p of [a, b])
      expect(Math.abs(p.anchor[0] - p.region[0])).toBeLessThanOrEqual(8);
  });

  it("an ordered family sweeps the hue from -6 to +6 by index, and sets the phase", () => {
    const at = (index: number) =>
      coverParams({ ...ITEM, family: "c", item: `l${index}`, index, count: 5 });
    expect(at(0).hue - at(0).familyHue).toBeCloseTo(-6, 9);
    expect(at(2).hue - at(2).familyHue).toBeCloseTo(0, 9);
    expect(at(4).hue - at(4).familyHue).toBeCloseTo(6, 9);
    expect(at(0).familyHue).toBe(at(4).familyHue);
    expect(at(3).phase).toBeCloseTo(0.6, 12);
    // out-of-range indexes clamp
    expect(
      coverParams({ ...ITEM, family: "c", item: "x", index: 99, count: 5 }).hue,
    ).toBeCloseTo(at(4).familyHue + 6, 9);
    expect(
      coverParams({ ...ITEM, family: "c", item: "x", index: -3, count: 5 }).hue,
    ).toBeCloseTo(at(4).familyHue - 6, 9);
  });
});

describe("the editor's choices move only what they name", () => {
  const FAMILY: CoverInput = { ...ITEM, family: "tag:ml", item: "post-a" };
  const base = coverParams(FAMILY);

  it("hue replaces the family drift, keeping the item nudge, and clamps to +-15", () => {
    const p = coverParams({ ...FAMILY, hue: 10 });
    expect(p.familyHue).toBeCloseTo(35.3, 9);
    expect(p.hue - p.familyHue).toBeCloseTo(base.hue - base.familyHue, 9);
    expect(p.region).toEqual(base.region);
    expect(p.anchor).toEqual(base.anchor);
    expect(p.radius).toEqual(base.radius);
    expect(coverParams({ ...FAMILY, hue: 99 }).familyHue).toBeCloseTo(40.3, 9);
    expect(coverParams({ ...FAMILY, hue: -99 }).familyHue).toBeCloseTo(10.3, 9);
  });

  it("region replaces the family region, keeping the item jitter, rounds and clamps to 0..4", () => {
    const p = coverParams({ ...FAMILY, region: 0 });
    expect(p.region).toEqual([22, 74]);
    expect(p.hue).toBe(base.hue);
    expect(p.familyRadius).toEqual(base.familyRadius);
    // the jitter (anchor - region) is unchanged
    expect(p.anchor[0] - 22).toBeCloseTo(base.anchor[0] - base.region[0], 9);
    expect(p.anchor[1] - 74).toBeCloseTo(base.anchor[1] - base.region[1], 9);
    expect(coverParams({ ...FAMILY, region: 2.6 }).region).toEqual([24, 28]);
    expect(coverParams({ ...FAMILY, region: 99 }).region).toEqual([72, 80]);
    expect(coverParams({ ...FAMILY, region: -5 }).region).toEqual([22, 74]);
  });

  it("intensity scales both glows' alpha and clamps to 0.6..1.4", () => {
    expect(coverParams({ ...FAMILY, intensity: 1.2 }).intensity).toBe(1.2);
    expect(coverParams({ ...FAMILY, intensity: 5 }).intensity).toBe(1.4);
    expect(coverParams({ ...FAMILY, intensity: 0 }).intensity).toBe(0.6);
    const [main, echo] = coverLayers({ ...FAMILY, intensity: 1.4 }).glows;
    expect(main.colour).toMatch(/ \/ 0\.84\)$/);
    expect(echo.colour).toMatch(/ \/ 0\.29\)$/);
    expect(coverParams({ ...FAMILY, intensity: 1.2 }).anchor).toEqual(
      base.anchor,
    );
  });

  it("seed replaces the item key, and the family key when there is no family", () => {
    const withFamily = coverParams({ ...FAMILY, seed: "other" });
    expect(withFamily.familyHue).toBe(base.familyHue);
    expect(withFamily.region).toEqual(base.region);
    expect(withFamily.anchor).not.toEqual(base.anchor);
    const alone = coverParams({ ...ITEM, seed: "other" });
    expect(alone.familyHue).toBe(
      coverParams({ ...ITEM, item: "other" }).familyHue,
    );
    expect(alone.familyHue).not.toBe(coverParams(ITEM).familyHue);
    // an empty seed means no seed, as in the reference
    expect(coverParams({ ...ITEM, seed: "" })).toEqual(coverParams(ITEM));
  });

  it("null means absent for the editor's choices, as undefined does", () => {
    const nulls: CoverInput = {
      ...FAMILY,
      seed: null,
      hue: null,
      region: null,
      intensity: null,
    };
    expect(coverLayers(nulls)).toEqual(coverLayers(FAMILY));
    expect(coverLayers({ ...ITEM, family: null })).toEqual(coverLayers(ITEM));
    expect(
      coverLayers({ ...FAMILY, seed: undefined, hue: undefined } as never),
    ).toEqual(coverLayers(FAMILY));
  });
});

describe("input validation", () => {
  const bad = (patch: Record<string, unknown>): CoverInput => ({
    ...ITEM,
    ...patch,
  });

  it.each([
    ["item", undefined],
    ["item", ""],
    ["item", 5],
    ["item", null],
    ["family", ""],
    ["family", 5],
    ["seed", 5],
    ["seed", {}],
    ["theme", undefined],
    ["theme", "sepia"],
    ["variant", undefined],
    ["variant", "poster"],
    ["hue", "10"],
    ["hue", Number.NaN],
    ["hue", Number.POSITIVE_INFINITY],
    ["region", "1"],
    ["region", Number.NaN],
    ["intensity", "1"],
    ["intensity", Number.NEGATIVE_INFINITY],
    ["index", null],
    ["index", Number.NaN],
    ["index", "1"],
    ["count", null],
    ["count", Number.POSITIVE_INFINITY],
  ])("rejects %s = %s with a VisError naming it", (name, value) => {
    for (const run of [
      () => coverLayers(bad({ [name]: value })),
      () => coverSpec(bad({ [name]: value })),
    ]) {
      expect(run).toThrow(VisError);
      expect(run).toThrow(name);
    }
  });

  it("rejects an input that is not an object", () => {
    for (const v of [null, undefined, 5, "x"])
      expect(() => coverLayers(v as never)).toThrow(VisError);
  });
});
