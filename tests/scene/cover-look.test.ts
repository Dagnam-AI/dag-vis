import { describe, expect, it } from "vitest";

import { parseColor } from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";
import { gradient } from "../../src/gradient/index.js";
import { assertSpecBudget } from "../../src/gradient/spec.js";
import { coverParams, fnv1a32 } from "../../src/scene/cover.js";
import { TARGET_RATIO } from "../../src/scene/cover-contrast.js";
import { pickLook, coverLook } from "../../src/scene/cover-look.js";
import { COVER_LOOKS } from "../../src/scene/cover-look-types.js";
import type { GradientSpec } from "../../src/gradient/index.js";
import type {
  CoverLook,
  CoverLookInput,
} from "../../src/scene/cover-look-types.js";
import { expectGolden } from "../helpers/golden.js";
import { FAMILY, SEEDS, manySeeds } from "../helpers/cover-seeds.js";

const THEMES = ["dark", "light"] as const;
const VARIANTS = ["card", "banner"] as const;
const layersOf = (look: CoverLook): readonly GradientSpec[] => {
  if (look.spec.kind !== "layers") throw new Error("not a layers spec");
  return look.spec.layers;
};
const linearAngle = (layer: GradientSpec | undefined): number => {
  if (layer?.kind !== "linear") throw new Error("not a linear layer");
  return layer.angle ?? NaN;
};
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const distance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(...a.map((v, i) => v - Number(b[i])));
const r2 = (n: number): number => Math.round(n * 100) / 100;

describe("pickLook: the look a family gets", () => {
  it("is a pure function of the family key", () => {
    expect(pickLook("tag:ml")).toBe(pickLook("tag:ml"));
    expect(COVER_LOOKS).toContain(pickLook("tag:ml"));
  });

  it("follows the weights 35/25/15/15/10 over 4000 family keys", () => {
    const counts = Object.fromEntries(COVER_LOOKS.map((l) => [l, 0]));
    for (let i = 0; i < 4000; i++) counts[pickLook(`family-${i}`)]! += 1;
    const share = COVER_LOOKS.map((l) => (counts[l]! / 4000) * 100);
    [35, 25, 15, 15, 10].forEach((want, i) => {
      expect(Math.abs(share[i]! - want)).toBeLessThan(2.5);
    });
  });
});

describe("coverLook: which look", () => {
  it("every item of a family shares its look, whatever its index, theme or variant", () => {
    const looks = new Set(
      SEEDS.slice(1).flatMap((s) =>
        THEMES.flatMap((theme) =>
          VARIANTS.map(
            (variant) =>
              coverLook({ ...s, family: s.family, theme, variant }).look,
          ),
        ),
      ),
    );
    expect(looks).toEqual(new Set([pickLook(FAMILY)]));
  });

  it("a post with no family draws its own look from its item key", () => {
    const a = coverLook({ item: "solo", theme: "dark", variant: "card" });
    expect(a.look).toBe(pickLook("solo"));
    expect(a.params.familyKey).toBe("solo");
  });

  it("a pinned look wins; null and undefined derive", () => {
    const base: CoverLookInput = {
      item: "solo",
      theme: "dark",
      variant: "card",
    };
    for (const look of COVER_LOOKS)
      expect(coverLook({ ...base, look }).look).toBe(look);
    expect(coverLook({ ...base, look: null }).look).toBe(pickLook("solo"));
    expect(coverLook({ ...base }).look).toBe(pickLook("solo"));
  });

  it("rejects a look that is not one of the five, naming cover.look", () => {
    for (const look of ["nope", 1, ""])
      expect(() =>
        coverLook({ item: "a", theme: "dark", variant: "card", look } as never),
      ).toThrow(/^cover\.look: expected one of ember/);
  });

  it("rejects what coverSpec rejects", () => {
    expect(() => coverLook(null as never)).toThrow(VisError);
    expect(() =>
      coverLook({ item: "", theme: "dark", variant: "card" }),
    ).toThrow(VisError);
  });
});

