import { describe, expect, it } from "vitest";

import { TERMINAL_FRAG } from "../../src/animate/terminal.glsl.js";

describe("TERMINAL_FRAG", () => {
  it("is the ogl fragment in GLSL ES 3.00 without the mouse / page-load branches", () => {
    expect(TERMINAL_FRAG.startsWith("#version 300 es")).toBe(true);
    expect(TERMINAL_FRAG).toContain("precision mediump float;");
    for (const needle of [
      "float digit(vec2 p)",
      "float displace(vec2 look)",
      "vec2 barrel(vec2 uv)",
      "gl_FragCoord.xy / iResolution.xy",
      "uChromaticAberration",
      "uDither",
      "out vec4 fragColor",
      "time = iTime * 0.333333;",
      "amp *= 0.454545;",
      "sin(time * 0.090909)",
      "uDither * 0.003922",
    ]) {
      expect(TERMINAL_FRAG).toContain(needle);
    }
    for (const gone of [
      "uMouse",
      "uUseMouse",
      "uPageLoadProgress",
      "uUsePageLoadAnimation",
      "varying",
      "gl_FragColor",
      "vUv",
    ]) {
      expect(TERMINAL_FRAG).not.toContain(gone);
    }
  });
});
