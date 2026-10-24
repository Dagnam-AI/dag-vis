import { describe, expect, it } from "vitest";
import { VisError } from "../../../src/core/index.js";
import { fluidDrift, fluidPositions } from "../../../src/field/cpu/fluid.js";
import { reedOffsets } from "../../../src/field/cpu/fluted.js";
import { GLSL_FLOW } from "../../../src/field/glsl/flow.js";
import { planGpu } from "../../../src/field/glsl/program.js";
import { paletteLut } from "../../../src/field/lut.js";
import { fieldPresets } from "../../../src/field/presets.js";
import { resolveField } from "../../../src/field/spec.js";
import { timeCoords } from "../../../src/field/time.js";
import type { ResolvedFluid, ResolvedFluted } from "../../../src/field/spec.js";

const plan = (name: string) => planGpu(resolveField(fieldPresets[name]));
const nums = (v: unknown): number[] => Array.from(v as ArrayLike<number>);

describe("planGpu: flow", () => {
  const p = plan("lunar");
  const tc = timeCoords(1.5, 6);
  const u = p.uniforms(320, 180, tc);

  it("assembles one program: header, noise, the LUT sampler, the flow colour and the main", () => {
    expect(p.fragment.startsWith("#version 300 es")).toBe(true);
    expect(p.fragment).toContain("float simplex4(");
    expect(p.fragment).toContain("vec3 lutColor(float v)");
    expect(p.fragment).toContain(
      "vec3 fieldColor(vec2 uv) { return flowColor(uv); }",
    );
    expect(p.fragment).toContain("void main()");
    expect(p.fragment).not.toContain("#define SOURCE");
    // The trig stand-ins appear exactly once.
    expect(p.fragment.split("float sinP(").length).toBe(2);
    expect(p.fragment).toContain(GLSL_FLOW);
  });

  it("carries the palette as the 256 entry float LUT", () => {
    const spec = resolveField(fieldPresets.lunar);
    if (spec.kind !== "flow") throw new Error("expected a flow preset");
    expect(p.lut).toEqual(paletteLut(spec.palette));
    expect(p.lut?.length).toBe(768);
  });

  it("packs the shared and flow uniforms", () => {
    expect(u.uWidth).toEqual({ t: "1i", v: 320 });
    expect(u.uHeight).toEqual({ t: "1i", v: 180 });
    expect(u.uAspect).toEqual({ t: "1f", v: 320 / 180 });
    expect(u.uSeed).toEqual({ t: "1ui", v: 2 });
    expect(u.uGrainSeed).toEqual({ t: "1ui", v: 2 });
    expect(u.uGrain).toEqual({ t: "1f", v: 0.4 });
    expect(u.uGrainFrame).toEqual({ t: "1i", v: tc.grainFrame });
    expect(u.uTime?.t).toBe("2f");
    expect(nums(u.uTime?.v)).toEqual([tc.z, tc.w]);
    expect(u.uShape).toEqual({ t: "1i", v: 3 });
    expect(u.uOctaves).toEqual({ t: "1i", v: 3 });
    expect(u.uStrength).toEqual({ t: "1f", v: 0.8 });
    expect(u.uWarpScale).toEqual({ t: "1f", v: 0.9 });
    expect(u.uScale?.t).toBe("1f");
    expect(u.uVignette).toEqual({ t: "1f", v: 0.3 });
    expect(u.uHasHighlight).toEqual({ t: "1i", v: 1 });
    expect(u.uHighlight).toEqual({ t: "4f", v: [0.85, 0.3, 0.45, 0.6] });
    expect(u.uHighlightColor?.t).toBe("3f");
    expect(u.uLut).toEqual({ t: "1i", v: 0 });
    expect(u.uRot).toEqual({ t: "2f", v: [1, 0] });
  });

  it("sends the highlight colour channel by channel", () => {
    const u = planGpu(
      resolveField({
        kind: "flow",
        palette: ["#000", "#fff"],
        light: {
          highlight: {
            at: [0.2, 0.4],
            strength: 0.5,
            radius: 0.3,
            color: "#9fe07a",
          },
        },
      }),
    ).uniforms(8, 8, timeCoords(0));
    const [r, g, b] = nums(u.uHighlightColor?.v);
    expect(r).toBeCloseTo(0x9f / 255, 12);
    expect(g).toBeCloseTo(0xe0 / 255, 12);
    expect(b).toBeCloseTo(0x7a / 255, 12);
    expect(nums(u.uHighlight?.v)).toEqual([0.2, 0.4, 0.5, 0.3]);
  });

  it("sends (cos, sin) of the rotation", () => {
    const rotated = planGpu(
      resolveField({ ...fieldPresets.lagoon, kind: "flow" }),
    ).uniforms(8, 8, timeCoords(0));
    expect(nums(rotated.uRot?.v)).toEqual([Math.cos(-0.3), Math.sin(-0.3)]);
  });

  it("sends neutral highlight values without a highlight", () => {
    const hl = planGpu(
      resolveField({
        kind: "flow",
        palette: ["#000", "#fff"],
        animatedGrain: false,
      }),
    ).uniforms(8, 8, timeCoords(3));
    expect(hl.uHasHighlight).toEqual({ t: "1i", v: 0 });
    expect(nums(hl.uHighlight?.v)).toEqual([0, 0, 0, 1]);
    expect(nums(hl.uHighlightColor?.v)).toEqual([1, 1, 1]);
    expect(hl.uGrainFrame).toEqual({ t: "1i", v: 0 });
  });
});

