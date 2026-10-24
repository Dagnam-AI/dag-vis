import { describe, expect, it } from "vitest";
import { VisError } from "../../../src/core/index.js";
import { grainOffset } from "../../../src/field/cpu/grain.js";
import { flowSampler, SHAPE_INDEX } from "../../../src/field/cpu/flow.js";
import { paletteLut, sampleLut } from "../../../src/field/lut.js";
import { fbm } from "../../../src/field/noise.js";
import {
  FLOW_SHAPES,
  resolveField,
  type ResolvedFlow,
} from "../../../src/field/spec.js";
import { timeCoords } from "../../../src/field/time.js";

function flow(extra: Record<string, unknown> = {}): ResolvedFlow {
  const r = resolveField({
    kind: "flow",
    palette: ["#102030", "#80c0ff"],
    grain: 0,
    ...extra,
  });
  if (r.kind !== "flow") throw new Error("unreachable");
  return r;
}

function sampleGrid(spec: ResolvedFlow, t = 0, loop?: number): number[] {
  const s = flowSampler(spec, 64, 36);
  s.prepare(timeCoords(t, loop));
  const out = new Float64Array(3);
  const vals: number[] = [];
  for (let y = 0; y < 36; y += 5) {
    for (let x = 0; x < 64; x += 7) {
      s.sample((x + 0.5) / 64, (y + 0.5) / 36, x, y, out);
      vals.push(out[0]!, out[1]!, out[2]!);
    }
  }
  return vals;
}

const maxDiff = (a: number[], b: number[]): number =>
  Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

