import { describe, expect, it } from "vitest";

import { parseColor, toHex } from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";
import { BRAND, PALETTES, palette } from "../../src/brand/tokens.js";

describe("BRAND", () => {
  it("pins the palette the web app ships", () => {
    expect(BRAND.red).toBe("#ef4444");
    expect(BRAND.accent.dark).toBe("oklch(52.768% 0.21534 29.097)");
    expect(BRAND.accent.light).toBe("oklch(67.517% 0.21256 24.87)");
    expect(BRAND.background).toEqual({ dark: "#0a0a0a", light: "#ffffff" });
    expect(BRAND.foreground).toEqual({ dark: "#fafafa", light: "#0a0a0a" });
    expect(BRAND.stripes).toEqual(["#d42762", "#edc41c", "#1bd766", "#10abba"]);
  });

  it("every token and palette entry parses", () => {
    const all = [
      BRAND.red,
      BRAND.accent.dark,
      BRAND.accent.light,
      ...BRAND.stripes,
      ...Object.values(PALETTES).flat(),
    ];
    for (const c of all) expect(toHex(parseColor(c))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("palette() resolves names and rejects unknown ones", () => {
    expect(palette("stripes")).toEqual(BRAND.stripes);
    expect(palette("red")).toBe(PALETTES.red);
    expect(() => palette("neon")).toThrow(VisError);
    expect(() => palette("neon")).toThrow("neon");
  });
});