describe("planGpu: uniform record", () => {
  it("returns the same record and value objects on every call, updated in place", () => {
    const p = plan("fluid-dawn");
    const a = p.uniforms(10, 10, timeCoords(0));
    const width = a.uWidth;
    const pos = a.uPos?.v;
    const b = p.uniforms(20, 10, timeCoords(2));
    expect(b).toBe(a);
    expect(b.uWidth).toBe(width);
    expect(b.uPos?.v).toBe(pos);
    expect(b.uWidth?.v).toBe(20);
    expect(b.uAspect?.v).toBe(2);
  });

  it("lists the shared uniforms first, then the kind's", () => {
    const keys = Object.keys(plan("lunar").uniforms(8, 8, timeCoords(0)));
    expect(keys.slice(0, 8)).toEqual([
      "uWidth",
      "uHeight",
      "uAspect",
      "uSeed",
      "uGrainSeed",
      "uGrain",
      "uGrainFrame",
      "uTime",
    ]);
    expect(keys[8]).toBe("uShape");
    expect(keys.at(-1)).toBe("uLut");
  });

  it("takes the drawing buffer size as whole pixels only", () => {
    const p = plan("lunar");
    for (const [w, h] of [
      [0, 8],
      [8, 0],
      [8.5, 8],
      [8, Number.NaN],
      [-3, 8],
    ])
      expect(() => p.uniforms(w!, h!, timeCoords(0))).toThrow(VisError);
    expect(() => p.uniforms(0, 8, timeCoords(0))).toThrow(/width/);
    expect(() => p.uniforms(8, 0, timeCoords(0))).toThrow(/height/);
  });

  it("sends a u32 seed as is and the grain frame as an int32", () => {
    const spec = resolveField({
      kind: "flow",
      palette: ["#000", "#fff"],
      seed: 4294967295,
    });
    const u = planGpu(spec).uniforms(8, 8, timeCoords(0));
    expect(u.uSeed?.v).toBe(4294967295);
    expect(u.uGrainSeed?.v).toBe(4294967295);
    const tc = { ...timeCoords(0), grainFrame: 2 ** 31 + 5 };
    expect(planGpu(spec).uniforms(8, 8, tc).uGrainFrame?.v).toBe(
      -(2 ** 31) + 5,
    );
  });

  it("is the same at t = 0 and t = loop", () => {
    const p = plan("lagoon");
    const a = JSON.stringify(p.uniforms(8, 8, timeCoords(0, 4)));
    expect(JSON.stringify(p.uniforms(8, 8, timeCoords(4, 4)))).toBe(a);
  });
});

