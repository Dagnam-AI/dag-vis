import { describe, expect, it } from "vitest";
import { GLSL_FLUID } from "../../../src/field/glsl/fluid.js";
import { BASE_WEIGHT } from "../../../src/field/cpu/fluid.js";
import { MAX_FLUID_POINTS } from "../../../src/field/spec.js";

const compact = GLSL_FLUID.replace(/\s+/g, "");

describe("GLSL_FLUID", () => {
  it("defines fluidColor with the uniform arrays sized to the point cap", () => {
    expect(MAX_FLUID_POINTS).toBe(8);
    expect(GLSL_FLUID).toContain("vec3 fluidColor(vec2 uv)");
    expect(GLSL_FLUID).toContain("uniform int uCount;");
    expect(GLSL_FLUID).toContain(`uniform vec2 uPos[${MAX_FLUID_POINTS}];`);
    expect(GLSL_FLUID).toContain(`uniform vec3 uLab[${MAX_FLUID_POINTS}];`);
    expect(GLSL_FLUID).toContain(`uniform float uSigma[${MAX_FLUID_POINTS}];`);
    expect(GLSL_FLUID).toContain("uniform vec3 uBaseLab;");
    expect(GLSL_FLUID).toContain(`i < ${MAX_FLUID_POINTS}`);
  });

  it("carries the CPU maths: base weight, Gaussian, aspect, normalised mix", () => {
    expect(BASE_WEIGHT).toBe(0.02);
    expect(compact).toContain("vec3lab=uBaseLab*0.02;");
    expect(compact).toContain("floatwsum=0.02;");
    expect(compact).toContain(
      "vec2d=vec2((uv.x-uPos[i].x)*uAspect,uv.y-uPos[i].y);",
    );
    expect(compact).toContain("floatw=exp(-dot(d,d)/uSigma[i]);");
    expect(compact).toContain("lab+=w*uLab[i];");
    expect(compact).toContain("wsum+=w;");
    expect(compact).toContain("returnoklabToRgb(lab/wsum);");
    expect(compact).toContain("if(i>=uCount)break;");
  });

  it("does not recompute the drift or the colours: positions and Lab values are uniforms", () => {
    for (const word of [
      "sin",
      "cos",
      "hash",
      "uTime",
      "uSeed",
      "rgbToOklab",
      "cbrt",
    ])
      expect(GLSL_FLUID).not.toContain(word);
  });

  it("is balanced and defines nothing the common code already defines", () => {
    expect(GLSL_FLUID.split("{").length).toBe(GLSL_FLUID.split("}").length);
    expect(GLSL_FLUID).not.toContain("uAspect;");
    expect(GLSL_FLUID).not.toContain("oklabToRgb(vec3");
  });
});
