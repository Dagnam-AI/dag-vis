import { BRAND, LOGO } from "@dagnam/vis";
import { describe, expect, it } from "vitest";

import { LOGO_ASPECT, THEME, logoDataUrl } from "../../src/bridge/brand.ts";
import { BRAND_FONTS } from "../../src/lib/font-files.ts";

describe("brand bridge", () => {
  it("takes every colour from BRAND and every font family from the registered faces", () => {
    expect(THEME).toEqual({
      background: BRAND.background.dark,
      foreground: BRAND.foreground.dark,
      accent: BRAND.red,
      stripes: BRAND.stripes,
      display: "moonhouse",
      text: "Inter",
      ui: "Unbounded",
    });
    const registered = BRAND_FONTS.map((f) => f.family);
    for (const family of [THEME.display, THEME.text, THEME.ui])
      expect(registered).toContain(family);
    expect(LOGO_ASPECT).toBe(LOGO.width / LOGO.height);
  });

  it("renders the logo as an svg data URL in the given colour", () => {
    const svg = decodeURIComponent(logoDataUrl("#123456", 64).split(",")[1]!);
    expect(svg).toContain("<svg");
    expect(svg).toContain("#123456");
    expect(decodeURIComponent(logoDataUrl().split(",")[1]!)).toContain(
      BRAND.red,
    );
  });
});
