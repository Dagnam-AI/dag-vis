import { describe, expect, it } from "vitest";
import {
  GLSL_COMMON_UNIFORMS,
  GLSL_HASH,
  GLSL_HEADER,
  GLSL_LUT,
  GLSL_MAIN,
  GLSL_OKLAB,
  GLSL_SIMPLEX4,
} from "../../../src/field/glsl/common.js";

describe("glsl common", () => {
  it("declares ES 3.0 with highp and the shared uniforms", () => {
    expect(GLSL_HEADER.startsWith("#version 300 es")).toBe(true);
    expect(GLSL_HEADER).toContain("precision highp float;");
    expect(GLSL_HEADER).toContain("precision highp int;");
    for (const u of [
      "uWidth",
      "uHeight",
      "uSeed",
      "uGrainSeed",
      "uAspect",
      "uGrain",
      "uGrainFrame",
    ])
      expect(GLSL_COMMON_UNIFORMS).toContain(u);
  });

  it("uses the same hash constants as the CPU path", () => {
    for (const k of [
      "0x9E3779B1u",
      "0x85EBCA77u",
      "0xC2B2AE3Du",
      "0x27D4EB2Fu",
      "0x7FEB352Du",
      "0x846CA68Bu",
    ])
      expect(GLSL_HASH).toContain(k);
    expect(GLSL_SIMPLEX4).toContain("27.0 *");
    expect(GLSL_OKLAB).toContain("4.0767416621");
    expect(GLSL_LUT).toContain("texelFetch");
    expect(GLSL_MAIN).toContain("fieldColor(uv)");
    expect(GLSL_MAIN).toContain("uHeight - 1 - int(gl_FragCoord.y)");
  });

  it("keeps the simplex constants and the octave cap in step with the CPU kernel", () => {
    expect(GLSL_SIMPLEX4).toContain("0.30901699437494745");
    expect(GLSL_SIMPLEX4).toContain("0.1381966011250105");
    expect(GLSL_SIMPLEX4).toContain("0.5 - dot(d, d)");
    expect(GLSL_SIMPLEX4).toContain("o < 5");
    expect(GLSL_SIMPLEX4).toContain("uint(o) * 101u");
    expect(GLSL_SIMPLEX4).toContain("hash4(c, seed) & 31u");
  });

  it("clamps the LUT position like the CPU sampler", () => {
    expect(GLSL_LUT).toContain("clamp(v, 0.0, 1.0) * 255.0");
    expect(GLSL_LUT).toContain("min(254, int(floor(f)))");
  });

  it("every block has balanced braces and parentheses", () => {
    for (const block of [
      GLSL_HASH,
      GLSL_SIMPLEX4,
      GLSL_OKLAB,
      GLSL_LUT,
      GLSL_MAIN,
    ]) {
      expect(block.split("{").length).toBe(block.split("}").length);
      expect(block.split("(").length).toBe(block.split(")").length);
    }
  });
});
