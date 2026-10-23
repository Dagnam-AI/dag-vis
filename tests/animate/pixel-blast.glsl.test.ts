import { describe, expect, it } from "vitest";

import { PIXEL_BLAST_FRAG } from "../../src/animate/pixel-blast.glsl.js";

describe("PIXEL_BLAST_FRAG", () => {
  it("is the non-liquid fragment without ripples, jitter or the gamma block", () => {
    expect(PIXEL_BLAST_FRAG.startsWith("#version 300 es")).toBe(true);
    for (const needle of [
      "Bayer8",
      "fbm2",
      "maskCircle",
      "maskTriangle",
      "maskDiamond",
      "uEdgeFade",
      "uShapeType",
    ]) {
      expect(PIXEL_BLAST_FRAG).toContain(needle);
    }
    for (const gone of [
      "uClickPos",
      "uPixelJitter",
      "uEnableRipples",
      "pow(color, vec3(1.0 / 2.4))",
    ]) {
      expect(PIXEL_BLAST_FRAG).not.toContain(gone);
    }
  });
});
