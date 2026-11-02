import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { coverLook } from "../../src/scene/cover-look.js";
import { COVER_LOOKS } from "../../src/scene/cover-look-types.js";
import { coverSvg, coverSvgParts } from "../../src/scene/cover-svg.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";
import { SEEDS, manySeeds } from "../helpers/cover-seeds.js";

const base = {
  item: "calculus",
  family: "course:ai/math",
  index: 1,
  count: 5,
} as const;
const bytes = (s: string): number => Buffer.byteLength(s);

describe("coverSvg: goldens", () => {
  it("ember, dark, banner", () => {
    expectGolden(
      "scene/cover-ember-dark-banner.svg",
      coverSvg({ ...base, theme: "dark", variant: "banner", look: "ember" }),
    );
  });

  it("ember, light, card", () => {
    expectGolden(
      "scene/cover-ember-light-card.svg",
      coverSvg({ ...base, theme: "light", variant: "card", look: "ember" }),
    );
  });
});

describe("coverSvg: every look", () => {
  it(
    "is deterministic, standalone, sliced to fill its box and valid to resvg",
    { timeout: 30_000 },
    () => {
      for (const look of COVER_LOOKS)
        for (const theme of ["dark", "light"] as const) {
          const input = { ...base, theme, variant: "banner", look } as const;
          const svg = coverSvg(input);
          expect(coverSvg(input)).toBe(svg);
          expect(svg).toMatch(
            /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
          );
          expect(svg).toContain(
            'width="1600" height="512" viewBox="0 0 1600 512"',
          );
          expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
          const { width, height } = rasterize(svg);
          expect([width, height]).toEqual([1600, 512]);
        }
    },
  );

  it("stays under 16 KB for a card and 40 KB for a banner, over the six seeds and 64 more", () => {
    const inputs = [
      ...SEEDS,
      ...manySeeds(64).map((s) => ({
        item: s.item,
        family: null,
        index: 0,
        count: 1,
      })),
    ];
    for (const look of COVER_LOOKS)
      for (const theme of ["dark", "light"] as const)
        for (const s of inputs) {
          expect(
            bytes(coverSvg({ ...s, theme, variant: "card", look })),
            `${look} card`,
          ).toBeLessThan(16 * 1024);
          expect(
            bytes(coverSvg({ ...s, theme, variant: "banner", look })),
            `${look} banner`,
          ).toBeLessThan(40 * 1024);
        }
  });

  it("paints the page colour where nothing else does: a dark cover's corner is near black", () => {
    const [r, g, b] = pixelAt(
      rasterize(
        coverSvg({ ...base, theme: "dark", variant: "banner", look: "silk" }),
      ),
      2,
      2,
    );
    expect(Math.max(r, g, b)).toBeLessThan(60);
  });
});

describe("coverSvg: options", () => {
  const input = {
    ...base,
    theme: "dark",
    variant: "card",
    look: "contour",
  } as const;

  it("takes a size: contours draw their rings at that size", () => {
    const svg = coverSvg(input, { size: { width: 200, height: 100 } });
    expect(svg).toContain('width="200" height="100" viewBox="0 0 200 100"');
    expect(rasterize(svg).width).toBe(200);
  });

  it("namespaces every id under idPrefix, so two covers share a page", () => {
    const a = coverSvg(input, { idPrefix: "one" });
    const b = coverSvg(input, { idPrefix: "two" });
    const ids = (s: string): string[] =>
      [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(ids(a).length).toBeGreaterThan(3);
    expect(ids(a).every((id) => id.startsWith("one"))).toBe(true);
    expect(ids(b).every((id) => id.startsWith("two"))).toBe(true);
    expect(coverSvg(input)).toContain('id="cover');
  });

  it("rejects a bad prefix or size", () => {
    expect(() => coverSvg(input, { idPrefix: "1bad" })).toThrow(VisError);
    expect(() => coverSvg(input, { idPrefix: "a".repeat(57) })).toThrow(
      VisError,
    );
    expect(() => coverSvg(input, { size: { width: 0, height: 10 } })).toThrow(
      VisError,
    );
  });
});

describe("coverSvgParts", () => {
  const look = coverLook({
    ...base,
    theme: "dark",
    variant: "banner",
    look: "halftone",
  });
  const size = { width: 800, height: 256 };

  it("returns the defs and the body, with the look's own scrim by default", () => {
    const { defs, body } = coverSvgParts(look, { size, idPrefix: "p" });
    expect(look.scrim).not.toBeNull();
    expect(defs).toContain('id="p-scrim"');
    expect(defs).toContain('id="p-mask"');
    expect(body).toContain("url(#p-scrim)");
    expect(body).toContain("url(#p-mask)");
    // The grain comes last: it dithers the scrim too.
    expect(defs).toContain("feTurbulence");
    expect(body.indexOf("p-scrim")).toBeLessThan(body.lastIndexOf("<rect"));
  });

  it("takes another scrim, none (null) or a zero-alpha one", () => {
    const own = coverSvgParts(look, { size, idPrefix: "p" });
    const none = coverSvgParts(look, { size, idPrefix: "p", scrim: null });
    const zero = coverSvgParts(look, {
      size,
      idPrefix: "p",
      scrim: { ...look.scrim!, alpha: 0 },
    });
    const strong = coverSvgParts(look, {
      size,
      idPrefix: "p",
      scrim: { ...look.scrim!, alpha: 0.6 },
    });
    expect(none.defs).not.toContain("p-scrim");
    expect(zero.defs).not.toContain("p-scrim");
    expect(strong.defs).toContain('stop-opacity="0.6"');
    expect(own.defs).not.toBe(strong.defs);
  });

  it("omits the mask and the texture when the look has none, and the grain when it is 0", () => {
    const silk = coverLook({
      ...base,
      theme: "dark",
      variant: "card",
      look: "silk",
    });
    expect(silk.texture).toBeNull();
    expect(coverSvgParts(silk, { size, idPrefix: "p" }).defs).not.toContain(
      "p-mask",
    );
    const ungrained = { ...silk, spec: { ...silk.spec, grain: 0 } };
    expect(
      coverSvgParts(ungrained, { size, idPrefix: "p" }).defs,
    ).not.toContain("feTurbulence");
    const { grain, ...bare } = silk.spec;
    expect(grain).toBeGreaterThan(0);
    expect(
      coverSvgParts({ ...silk, spec: bare }, { size, idPrefix: "p" }).defs,
    ).not.toContain("feTurbulence");
  });

  it("rejects a bad prefix", () => {
    expect(() => coverSvgParts(look, { size, idPrefix: "" })).toThrow(VisError);
  });
});