describe("coverLook: the picture", () => {
  const input = {
    item: "calculus",
    family: FAMILY,
    index: 1,
    count: 5,
    variant: "banner",
  } as const;

  it("is deterministic", () => {
    for (const look of COVER_LOOKS)
      expect(coverLook({ ...input, theme: "dark", look })).toEqual(
        coverLook({ ...input, theme: "dark", look }),
      );
  });

  it("carries the derivation, plus the theme and variant", () => {
    const look = coverLook({ ...input, theme: "light", look: "ember" });
    // The look's own anchor walks round the family's for a lesson (see below).
    const { anchor, ...rest } = look.params;
    const { anchor: derived, ...want } = coverParams({
      ...input,
      theme: "light",
    });
    expect(rest).toEqual(want);
    expect(anchor).not.toEqual(derived);
    expect(look.theme).toBe("light");
    expect(look.variant).toBe("banner");
    expect(look.params.regionIndex).toBeGreaterThanOrEqual(0);
    expect(look.params.familyKey).toBe(FAMILY);
    expect(look.params.itemKey).toBe("calculus");
    expect(look.palette.foreground).toBe("#0a0a0a");
  });

  it("is a layers spec seeded by the family key, with the grain blended per theme", () => {
    const dark = coverLook({ ...input, theme: "dark", look: "ember" });
    const light = coverLook({ ...input, theme: "light", look: "ember" });
    expect(dark.spec).toMatchObject({
      kind: "layers",
      seed: fnv1a32(FAMILY),
      grainBlend: "overlay",
    });
    expect(light.spec).toMatchObject({ grainBlend: "multiply" });
    expect(dark.spec.grain).toBeGreaterThan(light.spec.grain ?? 1);
  });

  it("darkens the edges of a dark cover only", () => {
    const count = (
      theme: "dark" | "light",
      look: (typeof COVER_LOOKS)[number],
    ): number => layersOf(coverLook({ ...input, theme, look })).length;
    for (const look of COVER_LOOKS)
      expect(count("dark", look)).toBe(count("light", look) + 1);
  });

  it("gives the looks with a texture a mask centred on the glow, and the others none", () => {
    const textured = COVER_LOOKS.filter(
      (look) => coverLook({ ...input, theme: "dark", look }).texture !== null,
    );
    expect(textured).toEqual(["ember", "contour", "halftone"]);
    const { texture, params } = coverLook({
      ...input,
      theme: "dark",
      look: "contour",
    });
    expect(texture?.pattern.kind).toBe("contours");
    expect(texture?.mask.at).toEqual([
      r2(params.anchor[0]),
      r2(params.anchor[1]),
    ]);
  });

  it("sizes the texture and the reeds for the variant", () => {
    const silk = (variant: "card" | "banner"): unknown => {
      const reeds = layersOf(
        coverLook({ ...input, variant, theme: "dark", look: "silk" }),
      )[0];
      return reeds?.kind === "fluted" ? reeds.reeds : undefined;
    };
    expect(silk("banner")).toBe(40);
    expect(silk("card")).toBe(24);
    const spacing = (variant: "card" | "banner"): unknown =>
      coverLook({ ...input, variant, theme: "dark", look: "contour" }).texture
        ?.pattern.spacing;
    expect(spacing("banner")).toBe(26);
    expect(spacing("card")).toBe(13);
  });

  it("scales the glows with the editor's intensity and moves them with region and hue", () => {
    const alpha = (intensity: number): number => {
      const look = coverLook({
        ...input,
        theme: "dark",
        look: "ember",
        intensity,
      });
      const layer = layersOf(look)[1];
      const glows = layer?.kind === "glows" ? layer.glows : [];
      return parseColor(glows[1]?.color ?? "").a;
    };
    expect(alpha(1.4)).toBeGreaterThan(alpha(0.6));
    const a = coverLook({ ...input, theme: "dark", look: "ember", region: 0 });
    const b = coverLook({ ...input, theme: "dark", look: "ember", region: 1 });
    expect(a.params.regionIndex).toBe(0);
    expect(b.params.regionIndex).toBe(1);
    expect(a.spec).not.toEqual(b.spec);
    const c = coverLook({ ...input, theme: "dark", look: "ember", hue: -15 });
    const d = coverLook({ ...input, theme: "dark", look: "ember", hue: 15 });
    expect(c.palette.accent).not.toBe(d.palette.accent);
    // The editor's -15, and -3 more for lesson 1 of 5.
    expect(c.params.hueOffset).toBeCloseTo(-18, 9);
  });

  it("keeps every cover a red or an ember, never a crimson or a pink", () => {
    for (const s of manySeeds(48))
      for (const hue of [-15, 15])
        for (const index of [0, 4])
          for (const theme of THEMES) {
            const { palette } = coverLook({
              ...s,
              family: `f-${s.item}`,
              index,
              count: 5,
              hue,
              theme,
              look: "ember",
            });
            const [r, g, b] = rgb(palette.accent);
            expect(r, palette.accent).toBeGreaterThan(b * 3);
            expect(g, palette.accent).toBeLessThan(r / 2);
          }
  });

  it("tilts the floor from the light across the box", () => {
    const tilt = (look: ReturnType<typeof coverLook>): number =>
      linearAngle(layersOf(look)[0]);
    const a = coverLook({ ...input, theme: "dark", look: "ember", region: 0 }); // bottom left
    const b = coverLook({ ...input, theme: "dark", look: "ember", region: 3 }); // top left
    expect(tilt(a)).toBeGreaterThan(0);
    expect(tilt(a)).toBeLessThan(90); // from the lower left towards the upper right
    expect(tilt(b)).toBeGreaterThan(90);
    expect(tilt(b)).toBeLessThan(180);
  });
});