describe("planGpu: fluid", () => {
  const spec = resolveField(fieldPresets["fluid-dawn"]) as ResolvedFluid;
  const p = planGpu(spec);

  it("has no LUT and reads the fluid colour", () => {
    expect(p.lut).toBeNull();
    expect(p.fragment).toContain(
      "vec3 fieldColor(vec2 uv) { return fluidColor(uv); }",
    );
    expect(p.fragment).not.toContain("float flowColor");
  });

  it("pads positions, colours and 2 sigma squared to eight points", () => {
    const tc = timeCoords(0.9);
    const u = p.uniforms(100, 50, tc);
    expect(u.uCount).toEqual({ t: "1i", v: 5 });
    expect(u.uPos?.t).toBe("2fv");
    expect(u.uLab?.t).toBe("3fv");
    expect(u.uSigma?.t).toBe("1fv");
    expect(u.uBaseLab?.t).toBe("3f");
    const pos = u.uPos?.v as Float32Array;
    expect(pos).toBeInstanceOf(Float32Array);
    expect(pos.length).toBe(16);
    expect(nums(pos.subarray(0, 10))).toEqual(
      nums(Float32Array.from(fluidPositions(spec, tc.theta, fluidDrift(spec)))),
    );
    expect(nums(pos.subarray(10))).toEqual([0, 0, 0, 0, 0, 0]);
    expect((u.uLab?.v as Float32Array).length).toBe(24);
    const sigma = u.uSigma?.v as Float32Array;
    expect(sigma.length).toBe(8);
    expect(sigma[0]).toBeCloseTo(2 * (0.35 * 1.2) ** 2, 6);
    expect(sigma[1]).toBeCloseTo(2 * 0.35 ** 2, 6);
    expect(nums(sigma.subarray(5))).toEqual([0, 0, 0]);
  });

  it("moves the points with theta and closes over a loop", () => {
    const at = (t: number) => nums(p.uniforms(8, 8, timeCoords(t, 4)).uPos?.v);
    const a = at(1);
    expect(at(2)).not.toEqual(a);
    expect(at(5)).toEqual(a);
  });
});

describe("planGpu: fluted", () => {
  const spec = resolveField(fieldPresets["fluted-ember"]) as ResolvedFluted;
  const p = planGpu(spec);

  it("wraps the fluid source with a SOURCE define", () => {
    expect(p.fragment).toContain("#define SOURCE fluidColor");
    expect(p.fragment).not.toContain("return fluidColor(uv); }");
    expect(p.fragment).toContain("uniform vec4 uOffsets[64];");
    expect(p.lut).toBeNull();
  });

  it("seeds the noise from the source and the grain from the fluted spec", () => {
    const u = p.uniforms(64, 64, timeCoords(0));
    expect(u.uSeed).toEqual({ t: "1ui", v: 1 });
    expect(u.uGrainSeed).toEqual({ t: "1ui", v: 19 });
    expect(u.uGrain).toEqual({ t: "1f", v: 0.25 });
  });

  it("sends the reed offsets packed four to a vec4, zero padded to 256", () => {
    const u = p.uniforms(64, 64, timeCoords(0));
    expect(u.uReeds).toEqual({ t: "1i", v: 28 });
    expect(u.uVertical).toEqual({ t: "1i", v: 1 });
    expect(u.uRefraction).toEqual({ t: "1f", v: 0.7 });
    expect(u.uShade).toEqual({ t: "1f", v: 0.55 });
    expect(u.uOffsets?.t).toBe("4fv");
    const offsets = u.uOffsets?.v as Float32Array;
    expect(offsets.length).toBe(256);
    expect(nums(offsets.subarray(0, 28))).toEqual(
      nums(Float32Array.from(reedOffsets(spec))),
    );
    expect(nums(offsets.subarray(28))).toEqual(new Array(228).fill(0));
  });

  it("also carries the fluid source's points", () => {
    const u = p.uniforms(64, 64, timeCoords(0));
    expect(u.uCount?.v).toBe(6);
    expect((u.uPos?.v as Float32Array).length).toBe(16);
  });

  it("wraps a flow source, with its LUT and flow uniforms, in the horizontal direction", () => {
    const flowFluted = planGpu(
      resolveField({
        kind: "fluted",
        source: { kind: "flow", palette: ["#000", "#fff"], seed: 7 },
        direction: "horizontal",
        seed: 9,
      }),
    );
    expect(flowFluted.fragment).toContain("#define SOURCE flowColor");
    expect(flowFluted.lut?.length).toBe(768);
    const u = flowFluted.uniforms(8, 8, timeCoords(0));
    expect(u.uVertical).toEqual({ t: "1i", v: 0 });
    expect(u.uSeed).toEqual({ t: "1ui", v: 7 });
    expect(u.uGrainSeed).toEqual({ t: "1ui", v: 9 });
    expect(u.uShape?.t).toBe("1i");
    expect(u.uLut).toEqual({ t: "1i", v: 0 });
  });
});
