import { describe, expect, it } from "vitest";

import { parseColor } from "../../src/core/color.js";
import { coverPalette, withA } from "../../src/scene/cover-palette.js";

describe("coverPalette", () => {
  it("is a deep red on near black for dark, from the hue given", () => {
    expect(coverPalette(25.3, "dark")).toEqual({
      base: "#0a0a0a",
      deep: "#3a0003",
      ink: "#860005",
      accent: "#d40923",
      highlight: "#fa8563",
      cool: "#003d3e",
      line: "#fa8563",
      foreground: "#fafafa",
    });
  });

  it("is crisp deep red accents and pale tints on white for light", () => {
    const p = coverPalette(25.3, "light");
    expect(p.base).toBe("#ffffff");
    expect(p.foreground).toBe("#0a0a0a");
    // The line colour is BRAND.mark (6.0:1 on white), never the pink-prone bright red.
    expect(p.line).toBe("#ca0303");
    expect(
      [
        p.base,
        p.deep,
        p.ink,
        p.accent,
        p.highlight,
        p.cool,
        p.line,
        p.foreground,
      ].every((c) => /^#[0-9a-f]{6}$/.test(c)),
    ).toBe(true);
  });

  it("wraps a hue past 360 (the cool colour sits 170 degrees round)", () => {
    expect(coverPalette(200, "dark").cool).toBe(
      coverPalette(200 - 360, "dark").cool,
    );
    expect(coverPalette(200, "dark").cool).not.toBe(
      coverPalette(20, "dark").cool,
    );
  });

  it("moves with the hue", () => {
    expect(coverPalette(20, "dark").accent).not.toBe(
      coverPalette(40, "dark").accent,
    );
  });
});

describe("withA", () => {
  it("is the colour at an alpha, as rgba()", () => {
    expect(withA("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(parseColor(withA("#0a0a0a", 1)).a).toBe(1);
  });
});
