import { describe, expect, it } from "vitest";

import { DITHER_FRAG } from "../../src/animate/dither.glsl.js";

describe("DITHER_FRAG", () => {
  it("folds both of today's shaders into one GLSL ES 3.00 fragment", () => {
    expect(DITHER_FRAG.startsWith("#version 300 es")).toBe(true);
    for (const needle of [
      "cnoise",
      "fbm(p + fbm(p2))",
      "bayer8x8[64]",
      "linearToSrgb",
      "out vec4 fragColor",
      "clamp(f, 0.0, 1.0)",
    ]) {
      expect(DITHER_FRAG).toContain(needle);
    }
    expect(DITHER_FRAG).not.toContain("mousePos");
  });
});