describe("coverLook: the lessons of a chapter are not duplicates", () => {
  const lesson = (
    index: number,
    theme: "dark" | "light",
    look: (typeof COVER_LOOKS)[number],
    family = FAMILY,
  ): CoverLook =>
    coverLook({
      item: `lesson-${index}`,
      family,
      index,
      count: 5,
      theme,
      variant: "banner",
      look,
    });

  it("the first and last of five differ in colour (sRGB distance >= 24) and in where the light sits (>= 12 points), for 40 chapters, every look and theme", () => {
    for (let f = 0; f < 40; f++)
      for (const theme of THEMES)
        for (const look of COVER_LOOKS) {
          const first = lesson(0, theme, look, `course:chapter-${f}`);
          const last = lesson(4, theme, look, `course:chapter-${f}`);
          const label = `${look} ${theme} chapter-${f}`;
          expect(
            distance(rgb(first.palette.accent), rgb(last.palette.accent)),
            label,
          ).toBeGreaterThanOrEqual(24);
          expect(
            distance(first.params.anchor, last.params.anchor),
            label,
          ).toBeGreaterThanOrEqual(12);
        }
  });

  it("all five siblings take different accents and different glow places, in the family's look", () => {
    const five = [0, 1, 2, 3, 4].map((i) => lesson(i, "dark", "ember"));
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++) {
        expect(five[i]?.palette.accent).not.toBe(five[j]?.palette.accent);
        expect(
          distance(five[i]?.params.anchor ?? [], five[j]?.params.anchor ?? []),
        ).toBeGreaterThan(10);
      }
  });

  it("walks the glow by index, deterministically, inside the box, and only for an ordered family", () => {
    const again = lesson(3, "dark", "ember");
    expect(again.params.anchor).toEqual(
      lesson(3, "dark", "ember").params.anchor,
    );
    for (const s of manySeeds(48)) {
      const { anchor } = coverLook({
        ...s,
        family: s.item,
        index: 4,
        count: 5,
      }).params;
      expect(Math.min(...anchor)).toBeGreaterThanOrEqual(12);
      expect(Math.max(...anchor)).toBeLessThanOrEqual(88);
    }
    // A post of its own (count 1) keeps the family's jittered anchor.
    const own = coverLook({ item: "solo", theme: "dark", variant: "banner" });
    expect(own.params.anchor).toEqual(
      coverParams({ item: "solo", theme: "dark", variant: "banner" }).anchor,
    );
  });

  it("moves the mask, the texture and the field's highlight with the walked glow", () => {
    const l = lesson(2, "dark", "contour");
    expect(l.texture?.mask.at).toEqual(l.params.anchor.map(r2));
  });
});

