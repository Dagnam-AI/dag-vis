import { describe, expect, it } from "vitest";

import * as vis from "../src/index.js";

describe("@dagnam/vis root barrel", () => {
  it("exposes VisError", () => {
    expect(typeof vis.VisError).toBe("function");
  });

  it("exposes the ribbon pair and their option types from the root", () => {
    const curveOpts: vis.RibbonOptions = { width: 10, height: 10, lines: 3 };
    const svgOpts: vis.RibbonSvgOptions = { ...curveOpts, mesh: true };
    expect(vis.ribbonCurves(curveOpts)).toHaveLength(3);
    expect(vis.ribbon(svgOpts)).toContain("<svg");
  });

  // API surface: every runtime export of the package root, sorted. Adding or
  // removing a public name must show up here. To change it deliberately, edit
  // this list in the same commit as the export and say why. Not public, on
  // purpose (names can be added after 0.1.0 but never removed): the SVG
  // builder (el, text, svgDoc, escapeAttr), the validators (assertSize,
  // assertBlend, core/validate.ts), the stop pipeline (normalizeStops,
  // sampleStops, cssStops, svgStops), the Inter metrics (INTER, advance),
  // cleanText and the other scene internals.
  it("exports exactly the documented runtime names", () => {
    expect(Object.keys(vis).sort()).toEqual([
      "BLENDS",
      "BRAND",
      "FONT_FAMILY",
      "FREEFORM_PALETTES",
      "LOGO",
      "MAX_LINES",
      "MAX_TEXT_LENGTH",
      "PALETTES",
      "VisError",
      "animatedGradientCss",
      "brandBackground",
      "brandBackgroundLayers",
      "createRng",
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
      "ogCard",
      "palette",
      "parseColor",
      "pattern",
      "ramp",
      "ribbon",
      "ribbonCurves",
      "toCss",
      "toHex",
      "toVec3",
      "withAlpha",
      "wrapText",
    ]);
  });
});
