import { describe, expect, it } from "vitest";

import { renderField, resolveField } from "../../src/field/index.js";
import { coverField } from "../../src/scene/cover-field.js";
import { coverLook } from "../../src/scene/cover-look.js";
import { COVER_LOOKS } from "../../src/scene/cover-look-types.js";
import { fnv1a32 } from "../../src/scene/cover.js";
import { expectGoldenNear } from "../helpers/golden.js";
import { SEEDS, manySeeds } from "../helpers/cover-seeds.js";

const SHAPES = {
  ember: "bloom",
  aurora: "aurora",
  contour: "band",
  silk: "wave",
  halftone: "noise",
} as const;

describe("coverField: the animated twin of a cover", () => {
  it("resolves for every look, theme and variant over 64 seeds, with 2 to 6 colours", () => {
    for (const s of manySeeds(64))
      for (const look of COVER_LOOKS)
        for (const theme of ["dark", "light"] as const)
          for (const variant of ["card", "banner"] as const) {
            const spec = coverField({ ...s, look, theme, variant });
            expect(() => resolveField(spec)).not.toThrow();
            expect(spec.palette.length).toBeGreaterThanOrEqual(2);
            expect(spec.palette.length).toBeLessThanOrEqual(6);
          }
  });

  it("moves in the shape of its look", () => {
    for (const look of COVER_LOOKS)
      expect(
        coverField({ item: "a", theme: "dark", variant: "card", look }).shape,
      ).toBe(SHAPES[look]);
  });

  it("puts its highlight at the cover's anchor, in the look's highlight colour", () => {
    for (const s of SEEDS) {
      const input = { ...s, theme: "dark", variant: "card" } as const;
      const look = coverLook(input);
      const spec = coverField(input);
      const highlight = spec.light?.highlight;
      expect(highlight?.at).toEqual([
        look.params.anchor[0] / 100,
        look.params.anchor[1] / 100,
      ]);
      expect(highlight?.color).toBe(look.palette.highlight);
    }
  });

  it("is seeded by the item key (a pinned seed replaces it)", () => {
    const base = { item: "calculus", theme: "dark", variant: "card" } as const;
    expect(coverField(base).seed).toBe(fnv1a32("calculus"));
    expect(coverField({ ...base, seed: "other" }).seed).toBe(fnv1a32("other"));
    expect(coverField({ ...base, family: "f" }).seed).toBe(fnv1a32("calculus"));
  });

  it("is the page, the tints and the accent in the look's colours", () => {
    const input = { item: "a", variant: "card", look: "ember" } as const;
    const dark = coverField({ ...input, theme: "dark" });
    const light = coverField({ ...input, theme: "light" });
    expect(dark.palette[0]).toBe("#0a0a0a");
    expect(dark.palette).toHaveLength(5);
    expect(light.palette[0]).toBe("#ffffff");
    expect(light.palette).toHaveLength(4);
    expect(dark.light?.vignette).toBeGreaterThan(0);
    expect(light.light?.vignette).toBe(0);
  });

  it("draws the same frame every time: five pixels of a 16x9 frame per look are pinned", () => {
    const pixels = COVER_LOOKS.flatMap((look) => {
      const spec = coverField({
        item: "calculus",
        family: "course:ai/math",
        index: 1,
        count: 5,
        theme: "dark",
        variant: "card",
        look,
      });
      const { data, width } = renderField(spec, { width: 16, height: 9 });
      return [
        [1, 1],
        [8, 4],
        [14, 7],
        [3, 6],
        [12, 2],
      ].map(([x, y]) => {
        const o = ((y ?? 0) * width + (x ?? 0)) * 4;
        return Array.from(data.slice(o, o + 3));
      });
    });
    expectGoldenNear("scene/cover-field-pixels.json", pixels);
  });
});
