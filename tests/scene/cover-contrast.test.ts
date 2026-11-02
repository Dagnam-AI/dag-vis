import { describe, expect, it } from "vitest";

import { parseColor } from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";
import {
  BANNER_SIZE,
  BANNER_ZONE,
  CARD_SIZE,
  OG_SIZE,
  OG_ZONE,
  SCRIM_SOLID,
  TARGET_RATIO,
  coverContrast,
  scrimAt,
  scrimFor,
} from "../../src/scene/cover-contrast.js";
import type { GradientSpec } from "../../src/gradient/index.js";
import { coverLook } from "../../src/scene/cover-look.js";
import { COVER_LOOKS } from "../../src/scene/cover-look-types.js";
import type { CoverLook } from "../../src/scene/cover-look-types.js";
import { coverSvg } from "../../src/scene/cover-svg.js";
import { SEEDS, manySeeds } from "../helpers/cover-seeds.js";
import { rasterize } from "../helpers/render.js";

const THEMES = ["dark", "light"] as const;
/** Half the banner: the raster comparison renders 60 covers. */
const SMALL = { width: 800, height: 256 };

describe("coverContrast: the analytic model", () => {
  it("lifts every banner to 4.5:1 with its scrim, for every look, theme and 64 seeds", () => {
    for (const s of manySeeds(64))
      for (const look of COVER_LOOKS)
        for (const theme of THEMES) {
          const l = coverLook({ ...s, look, theme, variant: "banner" });
          expect(coverContrast(l)).toBeGreaterThanOrEqual(TARGET_RATIO);
          expect(coverContrast(l)).toBe(l.contrast.after);
        }
  });

  it("the scrim does work where the picture is brightest: ember and halftone on dark fall under 4.5:1 without it", () => {
    for (const look of ["ember", "halftone"] as const) {
      const needs = manySeeds(64).filter(
        (s) =>
          coverLook({ ...s, look, theme: "dark" }).contrast.before <
          TARGET_RATIO,
      );
      expect(needs.length, look).toBeGreaterThan(0);
      for (const s of needs) {
        const l = coverLook({ ...s, look, theme: "dark" });
        expect(l.scrim, look).not.toBeNull();
        expect(l.scrim?.alpha, look).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("measures a card without a scrim, in the banner's zone by default", () => {
    const card = coverLook({
      item: "a",
      theme: "dark",
      variant: "card",
      look: "ember",
    });
    expect(card.scrim).toBeNull();
    expect(coverContrast(card)).toBe(card.contrast.before);
    expect(card.contrast.zone).toEqual(BANNER_ZONE);
    // A card is measured at the card's size unless a size is given.
    expect(coverContrast(card, BANNER_ZONE, CARD_SIZE)).toBe(
      coverContrast(card),
    );
  });

  it("takes a zone and a size", () => {
    const l = coverLook({
      item: "calculus",
      theme: "dark",
      variant: "banner",
      look: "ember",
    });
    const corner = { x: 0, y: 0, w: 0.05, h: 0.05 };
    expect(coverContrast(l, corner)).not.toBe(coverContrast(l));
    expect(
      coverContrast(l, BANNER_ZONE, { width: 800, height: 256 }),
    ).toBeCloseTo(coverContrast(l), 1);
  });

  it("composites a texture where its mask is present, and a scrim over it", () => {
    const l = coverLook({
      item: "a",
      theme: "dark",
      variant: "banner",
      look: "halftone",
    });
    const bare: CoverLook = { ...l, texture: null, scrim: null };
    // The dots are lighter than the page: they can only lower the contrast of light text.
    expect(coverContrast({ ...l, scrim: null })).toBeLessThan(
      coverContrast(bare),
    );
  });

  it("refuses a layer it cannot model", () => {
    const l = coverLook({ item: "a", theme: "dark", variant: "banner" });
    const mesh: CoverLook = {
      ...l,
      spec: { kind: "mesh", base: "#000", points: [] },
    };
    expect(() => coverContrast(mesh)).toThrow(VisError);
    expect(() => coverContrast(mesh)).toThrow(/cannot model a mesh layer/);
  });

  it("models a linear layer, top to bottom unless an angle says otherwise", () => {
    const l = coverLook({ item: "a", theme: "dark", variant: "banner" });
    const stops = ["#ffffff", "#000000"];
    const at = (spec: GradientSpec, y: number): number =>
      coverContrast(
        { ...l, texture: null, scrim: null, spec },
        { x: 0.5, y, w: 0, h: 0 },
      );
    expect(at({ kind: "linear", stops }, 0)).toBeLessThan(1.2);
    expect(at({ kind: "linear", stops }, 1)).toBeGreaterThan(15);
    expect(at({ kind: "linear", stops, angle: 0 }, 0)).toBeGreaterThan(15);
  });

  it("models a radial layer: a circle by the short side, an ellipse by the box, and the defaults", () => {
    const l = coverLook({ item: "a", theme: "dark", variant: "banner" });
    const at = (spec: GradientSpec, x: number): number =>
      coverContrast(
        { ...l, texture: null, scrim: null, spec },
        { x, y: 0.5, w: 0, h: 0 },
      );
    const stops = ["#ffffff", "#000000"];
    // The look's text is near white (#fafafa): white under it is the worst case.
    expect(at({ kind: "radial", stops }, 0.5)).toBeCloseTo(1.04, 1);
    expect(at({ kind: "radial", stops }, 0)).toBeGreaterThan(15);
    // radius .25 of the short side (512): 128 px, so x = .5 + 128/1600 is the rim.
    const circle: GradientSpec = {
      kind: "radial",
      at: [0.5, 0.5],
      radius: 0.25,
      stops,
    };
    expect(at(circle, 0.5 + 100 / 1600)).toBeLessThan(
      at(circle, 0.5 + 120 / 1600),
    );
    expect(at(circle, 0.5 + 140 / 1600)).toBeGreaterThan(15);
    // The same radius as an ellipse of the box: 400 px wide.
    const ellipse: GradientSpec = { ...circle, shape: "ellipse" };
    expect(at(ellipse, 0.5 + 140 / 1600)).toBeLessThan(3);
    expect(at(ellipse, 0.5 + 399 / 1600)).toBeGreaterThan(10);
  });
});

describe("scrimAt: the band's alpha profile", () => {
  const scrim = {
    at: [50, 50] as [number, number],
    radius: [20, 10] as [number, number],
    color: "#0a0a0a",
    alpha: 0.4,
  };
  const size = { width: 1000, height: 500 };
  it("is solid to half its ellipse, eases to zero at the edge, and is zero beyond", () => {
    expect(scrimAt(scrim, { x: 500, y: 250 }, size)).toBe(0.4);
    expect(
      scrimAt(scrim, { x: 500 + 200 * SCRIM_SOLID, y: 250 }, size),
    ).toBeCloseTo(0.4);
    expect(scrimAt(scrim, { x: 500 + 200 * 0.75, y: 250 }, size)).toBeCloseTo(
      0.2,
    );
    expect(scrimAt(scrim, { x: 700, y: 250 }, size)).toBeCloseTo(0);
    expect(scrimAt(scrim, { x: 900, y: 250 }, size)).toBe(0);
  });
});

describe("scrimFor", () => {
  const base = coverLook({
    item: "a",
    theme: "dark",
    variant: "banner",
    look: "ember",
  });

  it("is none for a picture that already reads", () => {
    const calm = coverLook({
      item: "linear-algebra",
      family: "x",
      theme: "dark",
      variant: "banner",
      look: "silk",
    });
    const r = scrimFor(calm, BANNER_ZONE, BANNER_SIZE);
    expect(r.scrim).toBeNull();
    expect(r.after).toBe(r.before);
    expect(r.before).toBeGreaterThanOrEqual(TARGET_RATIO);
  });

  it("takes the faintest step that reaches 4.7:1, centred on the zone, in the page colour", () => {
    const l = coverLook({
      item: "a",
      theme: "dark",
      variant: "banner",
      look: "halftone",
    });
    for (const [zone, size] of [
      [BANNER_ZONE, BANNER_SIZE],
      [OG_ZONE, OG_SIZE],
    ] as const) {
      const { scrim, before, after } = scrimFor(l, zone, size);
      expect(scrim).not.toBeNull();
      expect(before).toBeLessThan(TARGET_RATIO);
      expect(after).toBeGreaterThanOrEqual(TARGET_RATIO);
      expect(scrim?.color).toBe(l.palette.base);
      expect(scrim?.at).toEqual([
        (zone.x + zone.w / 2) * 100,
        (zone.y + zone.h / 2) * 100,
      ]);
      // One step fainter is not enough.
      const fainter = {
        ...scrim!,
        alpha: Math.round((scrim!.alpha - 0.05) * 100) / 100,
      };
      expect(coverContrast({ ...l, scrim: fainter }, zone, size)).toBeLessThan(
        TARGET_RATIO,
      );
    }
  });

  it("falls back to the strongest scrim when none reaches the target", () => {
    // Texture marks in the text colour itself: 1:1 wherever the mask is present.
    const hopeless: CoverLook = {
      ...base,
      palette: { ...base.palette, line: base.palette.foreground },
      texture: base.texture && {
        ...base.texture,
        opacity: 1,
        mask: { ...base.texture.mask, floor: 1 },
      },
    };
    const r = scrimFor(hopeless, BANNER_ZONE, BANNER_SIZE);
    expect(r.scrim?.alpha).toBe(0.7);
    expect(r.after).toBeLessThan(TARGET_RATIO);
  });
});

describe("the model against the resvg raster", () => {
  it(
    "is never optimistic by more than 1, and the raster reads at 4.5:1 or better, for 6 seeds x 5 looks x 2 themes",
    { timeout: 60_000 },
    () => {
      const lin = (c: number): number => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const lum = (r: number, g: number, b: number): number =>
        0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      for (const look of COVER_LOOKS)
        for (const theme of THEMES)
          for (const s of SEEDS) {
            const input = { ...s, look, theme, variant: "banner" } as const;
            const l = coverLook(input);
            const model = coverContrast(l, l.contrast.zone, SMALL);
            const raster = rasterize(coverSvg(input, { size: SMALL }));
            const fg = parseColor(l.palette.foreground);
            const lf = lum(fg.r * 255, fg.g * 255, fg.b * 255);
            let worst = Infinity;
            const z = l.contrast.zone;
            for (let j = 0; j < 5; j++)
              for (let i = 0; i < 9; i++) {
                const x = Math.round((z.x + (z.w * i) / 8) * raster.width);
                const y = Math.round((z.y + (z.h * j) / 4) * raster.height);
                const o = (y * raster.width + x) * 4;
                const lb = lum(
                  Number(raster.pixels[o]),
                  Number(raster.pixels[o + 1]),
                  Number(raster.pixels[o + 2]),
                );
                worst = Math.min(
                  worst,
                  (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05),
                );
              }
            const label = `${look} ${theme} ${s.item}`;
            // Grain (ignored by the model) and aurora-like blends move the raster a little;
            // a texture makes the model deliberately pessimistic (its worst case is a mark under every sample).
            expect(model - worst, label).toBeLessThan(1);
            expect(worst, label).toBeGreaterThanOrEqual(4.5);
          }
    },
  );
});
