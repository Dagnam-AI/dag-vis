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

  it("pins FNV-1a through the params that depend on it", () => {
    // "hello-world" is case 0. "hello" is a pin the cases do not use: its family stream
    // must start from the pinned hash, and the "" pin is not reachable (an empty item
    // is rejected).
    expect(vectors.fnv1a32["hello-world"]).toBe(1116541326);
    const drift = createRng(vectors.fnv1a32.hello).range(-1, 1) * 15;
    expect(coverParams({ ...ITEM, item: "hello" }).familyHue).toBeCloseTo(
      25.3 + drift,
      9,
    );
    const first = createRng(vectors.fnv1a32["hello-world"]).range(-1, 1) * 15;
    expect(coverParams({ ...ITEM, item: "hello-world" }).familyHue).toBeCloseTo(
      25.3 + first,
      9,
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

  it("is the glows kind over the theme's base, strongest glow first", () => {
    const spec = coverSpec(ITEM);
    expect(spec.kind).toBe("glows");
    expect(spec).toMatchObject({ base: "#0a0a0a" });
    const { glows } = coverLayers(ITEM);
    expect(spec.glows).toEqual(
      glows.map((g) => ({ size: g.size, at: g.at, color: g.colour })),
    );
    expect(coverSpec({ ...ITEM, theme: "light" }).base).toBe("#ffffff");
  });

  it("gives the first case's CSS in the pipeline's own colours", () => {
    expect(gradient(coverSpec(vectors.cases[0]!.input)).css).toMatch(
      /^background: radial-gradient\(ellipse 81\.513% 119\.91% at 23\.691% 31\.306%, rgba\(\d+, \d+, \d+, 0\.6\), transparent 70%\), radial-gradient\(ellipse 57\.059% 83\.937% at 76\.309% 68\.694%, rgba\(\d+, \d+, \d+, 0\.21\), transparent 70%\), #0a0a0a;$/,
    );
  });
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