describe("flowSampler", () => {
  it("maps shapes to the GLSL indices in enum order", () => {
    expect(FLOW_SHAPES.map((s) => SHAPE_INDEX[s])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it.each(FLOW_SHAPES)(
    "shape %s renders in-gamut colours drawn from the palette ramp",
    (shape) => {
      const vals = sampleGrid(
        flow({ shape, rotation: 0.3, warp: { strength: 1.2 } }),
      );
      for (const v of vals) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.05);
    },
  );

  it("renders a different picture for every shape", () => {
    const grids = FLOW_SHAPES.map((shape) => sampleGrid(flow({ shape })));
    for (let i = 0; i < grids.length; i++)
      for (let j = i + 1; j < grids.length; j++)
        expect(maxDiff(grids[i]!, grids[j]!)).toBeGreaterThan(0.02);
  });

  it("is deterministic and time-dependent", () => {
    const a = sampleGrid(flow({ shape: "swirl" }));
    expect(sampleGrid(flow({ shape: "swirl" }))).toEqual(a);
    expect(sampleGrid(flow({ shape: "swirl" }), 3)).not.toEqual(a);
  });

  it("depends on the seed", () => {
    expect(sampleGrid(flow({ seed: 2 }))).not.toEqual(
      sampleGrid(flow({ seed: 3 })),
    );
  });

  describe("hand-derived values (no warp, so the field is one fbm call)", () => {
    // 64x36 gives aspect 16/9. The point u = 0.75, v = 0.25 is
    // x = 0.25 * 16/9 = 4/9, y = -0.25 before the shape step. Noise z = w = 0 at t = 0.
    // Colour = the ramp entry for `val` of a black-to-white palette.
    const lut = paletteLut(["#000000", "#ffffff"]);
    const X = 4 / 9;
    const Y = -0.25;
    const n = (x: number, y: number): number => fbm(x, y, 0, 0, 3, 1);
    const swirlA = 1.5 * Math.sqrt(X * X + Y * Y);
    const R = Math.sqrt(X * X + Y * Y);
    const cases: [string, number][] = [
      ["noise", 0.5 + 0.8 * n(X, Y)],
      ["band", 0.5 + 0.5 * Math.sin((Y + 0.6 * n(X, Y)) * 3)],
      ["wave", 0.5 + 0.8 * n(X, Y + 0.35 * Math.sin(2 * X))],
      ["aurora", 0.5 + 0.8 * n(X * 1.8, Y * 0.45)],
      [
        "bloom",
        (0.5 + 0.8 * n(X, Y)) * 0.45 + (1 - Math.min(1, R * 0.9)) * 0.55,
      ],
      [
        "swirl",
        0.5 +
          0.8 *
            n(
              X * Math.cos(swirlA) - Y * Math.sin(swirlA),
              X * Math.sin(swirlA) + Y * Math.cos(swirlA),
            ),
      ],
    ];

    it.each(cases)("shape %s", (shape, val) => {
      const spec = flow({
        shape,
        palette: ["#000000", "#ffffff"],
        warp: { strength: 0 },
      });
      const s = flowSampler(spec, 64, 36);
      s.prepare(timeCoords(0));
      const out = new Float64Array(3);
      s.sample(0.75, 0.25, 48, 9, out);
      const want = new Float64Array(3);
      sampleLut(lut, Math.min(1, Math.max(0, val)), want);
      for (let c = 0; c < 3; c++) expect(out[c]).toBeCloseTo(want[c]!, 12);
    });

    it("the cases are not all clamped to one end of the ramp", () => {
      for (const [, val] of cases) {
        expect(val).toBeGreaterThan(0.05);
        expect(val).toBeLessThan(0.95);
      }
    });

    it("rotation turns the sample point: (x, y) becomes (x cos - y sin, x sin + y cos)", () => {
      const s = flowSampler(
        flow({
          palette: ["#000000", "#ffffff"],
          warp: { strength: 0 },
          rotation: Math.PI / 2,
        }),
        64,
        36,
      );
      s.prepare(timeCoords(0));
      const out = new Float64Array(3);
      s.sample(0.75, 0.25, 0, 0, out);
      // A quarter turn: (4/9, -1/4) becomes (1/4, 4/9) up to sin/cos rounding.
      const want = new Float64Array(3);
      sampleLut(lut, 0.5 + 0.8 * fbm(0.25, 4 / 9, 0, 0, 3, 1), want);
      expect(out[1]).toBeCloseTo(want[1]!, 9);
    });

    it("scale and warp scale multiply the sample point", () => {
      const s = flowSampler(
        flow({
          palette: ["#000000", "#ffffff"],
          warp: { strength: 0, scale: 2 },
          scale: 1.5,
        }),
        64,
        36,
      );
      s.prepare(timeCoords(0));
      const out = new Float64Array(3);
      s.sample(0.75, 0.25, 0, 0, out);
      const want = new Float64Array(3);
      sampleLut(
        lut,
        0.5 + 0.8 * fbm(X * 1.5 * 2, Y * 1.5 * 2, 0, 0, 3, 1),
        want,
      );
      expect(out[2]).toBeCloseTo(want[2]!, 12);
    });

    it("the warp is fbm(p + s*fbm(p + s*fbm(p)))", () => {
      const strength = 1.3;
      const f = (x: number, y: number): number => fbm(x, y, 0, 0, 3, 1);
      const qx = f(X, Y);
      const qy = f(X + 5.2, Y + 1.3);
      const rx = f(X + strength * qx + 1.7, Y + strength * qy + 9.2);
      const ry = f(X + strength * qx + 8.3, Y + strength * qy + 2.8);
      const val = 0.5 + 0.8 * f(X + strength * rx, Y + strength * ry);
      const s = flowSampler(
        flow({ palette: ["#000000", "#ffffff"], warp: { strength } }),
        64,
        36,
      );
      s.prepare(timeCoords(0));
      const out = new Float64Array(3);
      s.sample(0.75, 0.25, 0, 0, out);
      const want = new Float64Array(3);
      sampleLut(lut, Math.min(1, Math.max(0, val)), want);
      expect(out[0]).toBeCloseTo(want[0]!, 12);
    });
  });

  it("highlight pulls pixels near `at` towards its colour; vignette darkens corners", () => {
    const base = flow({ shape: "noise" });
    const lit = flow({
      shape: "noise",
      light: {
        highlight: {
          at: [0.1, 0.1],
          strength: 1,
          radius: 0.3,
          color: "#ffffff",
        },
      },
    });
    const dark = flow({ shape: "noise", light: { vignette: 1 } });
    const out = new Float64Array(3);
    const sb = flowSampler(base, 64, 36);
    const sl = flowSampler(lit, 64, 36);
    const sd = flowSampler(dark, 64, 36);
    const tc = timeCoords(0);
    sb.prepare(tc);
    sl.prepare(tc);
    sd.prepare(tc);
    sb.sample(0.1, 0.1, 6, 3, out);
    const b = out[0]!;
    sl.sample(0.1, 0.1, 6, 3, out);
    expect(out[0]).toBeGreaterThan(b);
    sb.sample(0.02, 0.02, 1, 0, out);
    const corner = out[0]!;
    sd.sample(0.02, 0.02, 1, 0, out);
    expect(out[0]).toBeLessThan(corner);
  });

  it("a full-strength highlight is exactly its colour at its centre and absent beyond its radius", () => {
    const spec = flow({
      shape: "noise",
      light: {
        highlight: {
          at: [0.5, 0.5],
          strength: 1,
          radius: 0.2,
          color: "#ff8000",
        },
      },
    });
    const none = flow({ shape: "noise" });
    const s = flowSampler(spec, 64, 36);
    const plain = flowSampler(none, 64, 36);
    const out = new Float64Array(3);
    const ref = new Float64Array(3);
    s.prepare(timeCoords(0));
    plain.prepare(timeCoords(0));
    s.sample(0.5, 0.5, 32, 18, out);
    expect(out[0]).toBe(1);
    expect(out[1]).toBeCloseTo(128 / 255, 12);
    expect(out[2]).toBe(0);
    // Horizontal distance 0.3 * aspect > 0.2: smoothstep is 1, the pull is 0.
    s.sample(0.8, 0.5, 51, 18, out);
    plain.sample(0.8, 0.5, 51, 18, ref);
    expect(Array.from(out)).toEqual(Array.from(ref));
    // Halfway through the radius the pull is (1 - smoothstep)^2 = 0.25^2 ... derived below.
    const aspect = 64 / 36;
    const u = 0.5 + 0.1 / aspect; // distance 0.1 = radius / 2 -> smoothstep 0.5 -> k = 0.5 -> h = 0.25
    s.sample(u, 0.5, 40, 18, out);
    plain.sample(u, 0.5, 40, 18, ref);
    expect(out[0]).toBeCloseTo(ref[0]! * 0.75 + 1 * 0.25, 12);
    expect(out[2]).toBeCloseTo(ref[2]! * 0.75, 12);
  });

  it("the vignette is exactly black far out, untouched at the centre", () => {
    const dark = flowSampler(flow({ light: { vignette: 1 } }), 64, 36);
    const plain = flowSampler(flow({}), 64, 36);
    const out = new Float64Array(3);
    const ref = new Float64Array(3);
    dark.prepare(timeCoords(0));
    plain.prepare(timeCoords(0));
    dark.sample(0.02, 0.02, 1, 0, out);
    expect(Array.from(out)).toEqual([0, 0, 0]);
    dark.sample(0.5, 0.5, 32, 18, out);
    plain.sample(0.5, 0.5, 32, 18, ref);
    expect(Array.from(out)).toEqual(Array.from(ref));
    // Half-strength: scales the colour by 1 - 0.5 * smoothstep(0.35, 0.95, 1.2 * d).
    const half = flowSampler(flow({ light: { vignette: 0.5 } }), 64, 36);
    half.prepare(timeCoords(0));
    const u = 0.5 + 0.3 / (64 / 36); // d = 0.3, 1.2 d = 0.36 -> t = 0.01 / 0.6
    half.sample(u, 0.5, 40, 18, out);
    plain.sample(u, 0.5, 40, 18, ref);
    const t = 0.01 / 0.6;
    const smooth = t * t * (3 - 2 * t);
    expect(out[0]).toBeCloseTo(ref[0]! * (1 - 0.5 * smooth), 12);
  });

  it("grain adds a per-pixel offset that changes with grainFrame only when animated", () => {
    // The noise moves with time too, so the grain is measured as the difference to the same field without grain.
    const grainAt = (animatedGrain: boolean, t: number): number => {
      const withGrain = flowSampler(
        flow({ grain: 1, shape: "noise", animatedGrain }),
        8,
        8,
      );
      const without = flowSampler(flow({ grain: 0, shape: "noise" }), 8, 8);
      const a = new Float64Array(3);
      const b = new Float64Array(3);
      withGrain.prepare(timeCoords(t));
      without.prepare(timeCoords(t));
      withGrain.sample(0.5, 0.5, 4, 4, a);
      without.sample(0.5, 0.5, 4, 4, b);
      return a[0]! - b[0]!;
    };
    expect(grainAt(true, 0)).not.toBeCloseTo(grainAt(true, 1), 6);
    expect(grainAt(false, 0)).toBeCloseTo(grainAt(false, 1), 12);
    expect(grainAt(false, 0)).not.toBe(0);
  });

  it("grain is the same monochrome offset on all channels: grainOffset(px, py, grainFrame, seed, amount)", () => {
    const withGrain = flowSampler(flow({ grain: 0.6, seed: 77 }), 8, 8);
    const without = flowSampler(flow({ grain: 0, seed: 77 }), 8, 8);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    const tc = timeCoords(2.5);
    expect(tc.grainFrame).toBe(60);
    withGrain.prepare(tc);
    without.prepare(tc);
    for (const [px, py] of [
      [0, 0],
      [3, 5],
      [7, 7],
    ] as const) {
      const u = (px + 0.5) / 8;
      const v = (py + 0.5) / 8;
      withGrain.sample(u, v, px, py, a);
      without.sample(u, v, px, py, b);
      const g = grainOffset(px, py, 60, 77, 0.6);
      for (let c = 0; c < 3; c++) expect(a[c]! - b[c]!).toBeCloseTo(g, 12);
    }
    // Still grain uses frame 0 whatever the time.
    const still = flowSampler(
      flow({ grain: 0.6, seed: 77, animatedGrain: false }),
      8,
      8,
    );
    still.prepare(tc);
    still.sample(0.0625, 0.0625, 0, 0, a);
    without.sample(0.0625, 0.0625, 0, 0, b);
    expect(a[0]! - b[0]!).toBeCloseTo(grainOffset(0, 0, 0, 77, 0.6), 12);
  });

  it("loops seamlessly: the frame at t = 0 equals the frame at t = T, grain included", () => {
    for (const shape of FLOW_SHAPES) {
      const spec = flow({ shape, grain: 0.5, seed: 12 });
      const a = sampleGrid(spec, 0, 4);
      expect(sampleGrid(spec, 4, 4)).toEqual(a);
      expect(sampleGrid(spec, 8, 4)).toEqual(a);
      expect(sampleGrid(spec, 2, 4)).not.toEqual(a);
    }
  });

  it("is a pure function of (time, u, v, px, py): call order and repeats change nothing", () => {
    const spec = flow({ shape: "aurora", grain: 0.4 });
    const s = flowSampler(spec, 64, 36);
    s.prepare(timeCoords(1.25));
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    s.sample(0.3, 0.6, 19, 21, a);
    s.sample(0.9, 0.1, 57, 3, b);
    s.sample(0.3, 0.6, 19, 21, b);
    expect(Array.from(b)).toEqual(Array.from(a));
    const fresh = flowSampler(spec, 64, 36);
    fresh.prepare(timeCoords(1.25));
    fresh.sample(0.3, 0.6, 19, 21, b);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("does not keep the time coordinates object or the spec: later mutation changes nothing", () => {
    const spec = flow({ shape: "wave", grain: 0.5 });
    const s = flowSampler(spec, 16, 9);
    const tc = { ...timeCoords(1) };
    s.prepare(tc);
    const a = new Float64Array(3);
    s.sample(0.5, 0.5, 8, 4, a);
    const before = Array.from(a);
    tc.z = 100;
    tc.w = 100;
    tc.grainFrame = 999;
    spec.shape = "band";
    spec.scale = 9;
    spec.seed = 5;
    spec.grain = 0;
    spec.palette.length = 0;
    s.sample(0.5, 0.5, 8, 4, a);
    expect(Array.from(a)).toEqual(before);
  });

  it("samples at time zero before the first prepare", () => {
    const spec = flow({ grain: 0.3 });
    const s = flowSampler(spec, 16, 9);
    const t0 = flowSampler(spec, 16, 9);
    t0.prepare(timeCoords(0));
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    s.sample(0.4, 0.4, 6, 3, a);
    t0.sample(0.4, 0.4, 6, 3, b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("rejects a NaN, infinite or huge u or v naming the parameter, and accepts the edge of the range", () => {
    const out = new Float64Array(3);
    const s = flowSampler(flow(), 64, 36);
    s.prepare(timeCoords(0));
    for (const bad of [Number.NaN, Infinity, -Infinity, 1e300, -1e12]) {
      expect(() => {
        s.sample(bad, 0.5, 0, 0, out);
      }).toThrow(VisError);
      expect(() => {
        s.sample(bad, 0.5, 0, 0, out);
      }).toThrow(/^u must be a finite number within ±/);
      expect(() => {
        s.sample(0.5, bad, 0, 0, out);
      }).toThrow(/^v must be a finite number within ±/);
    }
    // The most extreme legal spec has the smallest range; its edge still samples.
    const extreme = flowSampler(
      flow({
        shape: "aurora",
        scale: 10,
        warp: { octaves: 5, strength: 3, scale: 10 },
      }),
      64,
      36,
    );
    extreme.prepare(timeCoords(0));
    const limit = 2 ** 27 / (2 * (64 / 36) * 10 * 10 * 16);
    for (const edge of [limit, -limit]) {
      extreme.sample(edge, edge, 0, 0, out);
      expect(Number.isFinite(out[0])).toBe(true);
    }
    expect(() => {
      extreme.sample(limit * 1.01, 0.5, 0, 0, out);
    }).toThrow(/^u must/);
    expect(() => {
      extreme.sample(0.5, -limit * 1.01, 0, 0, out);
    }).toThrow(/^v must/);
    // An ordinary spec accepts far-off pixels (a tiled or panned view).
    s.sample(1000, -1000, 0, 0, out);
    expect(Number.isFinite(out[0])).toBe(true);
  });

  it("rejects a non-positive or non-finite size, naming the parameter", () => {
    const spec = flow();
    for (const bad of [0, -1, Number.NaN, Infinity, -Infinity])
      for (const [w, h, name] of [
        [bad, 9, "width"],
        [16, bad, "height"],
      ] as const) {
        expect(() => flowSampler(spec, w, h)).toThrow(VisError);
        expect(() => flowSampler(spec, w, h)).toThrow(new RegExp(`^${name} `));
      }
    expect(() => flowSampler(spec, "16" as unknown as number, 9)).toThrow(
      /^width /,
    );
  });
});
