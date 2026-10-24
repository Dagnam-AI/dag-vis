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
    expect(typeof fresh.ogCard).toBe("function");
    // The effects live in the ./animate entry: the root types stay DOM-free.
    expect("createDither" in fresh).toBe(false);
  });

  it("the ./animate entry imports in plain Node too, and exports exactly its documented names", async () => {
    expect(typeof document).toBe("undefined");
    expect(typeof HTMLCanvasElement).toBe("undefined");
    vi.resetModules();
    const animate = await import("../src/animate/index.js");
    expect(typeof animate.createDither).toBe("function");
    // API surface of `@dagnam/vis/animate`, sorted. Not public on purpose: the
    // runtime, GL and Canvas2D renderers, colour.ts, the shader strings and the
    // glitch cell-state helpers.
    expect(Object.keys(animate).sort()).toEqual([
      "COMMON_DEFAULTS",
      "DITHER_DEFAULTS",
      "GLITCH_DEFAULTS",
      "PIXEL_BLAST_DEFAULTS",
      "RIBBON_DEFAULTS",
      "TERMINAL_DEFAULTS",
      "createDither",
      "createGlitch",
      "createPixelBlast",
      "createRibbon",
      "createTerminal",
      "loopTime",
    ]);
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
  // cleanText and the other scene internals. The animated effects are the
  // `@dagnam/vis/animate` entry (their types name HTMLCanvasElement, and the
  // root must type-check without the DOM lib): never add them here.
  it("exports exactly the documented runtime names", () => {
    expect(Object.keys(vis).sort()).toEqual([
      "BLENDS",
      "BRAND",
      "FLOW_SHAPES",
      "FONT_FAMILY",
      "FREEFORM_PALETTES",
      "LOGO",
      "PALETTES",
      "VisError",
      "animatedGradientCss",
      "brandBackground",
      "brandBackgroundLayers",
      "coverLayers",
      "coverSpec",
      "createRng",
      "fmt",
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
      "renderField",
      "resolveField",
      "ribbon",
      "ribbonCurves",
      "timeCoords",
      "toCss",
      "toHex",
      "toVec3",
      "withAlpha",
      "wrapText",
    ]);
  });
});