describe("coverLook: scrim and contrast", () => {
  it("a card has no scrim; a banner has one only when the picture needs it", () => {
    for (const s of manySeeds(24))
      for (const look of COVER_LOOKS) {
        const card = coverLook({ ...s, look, variant: "card" });
        expect(card.scrim).toBeNull();
        expect(card.contrast.after).toBe(card.contrast.before);
        const banner = coverLook({ ...s, look, variant: "banner" });
        expect(banner.scrim === null).toBe(
          banner.contrast.before >= TARGET_RATIO,
        );
        expect(banner.contrast.after).toBeGreaterThanOrEqual(TARGET_RATIO);
        expect(banner.contrast.after).toBeGreaterThanOrEqual(
          banner.contrast.before,
        );
      }
  });

  it("the scrim is theme coloured, centred on the zone, in 0.05 steps of at most 0.7", () => {
    for (const s of manySeeds(48))
      for (const look of COVER_LOOKS)
        for (const theme of THEMES) {
          const { scrim, palette } = coverLook({ ...s, look, theme });
          if (scrim === null) continue;
          expect(scrim.color).toBe(palette.base);
          expect(scrim.at).toEqual([50, 50]);
          expect(scrim.alpha).toBeGreaterThan(0);
          expect(scrim.alpha).toBeLessThanOrEqual(0.7);
          expect(
            Math.abs(scrim.alpha / 0.05 - Math.round(scrim.alpha / 0.05)),
          ).toBeLessThan(1e-9);
        }
  });
});

describe("coverLook: budgets", () => {
  it("every look builds a spec the renderer accepts, inside the node and depth budgets", () => {
    for (const s of manySeeds(64))
      for (const look of COVER_LOOKS)
        for (const theme of THEMES)
          for (const variant of VARIANTS) {
            const { spec } = coverLook({ ...s, look, theme, variant });
            assertSpecBudget(spec);
            expect(() => gradient(spec)).not.toThrow();
          }
  });

  it("builds in well under 20 ms", () => {
    const start = performance.now();
    for (const look of COVER_LOOKS)
      coverLook({ item: "x", theme: "dark", variant: "banner", look });
    expect((performance.now() - start) / COVER_LOOKS.length).toBeLessThan(20);
  });
});

describe("coverLook: the six verification seeds", () => {
  it("match the pinned vectors (UPDATE_GOLDENS=1 regenerates them)", () => {
    const cases = SEEDS.flatMap((s) =>
      THEMES.flatMap((theme) =>
        COVER_LOOKS.map((look) => {
          const l = coverLook({ ...s, theme, look, variant: "banner" });
          return {
            input: { ...s, theme, look },
            palette: l.palette,
            params: {
              hueOffset: r2(l.params.hueOffset),
              regionIndex: l.params.regionIndex,
              anchor: l.params.anchor.map(r2),
              radius: l.params.radius.map(r2),
            },
            scrim: l.scrim && {
              ...l.scrim,
              at: l.scrim.at.map(r2),
              radius: l.scrim.radius.map(r2),
            },
            contrast: {
              before: r2(l.contrast.before),
              after: r2(l.contrast.after),
            },
          };
        }),
      ),
    );
    expectGolden(
      "scene/cover-look-vectors.json",
      `[\n${cases.map((c) => JSON.stringify(c)).join(",\n")}\n]\n`,
    );
  });
});
