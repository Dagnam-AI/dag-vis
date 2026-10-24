import { describe, expect, it } from "vitest";
import { VisError } from "../../src/core/index.js";
import { MAX_DIMENSION } from "../../src/core/validate.js";
import { grainOffset } from "../../src/field/cpu/grain.js";
import { GLSL_MAIN } from "../../src/field/glsl/common.js";
import {
  MAX_FRAME_PIXELS,
  MAX_T,
  makeSampler,
  renderField,
  renderResolved,
} from "../../src/field/render.js";
import { resolveField } from "../../src/field/spec.js";
import { timeCoords } from "../../src/field/time.js";

const flow = {
  kind: "flow",
  palette: ["#102030", "#80c0ff"],
  shape: "swirl",
} as const;
const fluid = {
  kind: "fluid",
  points: [
    { at: [0.2, 0.3], color: "#ff8800" },
    { at: [0.8, 0.7], color: "#0044ff" },
  ],
} as const;
const fluted = { kind: "fluted", source: flow, reeds: 6 } as const;
const flutedFluid = { kind: "fluted", source: fluid, reeds: 5 } as const;
const specs = [flow, fluid, fluted, flutedFluid];
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean =>
  Buffer.from(a).equals(Buffer.from(b));

describe("renderField", () => {
  it("returns an opaque RGBA frame of the requested size", () => {
    const f = renderField(flow, { width: 16, height: 9 });
    expect(f.width).toBe(16);
    expect(f.height).toBe(9);
    expect(f.data).toBeInstanceOf(Uint8ClampedArray);
    expect(f.data.length).toBe(16 * 9 * 4);
    for (let i = 3; i < f.data.length; i += 4) expect(f.data[i]).toBe(255);
  });

  it.each(specs)(
    "$kind: equal inputs give byte-equal frames, whether the spec is raw or resolved",
    (spec) => {
      const o = { width: 24, height: 14, t: 1.25 };
      const a = renderField(spec, o);
      expect(same(a.data, renderField(spec, o).data)).toBe(true);
      expect(same(a.data, renderResolved(resolveField(spec), o).data)).toBe(
        true,
      );
    },
  );

  describe.each([false, true])("animatedGrain %s", (animatedGrain) => {
    const cases = specs.flatMap((s) =>
      [3, 77, 4000000].map((seed) => ({ kind: s.kind, s, seed })),
    );
    it.each(cases)(
      "$kind seed $seed: t=0, t=T, t=2T and t=-T are byte-identical under loop T, and mid-loop differs",
      ({ s, seed }) => {
        const spec = { ...s, animatedGrain, grain: 0.6, seed };
        const o = { width: 96, height: 54, loop: 4 };
        const a = renderField(spec, { ...o, t: 0 });
        for (const t of [4, 8, -4])
          expect(
            same(renderField(spec, { ...o, t }).data, a.data),
            `t=${t}`,
          ).toBe(true);
        expect(same(renderField(spec, { ...o, t: 2 }).data, a.data)).toBe(
          false,
        );
      },
    );
  });

  it("without a loop, t=0 and t=4 differ (time flows linearly)", () => {
    const a = renderField(flow, { width: 32, height: 18 });
    const b = renderField(flow, { width: 32, height: 18, t: 4 });
    expect(same(a.data, b.data)).toBe(false);
  });

  it("maps pixel (x, y) to ((x + 0.5) / width, (y + 0.5) / height), row 0 on top, as the shader does", () => {
    const spec = { ...fluid, grain: 0.5 };
    const r = resolveField(spec);
    const [W, H] = [7, 5];
    const s = makeSampler(r, W, H);
    s.prepare(timeCoords(0.5));
    const out = new Float64Array(3);
    const f = renderField(spec, { width: W, height: H, t: 0.5 });
    for (const [x, y] of [
      [0, 0],
      [6, 0],
      [0, 4],
      [3, 2],
      [6, 4],
    ] as const) {
      s.sample((x + 0.5) / W, (y + 0.5) / H, x, y, out);
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++)
        expect(f.data[i + c]).toBe(
          Math.max(0, Math.min(255, Math.round(out[c]! * 255))),
        );
    }
    // The shader flips gl_FragCoord.y and samples the pixel centre: the same pixel.
    expect(GLSL_MAIN).toContain("uHeight - 1 - int(gl_FragCoord.y)");
    expect(GLSL_MAIN).toContain(
      "(vec2(px) + 0.5) / vec2(float(uWidth), float(uHeight))",
    );
    expect(grainOffset(3, 2, 0, r.seed, 0.5)).not.toBe(0);
  });

  it("rounds to the nearest 8-bit value and clamps", () => {
    const noisy = renderField(
      { kind: "flow", palette: ["#000000", "#ffffff"], grain: 1, seed: 9 },
      { width: 64, height: 64 },
    );
    expect(Math.min(...noisy.data)).toBe(0);
    expect(Math.max(...noisy.data)).toBe(255);
    const white = renderField(
      { kind: "flow", palette: ["#ffffff", "#ffffff"], grain: 0 },
      { width: 4, height: 4 },
    );
    expect([...white.data]).toEqual(new Array<number>(64).fill(255));
    const grey = renderField(
      { kind: "flow", palette: ["#808080", "#808080"], grain: 0 },
      { width: 2, height: 2 },
    );
    expect(grey.data[0]).toBe(128);
  });

  it("does not mutate a raw spec or an options object", () => {
    const spec = structuredClone(fluted);
    const before = JSON.stringify(spec);
    renderField(spec, Object.freeze({ width: 8, height: 8, t: 1, loop: 2 }));
    expect(JSON.stringify(spec)).toBe(before);
  });

  describe("recognising a resolved spec", () => {
    it("accepts what resolveField returned", () => {
      const r = resolveField(fluid);
      expect(renderResolved(r, { width: 4, height: 4 }).data.length).toBe(64);
      // renderField still recognises the object by identity (its type is internal).
      expect(renderField(r as never, { width: 4, height: 4 }).data.length).toBe(
        64,
      );
    });

    it("renders the copy taken at resolve time, whatever is done to the object afterwards", () => {
      const o = { width: 24, height: 14, t: 0.5 };
      const r = resolveField({ ...fluted, reeds: 6 }) as { reeds: number };
      const before = renderResolved(r as never, o);
      r.reeds = 1e9;
      expect(same(renderResolved(r as never, o).data, before.data)).toBe(true);
    });

    it("rejects a copy of a resolved spec loudly instead of drawing another picture", () => {
      const o = { width: 4, height: 4 };
      for (const spec of [flow, fluid, fluted, flutedFluid]) {
        const r = resolveField({ ...spec, light: undefined });
        for (const copy of [structuredClone(r), { ...r }])
          expect(() => renderField(copy as never, o)).toThrow(
            /pass the original/,
          );
      }
      const vignetted = resolveField({ ...flow, light: { vignette: 0.8 } });
      expect(() => renderField(structuredClone(vignetted) as never, o)).toThrow(
        /vignette/,
      );
    });

    it("validates a raw spec that claims to be resolved", () => {
      const spoof = { ...fluid, seed: -1 };
      expect(() => renderField(spoof, { width: 4, height: 4 })).toThrow(/seed/);
    });

    it("re-validates a raw spec on every call", () => {
      const spec = { kind: "flow", palette: ["#000", "#fff"], grain: 0.2 };
      renderField(spec as never, { width: 2, height: 2 });
      spec.grain = 7;
      expect(() => renderField(spec as never, { width: 2, height: 2 })).toThrow(
        /grain/,
      );
    });
  });

  describe("options", () => {
    it.each(specs)(
      "$kind: rejects a fractional, zero, negative, non-finite or huge size",
      (spec) => {
        for (const bad of [0, -1, 1.5, Number.NaN, Infinity, MAX_DIMENSION + 1])
          for (const key of ["width", "height"] as const)
            expect(
              () => renderField(spec, { width: 4, height: 4, [key]: bad }),
              `${key}=${bad}`,
            ).toThrow(new RegExp(`${key}.*integer`));
      },
    );

    it("rejects a size that is not a number, and options that are not an object", () => {
      expect(() =>
        renderField(flow, { width: "4" as never, height: 4 }),
      ).toThrow(/width/);
      expect(() => renderField(flow, null as never)).toThrow(VisError);
      expect(() => renderField(flow, undefined as never)).toThrow(VisError);
    });

    it("caps the pixel count before allocating anything", () => {
      expect(MAX_FRAME_PIXELS).toBe(2 ** 25);
      expect(() =>
        renderField(flow, { width: MAX_DIMENSION, height: MAX_DIMENSION }),
      ).toThrow(/pixels/);
      expect(() => renderField(fluid, { width: 8192, height: 4097 })).toThrow(
        /pixels/,
      );
    });

    it("accepts a thin frame at the dimension limit", () => {
      const f = renderField(flow, { width: MAX_DIMENSION, height: 1 });
      expect(f.data.length).toBe(MAX_DIMENSION * 4);
    });

    it("rejects a bad t or loop naming the parameter, and treats undefined as the default", () => {
      const o = { width: 4, height: 4 };
      for (const t of [Number.NaN, Infinity, -Infinity, "1", null])
        expect(() => renderField(flow, { ...o, t: t as never })).toThrow(
          /\bt\b/,
        );
      for (const loop of [0, -2, Number.NaN, Infinity, "4", null, 1.1e10])
        expect(() => renderField(flow, { ...o, loop: loop as never })).toThrow(
          /loop/,
        );
      const a = renderField(flow, o);
      const b = renderField(flow, {
        ...o,
        t: undefined as never,
        loop: undefined as never,
      });
      expect(same(a.data, b.data)).toBe(true);
    });

    it("accepts a loop of exactly MAX_T and rejects anything above it, naming loop", () => {
      const o = { width: 8, height: 8 };
      for (const spec of specs)
        expect(
          renderField(spec, { ...o, loop: MAX_T, t: 3 }).data,
        ).toHaveLength(256);
      for (const loop of [MAX_T + 1, 1e7, 1.1e10, 1e300])
        expect(() => renderField(flow, { ...o, loop })).toThrow(
          /loop must be .*1000000/,
        );
    });

    it("rejects an unknown spec", () => {
      expect(() =>
        renderField({ kind: "plasma" } as never, { width: 4, height: 4 }),
      ).toThrow(VisError);
    });

    it("accepts t up to MAX_T and rejects beyond it, with or without a loop", () => {
      expect(MAX_T).toBe(1e6);
      const o = { width: 8, height: 8 };
      for (const t of [MAX_T, -MAX_T])
        expect(renderField(flow, { ...o, t }).data.length).toBe(256);
      for (const t of [MAX_T + 1, 1e12, 1e300])
        for (const loop of [undefined, 4])
          expect(() => renderField(flow, { ...o, t, loop } as never)).toThrow(
            /\bt\b/,
          );
    });
  });
});

describe("makeSampler", () => {
  const sampleAt = (spec: object): number[] => {
    const s = makeSampler(resolveField(spec), 8, 8);
    s.prepare(timeCoords(0));
    const o = new Float64Array(3);
    s.sample(0.25, 0.25, 2, 2, o);
    return [...o];
  };

  it.each(specs)("$kind: returns a working sampler", (spec) => {
    expect(sampleAt(spec).every(Number.isFinite)).toBe(true);
  });

  it("dispatches each kind to its own sampler", () => {
    expect(sampleAt(flow)).not.toEqual(sampleAt(fluid));
    expect(sampleAt(flow)).not.toEqual(sampleAt(fluted));
    expect(sampleAt(fluid)).not.toEqual(sampleAt(fluted));
  });
});
