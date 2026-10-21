import { describe, expect, it } from "vitest";

import * as vis from "../src/index.js";

describe("@dagnam/vis root barrel", () => {
  it("exposes VisError", () => {
    expect(typeof vis.VisError).toBe("function");
  });

  // API surface: every runtime export of the package root, sorted. Adding or
  // removing a public name must show up here. To change it deliberately, edit
  // this list in the same commit as the export and say why (validators in
  // core/validate.ts, cleanText and the other scene internals are NOT public).
  it("exports exactly the documented runtime names", () => {
    expect(Object.keys(vis).sort()).toEqual([
      "BLENDS",
      "BRAND",
      "FONT_FAMILY",
      "FREEFORM_PALETTES",
      "INTER",
      "LOGO",
      "MAX_LINES",
      "MAX_TEXT_LENGTH",
      "PALETTES",
      "VisError",
      "advance",
      "animatedGradientCss",
      "assertBlend",
      "assertSize",
      "brandBackground",
      "brandBackgroundLayers",
      "createRng",
      "cssStops",
      "el",
      "escapeAttr",
      "fitAspect",
      "fmt",
      "focalScale",
      "focalTransform",
      "freeformPalette",
      "freeformRandom",
      "gradient",
      "gradientSvg",
      "logoSvg",
      "measureText",
      "mix",
      "normalizeStops",
      "ogCard",
      "palette",
      "parseColor",
      "pattern",
      "ramp",
      "sampleStops",
      "svgDoc",
      "svgStops",
      "text",
      "toCss",
      "toHex",
      "toVec3",
      "withAlpha",
      "wrapText",
    ]);
  });
});
