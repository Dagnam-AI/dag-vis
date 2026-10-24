import { describe, expect, it } from "vitest";
import { SHAPE_INDEX } from "../../../src/field/cpu/flow.js";
import { GLSL_FLOW } from "../../../src/field/glsl/flow.js";

describe("GLSL_FLOW", () => {
  it("defines flowColor and every uniform the CPU sampler mirrors", () => {
    expect(GLSL_FLOW).toContain("vec3 flowColor(vec2 uv)");
    for (const [type, name] of [
      ["int", "uShape"],
      ["int", "uOctaves"],
      ["float", "uStrength"],
      ["float", "uWarpScale"],
      ["float", "uScale"],
      ["vec2", "uRot"],
      ["float", "uVignette"],
      ["vec4", "uHighlight"],
      ["vec3", "uHighlightColor"],
      ["int", "uHasHighlight"],
    ])
      expect(GLSL_FLOW).toContain(`uniform ${type} ${name};`);
    expect(GLSL_FLOW).toContain("vec2(5.2, 1.3)");
    expect(GLSL_FLOW).toContain("0.5 + 0.8 * n");
  });

  it("branches on the same shape indices as the CPU table", () => {
    expect(GLSL_FLOW).toContain(`uShape == ${SHAPE_INDEX.swirl})`);
    expect(GLSL_FLOW).toContain(`uShape == ${SHAPE_INDEX.wave})`);
    expect(GLSL_FLOW).toContain(`uShape == ${SHAPE_INDEX.aurora})`);
    expect(GLSL_FLOW).toContain(`uShape == ${SHAPE_INDEX.bloom})`);
    expect(GLSL_FLOW).toContain(`uShape == ${SHAPE_INDEX.band})`);
    // noise (5) is the fall-through branch.
    expect(GLSL_FLOW).not.toContain(`uShape == ${SHAPE_INDEX.noise})`);
  });

  it("carries the same constants as the CPU maths and no grain (the shared main adds it)", () => {
    for (const k of [
      "1.5 * sqrt(",
      "0.35 * sinP(p.x * 2.0)",
      "vec2(p.x * 1.8, p.y * 0.45)",
      "sinP((p.y + 0.6 * n) * 3.0)",
      "* 0.9, 0.0, 1.0)",
      "0.45 + (1.0 - r) * 0.55",
      "smoothstep(0.35, 0.95,",
      "* 1.2)",
    ])
      expect(GLSL_FLOW).toContain(k);
    expect(GLSL_FLOW).not.toContain("hash");
    expect(GLSL_FLOW).not.toContain("uGrain");
  });

  it("never calls the built-in sin or cos: their accuracy is the driver's and the warp amplifies it", () => {
    expect(GLSL_FLOW).not.toMatch(/(?<![A-Za-z])(sin|cos)\(/);
    expect(GLSL_FLOW).toContain("float sinP(float x)");
    expect(GLSL_FLOW).toContain("float cosP(float x)");
    // Cody-Waite split of 2*pi: the high part is exact in float32.
    expect(6.28125 + Number("0.0019353071795864769")).toBeCloseTo(
      2 * Math.PI,
      15,
    );
    expect(GLSL_FLOW).toContain("6.28125");
    expect(GLSL_FLOW).toContain("0.0019353071795864769");
    expect(GLSL_FLOW).toContain("float c = cosP(a);");
    expect(GLSL_FLOW).toContain("float s = sinP(a);");
  });

  it("has balanced braces and parentheses", () => {
    const count = (c: string): number => GLSL_FLOW.split(c).length - 1;
    expect(count("{")).toBe(count("}"));
    expect(count("(")).toBe(count(")"));
  });
});
