import { describe, expect, it, vi } from "vitest";

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

  it("imports in plain Node with no DOM and no canvas", async () => {
    // This file runs in the node environment: nothing below may exist.
    expect(typeof document).toBe("undefined");
    expect(typeof HTMLCanvasElement).toBe("undefined");
    vi.resetModules();
    const fresh = await import("../src/index.js");
    expect(typeof fresh.createDither).toBe("function");
  });

  // API surface: every runtime export of the package root, sorted. Adding or
  // removing a public name must show up here. To change it deliberately, edit
  // this list in the same commit as the export and say why. Not public, on
  // purpose (names can be added after 0.1.0 but never removed): the SVG
  // builder (el, text, svgDoc, escapeAttr), the validators (assertSize,
  // assertBlend, core/validate.ts), the stop pipeline (normalizeStops,
  // sampleStops, cssStops, svgStops), the geometry helpers (fitAspect,
  // focalScale, focalTransform), the text caps (MAX_LINES, MAX_TEXT_LENGTH),
  // the Inter metrics (INTER, advance),
  // cleanText and the other scene internals; and the animate internals
  // (createRuntime, the GL and Canvas2D renderers, colour.ts, the shader
  // strings, the glitch cell-state helpers).
  it("exports exactly the documented runtime names", () => {
    expect(Object.keys(vis).sort()).toEqual([
      "BLENDS",
      "BRAND",
      "COMMON_DEFAULTS",
      "DITHER_DEFAULTS",
      "FONT_FAMILY",
      "FREEFORM_PALETTES",
      "GLITCH_DEFAULTS",
      "LOGO",
      "PALETTES",
      "PIXEL_BLAST_DEFAULTS",
      "RIBBON_DEFAULTS",
      "TERMINAL_DEFAULTS",
      "VisError",
      "animatedGradientCss",
      "brandBackground",
      "brandBackgroundLayers",
      "coverLayers",
      "coverSpec",
      "createDither",
      "createGlitch",
      "createPixelBlast",
      "createRibbon",
      "createRng",
      "createTerminal",
      "fmt",
      "freeformPalette",
      "freeformRandom",
      "gradient",
      "gradientSvg",
      "logoSvg",
      "loopTime",
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
