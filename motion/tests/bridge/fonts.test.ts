import { describe, expect, it, vi } from "vitest";

const loadFont = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@remotion/fonts", () => ({ loadFont }));
vi.mock("remotion", () => ({ staticFile: (p: string) => `/static/${p}` }));

import { FONT_FILES, loadBrandFonts } from "../../src/bridge/fonts.ts";
import { BRAND_FONTS } from "../../src/lib/font-files.ts";

describe("loadBrandFonts", () => {
  it("registers Inter 400/700, Unbounded 400 and moonhouse 400 from public/fonts, nothing else", async () => {
    await loadBrandFonts();
    expect(FONT_FILES).toBe(BRAND_FONTS);
    expect(loadFont).toHaveBeenCalledTimes(4);
    expect(loadFont.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      {
        family: "Inter",
        weight: "400",
        url: "/static/fonts/Inter-Regular.ttf",
        format: "truetype",
      },
      {
        family: "Inter",
        weight: "700",
        url: "/static/fonts/Inter-Bold.ttf",
        format: "truetype",
      },
      {
        family: "Unbounded",
        weight: "400",
        url: "/static/fonts/Unbounded-Regular.ttf",
        format: "truetype",
      },
      {
        family: "moonhouse",
        weight: "400",
        url: "/static/fonts/moonhouse.ttf",
        format: "truetype",
      },
    ]);
  });
});
