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
      cool: "#002b2c",
      line: "#fa8563",
      foreground: "#fafafa",
    });
  });

  it("is nested reds on white for light: a pale floor, a salmon halo, the accent, a ruby core", () => {
    expect(coverPalette(25.3, "light")).toEqual({
      base: "#ffffff",
      deep: "#ffedeb",
      ink: "#940114",
      accent: "#d40923",
      highlight: "#f89177",
      cool: "#c0e7e6",
      line: "#ca0303",
      foreground: "#0a0a0a",
    });
    // The line colour is BRAND.mark (6.0:1 on white), never the pink-prone bright red.
    expect(coverPalette(40, "light").line).toBe("#ca0303");
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
