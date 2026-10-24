import { describe, expect, it } from "vitest";
import { VisError } from "../../../src/core/index.js";
import { flowSampler } from "../../../src/field/cpu/flow.js";
import { fluidSampler } from "../../../src/field/cpu/fluid.js";
import {
  flutedSampler,
  reedIndex,
  reedOffsets,
} from "../../../src/field/cpu/fluted.js";
import { grainOffset } from "../../../src/field/cpu/grain.js";
import type { Sampler } from "../../../src/field/cpu/types.js";
import {
  MAX_REEDS,
  resolveField,
  type ResolvedFlow,
  type ResolvedFluted,
} from "../../../src/field/spec.js";
import { timeCoords } from "../../../src/field/time.js";

function fluted(
  extra: Record<string, unknown> = {},
  source: Record<string, unknown> = {},
): ResolvedFluted {
  const r = resolveField({
    kind: "fluted",
    grain: 0,
    reeds: 8,
    source: {
      kind: "flow",
      palette: ["#000000", "#ffffff"],
      shape: "noise",
      ...source,
    },
    ...extra,
  });
  if (r.kind !== "fluted") throw new Error("unreachable");
  return r;
}

function flowOf(spec: ResolvedFluted): ResolvedFlow {
  if (spec.source.kind !== "flow") throw new Error("unreachable");
  return spec.source;
}

/** One white point on black at (0.25, 0.5) that does not drift: the colour is known in closed form. */
function pointFluted(extra: Record<string, unknown> = {}): ResolvedFluted {
  const r = resolveField({
    kind: "fluted",
    grain: 0,
    reeds: 2,
    jitter: 0,
    refraction: 1,
    shade: 0,
    source: {
      kind: "fluid",
      points: [{ at: [0.25, 0.5], color: "#ffffff" }],
      base: "#000000",
      drift: 0,
    },
    ...extra,
  });
  if (r.kind !== "fluted") throw new Error("unreachable");
  return r;
}

/** The sampler's colour at the centre of pixel (px, py) of a width x height picture. */
function at(
  s: Sampler,
  width: number,
  height: number,
  px: number,
  py: number,
): number[] {
  const out = new Float64Array(3);
  s.sample((px + 0.5) / width, (py + 0.5) / height, px, py, out);
  return Array.from(out);
}

describe("reedOffsets", () => {
  it("is seeded, bounded by jitter / reeds and zero when jitter is 0", () => {
    const o = reedOffsets(fluted({ jitter: 1 }));
    expect(o.length).toBe(8);
    for (const v of o) expect(Math.abs(v)).toBeLessThanOrEqual(0.5 / 8);
    expect(reedOffsets(fluted({ jitter: 1 }))).toEqual(o);
    expect(reedOffsets(fluted({ jitter: 1, seed: 9 }))).not.toEqual(o);
    expect(Array.from(reedOffsets(fluted({ jitter: 0 })))).toEqual(
      new Array<number>(8).fill(0),
    );
  });

  // Computed with an independent implementation (Python): (hash01(i, 0x51ed, 0, 0, seed) - 0.5) * jitter / reeds.
  it.each([
    [
      1,
      4,
      1,
      [
        -0.09344486542977393, 0.08559873985359445, 0.09546632709680125,
        -0.10869738296605647,
      ],
    ],
    [
      4294967295,
      3,
      0.5,
      [0.08025391912087798, -0.022565164836123586, -0.06818042835220695],
    ],
    [0, 2, 1, [0.16090477968100458, -0.0467349550453946]],
  ])(
    "matches the hand-derived values for seed %i, %i reeds, jitter %f",
    (seed, reeds, jitter, expected) => {
      const o = reedOffsets(fluted({ seed, reeds, jitter }));
      expect(o.length).toBe(expected.length);
      expected.forEach((e, i) => {
        expect(o[i]).toBeCloseTo(e, 14);
      });
    },
  );

  it("scales linearly with jitter and spans the whole allowed reed count", () => {
    const full = reedOffsets(fluted({ jitter: 1, reeds: MAX_REEDS }));
    const half = reedOffsets(fluted({ jitter: 0.5, reeds: MAX_REEDS }));
    expect(full.length).toBe(MAX_REEDS);
    full.forEach((v, i) => {
      expect(half[i]).toBeCloseTo(v / 2, 15);
    });
    // Both signs occur: the offsets are centred, not one-sided.
    expect(Math.min(...full)).toBeLessThan(0);
    expect(Math.max(...full)).toBeGreaterThan(0);
  });
});

describe("reedIndex", () => {
  /** Floor of the exact rational (2p+1) * reeds / (2 * size), in BigInt. */
  const exact = (p: number, size: number, reeds: number): number =>
    Number((BigInt(2 * p + 1) * BigInt(reeds)) / BigInt(2 * size));

  it("is the exact floor of the rational for every pixel of awkward widths and every reed count", () => {
    const sizes = [
      1, 2, 3, 7, 9, 64, 100, 333, 640, 1000, 1920, 3000, 5000, 7680, 8191,
      8192, 16384,
    ];
    for (const size of sizes)
      for (let reeds = 2; reeds <= MAX_REEDS; reeds++) {
        // Every pixel for small widths, a stride plus every pixel near each reed boundary for big ones.
        const step = size <= 1000 ? 1 : 7;
        for (let p = 0; p < size; p += step)
          if (reedIndex(p, size, reeds) !== exact(p, size, reeds))
            throw new Error(
              `reed flip at size ${size}, reeds ${reeds}, p ${p}`,
            );
        for (let k = 1; k < reeds; k++) {
          // The pixel whose centre is at or just past reed boundary k.
          const p = Math.min(size - 1, Math.floor((k * size) / reeds));
          for (let q = Math.max(0, p - 2); q <= Math.min(size - 1, p + 2); q++)
            if (reedIndex(q, size, reeds) !== exact(q, size, reeds))
              throw new Error(
                `reed flip at size ${size}, reeds ${reeds}, p ${q}`,
              );
        }
      }
  });

  it("puts a pixel centre exactly on a reed edge into the reed on its right", () => {
    // 100 wide, 120 reeds: pixel 52 has its centre at 52.5 / 100 * 120 = 63 exactly.
    expect(reedIndex(52, 100, 120)).toBe(63);
    expect(reedIndex(51, 100, 120)).toBe(61);
    // The naive float expression the shader would otherwise run gives 62 here
    // (float32 rounds the quotient down), which is why the index is integer arithmetic.
    const f = Math.fround;
    expect(Math.floor(f(f(f(52.5) / f(100)) * 120))).toBe(62);
  });

  it("is reproduced by the shader's integer recipe, whose float32 steps are all exact", () => {
    const f = Math.fround;
    for (const size of [1, 9, 100, 1000, 3000, 8191, 8192, 16384])
      for (const reeds of [2, 3, 120, 240, 255, MAX_REEDS]) {
        const d = 2 * size;
        for (let p = 0; p < size; p++) {
          // The shader recovers the pixel from float32 uv = (p + 0.5) / size.
          const uv = f(f(p + 0.5) / f(size));
          const recovered = Math.floor(f(uv * f(size)));
          if (recovered !== p) throw new Error(`pixel ${p} of ${size} lost`);
          const n = (2 * p + 1) * reeds;
          const i = Math.trunc(n / d);
          if (i !== reedIndex(p, size, reeds)) throw new Error("index differs");
          // The numerator of the in-reed fraction is below 2^24: exact in float32.
          const rem = n - i * d;
          if (f(rem) !== rem || rem < 0 || rem >= d)
            throw new Error("fraction");
        }
      }
  });
});

describe("flutedSampler", () => {
  it("with refraction 1 every pixel in a reed shows the reed-centre column", () => {
    const s = flutedSampler(
      fluted({ refraction: 1, shade: 0, jitter: 0 }),
      64,
      32,
    );
    s.prepare(timeCoords(0));
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    s.sample(1.5 / 64, 0.5, 1, 16, a);
    s.sample(6.5 / 64, 0.5, 6, 16, b);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("shade darkens the left edge of a reed relative to its right edge", () => {
    const s = flutedSampler(
      fluted({ refraction: 1, shade: 1, jitter: 0 }),
      64,
      32,
    );
    s.prepare(timeCoords(0));
    const left = new Float64Array(3);
    const right = new Float64Array(3);
    s.sample(0.5 / 64, 0.5, 0, 16, left);
    s.sample(7.5 / 64, 0.5, 7, 16, right);
    expect(left[0]).toBeLessThan(Number(right[0]));
  });

  it("horizontal direction reeds along v and accepts a fluid source", () => {
    const spec = fluted(
      { direction: "horizontal", refraction: 1, shade: 0, jitter: 0 },
      {},
    );
    const s = flutedSampler(spec, 32, 64);
    s.prepare(timeCoords(0));
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    s.sample(0.5, 1.5 / 64, 16, 1, a);
    s.sample(0.5, 6.5 / 64, 16, 6, b);
    expect(Array.from(b)).toEqual(Array.from(a));
    const fl = resolveField({
      kind: "fluted",
      source: { kind: "fluid", points: [{ at: [0.5, 0.5], color: "#ff0000" }] },
    });
    if (fl.kind !== "fluted") throw new Error("unreachable");
    const fs = flutedSampler(fl, 16, 16);
    fs.prepare(timeCoords(0));
    fs.sample(0.5, 0.5, 8, 8, a);
    expect(a[0]).toBeGreaterThan(0.5);
  });

  it("applies its own grain after shading, frame-dependent only when animated", () => {
    // A fluid source without drift is the same at every time, so only the grain can change.
    const out = new Float64Array(3);
    const g = flutedSampler(pointFluted({ grain: 1 }), 8, 8);
    g.prepare(timeCoords(0));
    g.sample(0.5, 0.5, 4, 4, out);
    const a = out[0];
    g.prepare(timeCoords(1));
    g.sample(0.5, 0.5, 4, 4, out);
    expect(out[0]).not.toBe(a);
    const still = flutedSampler(
      pointFluted({ grain: 1, animatedGrain: false }),
      8,
      8,
    );
    still.prepare(timeCoords(0));
    still.sample(0.5, 0.5, 4, 4, out);
    const b = out[0];
    still.prepare(timeCoords(1));
    still.sample(0.5, 0.5, 4, 4, out);
    expect(out[0]).toBe(b);
  });

  it("adds exactly grainOffset to the shaded colour, from the grain frame when animated", () => {
    const tc = timeCoords(2.3);
    const plain = flutedSampler(fluted({ grain: 0, seed: 77 }), 16, 8);
    const grained = flutedSampler(fluted({ grain: 0.6, seed: 77 }), 16, 8);
    plain.prepare(tc);
    grained.prepare(tc);
    const g = grainOffset(5, 3, tc.grainFrame, 77, 0.6);
    expect(g).not.toBe(0);
    const p = at(plain, 16, 8, 5, 3);
    const q = at(grained, 16, 8, 5, 3);
    for (let c = 0; c < 3; c++) expect(q[c]).toBeCloseTo(Number(p[c]) + g, 14);
  });

  it("matches the closed-form colour of a refracted pixel (white point on black)", () => {
    // 8 x 1 picture, 2 reeds, refraction 1: pixel 0 samples the reed-0 centre u = 0.25, the point itself.
    // Weight 1 against the base's 0.02: L = 1 / 1.02, a = b = 0, so sRGB = 1.055 L^1.25 - 0.055.
    const grey = 0.974205847295328;
    const s = flutedSampler(pointFluted(), 8, 1);
    s.prepare(timeCoords(0));
    for (const px of [0, 1, 2, 3]) {
      const c = at(s, 8, 1, px, 0);
      for (const v of c) expect(v).toBeCloseTo(grey, 6);
    }
    // The second reed centres on u = 0.75, 0.5 * aspect = 4 picture heights from the point: base only.
    for (const v of at(s, 8, 1, 5, 0)) expect(v).toBeLessThan(1e-6);
  });

  it("multiplies the colour by the hand-derived shade at a known position in the reed", () => {
    // Pixel 0: n = 1 * 2, d = 16, so f = 2 / 16 = 0.125; smoothstep(0, 0.3, f) = 0.3761574074...;
    // m = 1 - 0.7 * (1 - 0.3761574074...) + 0.35 * smoothstep(0.7, 1, f) (= 0) = 0.5633101851...
    const grey = 0.974205847295328;
    const s = flutedSampler(pointFluted({ shade: 1 }), 8, 1);
    s.prepare(timeCoords(0));
    for (const v of at(s, 8, 1, 0, 0))
      expect(v).toBeCloseTo(grey * 0.5633101851851852, 6);
    // Pixel 3, the last of the reed: f = 14 / 16 = 0.875, so smoothstep(0, 0.3, f) = 1 and
    // t = (0.875 - 0.7) / 0.3, m = 1 + 0.35 * t^2 (3 - 2t).
    const t = (0.875 - 0.7) / 0.3;
    const m = 1 + 0.35 * (t * t * (3 - 2 * t));
    for (const v of at(s, 8, 1, 3, 0)) expect(v).toBeCloseTo(grey * m, 6);
  });

  it("refracts by the hand-derived amount: a2 = c + (a - c)(1 - refraction)", () => {
    // Refraction 0.5, no jitter: pixel 0 of 8 wide (a = 0.0625) in reed 0 (c = 0.25) samples a2 = 0.15625.
    const spec = fluted({
      reeds: 2,
      refraction: 0.5,
      shade: 0,
      jitter: 0,
      seed: 5,
    });
    const s = flutedSampler(spec, 8, 4);
    s.prepare(timeCoords(0));
    const direct = flowSampler(flowOf(spec), 8, 4);
    direct.prepare(timeCoords(0));
    const want = new Float64Array(3);
    direct.sample(0.15625, (1 + 0.5) / 4, 0, 1, want);
    expect(at(s, 8, 4, 0, 1)).toEqual(Array.from(want));
  });

  it("moves its source with time, flow and fluid alike", () => {
    const tc = timeCoords(2.5);
    const flowSpec = fluted({ refraction: 1, shade: 0, jitter: 0, seed: 6 });
    const drifting = resolveField({
      kind: "fluted",
      grain: 0,
      reeds: 4,
      jitter: 0,
      refraction: 1,
      shade: 0,
      source: {
        kind: "fluid",
        points: [{ at: [0.5, 0.5], color: "#ff0000" }],
        base: "#0000ff",
        softness: 0.1,
        drift: 0.4,
      },
    });
    if (drifting.kind !== "fluted" || drifting.source.kind !== "fluid")
      throw new Error("unreachable");
    const moving = flutedSampler(drifting, 16, 4);
    moving.prepare(tc);
    const still = flutedSampler(drifting, 16, 4);
    still.prepare(timeCoords(0));
    expect(at(moving, 16, 4, 6, 2)).not.toEqual(at(still, 16, 4, 6, 2));
    const direct = fluidSampler(drifting.source, 16, 4);
    direct.prepare(tc);
    const want = new Float64Array(3);
    // Pixel 6 of 16 is in reed 1 of 4 (centre 0.375).
    direct.sample(0.375, 0.625, 6, 2, want);
    expect(at(moving, 16, 4, 6, 2)).toEqual(Array.from(want));
    const s = flutedSampler(flowSpec, 16, 4);
    s.prepare(tc);
    const flowDirect = flowSampler(flowOf(flowSpec), 16, 4);
    flowDirect.prepare(tc);
    // Pixel 13 of 16 is in reed 6 of 8 (centre 0.8125).
    flowDirect.sample(0.8125, 0.625, 13, 2, want);
    expect(at(s, 16, 4, 13, 2)).toEqual(Array.from(want));
    flowDirect.prepare(timeCoords(0));
    flowDirect.sample(0.8125, 0.625, 13, 2, want);
    expect(at(s, 16, 4, 13, 2)).not.toEqual(Array.from(want));
  });

  it("adds the reed's jitter offset to the sampled coordinate", () => {
    const spec = fluted({ refraction: 1, shade: 0, jitter: 1, seed: 11 });
    const s = flutedSampler(spec, 16, 4);
    s.prepare(timeCoords(0));
    const direct = flowSampler(flowOf(spec), 16, 4);
    direct.prepare(timeCoords(0));
    const offsets = reedOffsets(spec);
    const want = new Float64Array(3);
    // Pixel 13 of 16 lies in reed 6 of 8 (centre 13 / 16 = 0.8125).
    direct.sample(0.8125 + Number(offsets[6]), 0.375, 13, 1, want);
    expect(at(s, 16, 4, 13, 1)).toEqual(Array.from(want));
  });

  it("changes reed exactly at the pixel whose centre is on the edge", () => {
    // 100 wide, 120 reeds, refraction 1: the colour is the source at the reed centre.
    const spec = fluted({
      reeds: 120,
      refraction: 1,
      shade: 0,
      jitter: 0,
      seed: 3,
    });
    const s = flutedSampler(spec, 100, 2);
    s.prepare(timeCoords(0));
    const direct = flowSampler(flowOf(spec), 100, 2);
    direct.prepare(timeCoords(0));
    const out = new Float64Array(3);
    const centre = (i: number): number[] => {
      direct.sample((i + 0.5) / 120, 0.25, 0, 0, out);
      return Array.from(out);
    };
    expect(at(s, 100, 2, 52, 0)).toEqual(centre(63));
    expect(at(s, 100, 2, 51, 0)).toEqual(centre(61));
    expect(at(s, 100, 2, 53, 0)).toEqual(centre(64));
    expect(centre(63)).not.toEqual(centre(62));
  });

  it("chooses the reed of the pixel containing u, and clamps outside the picture", () => {
    const spec = fluted({ refraction: 1, shade: 0, jitter: 0, seed: 4 });
    const s = flutedSampler(spec, 64, 8);
    s.prepare(timeCoords(0));
    const inside = new Float64Array(3);
    const other = new Float64Array(3);
    // Anywhere inside pixel 9 (reed 1) gives the colour of the pixel centre.
    s.sample(9.5 / 64, 0.5, 9, 0, inside);
    for (const u of [9.01 / 64, 9.99 / 64]) {
      s.sample(u, 0.5, 9, 0, other);
      expect(Array.from(other)).toEqual(Array.from(inside));
    }
    // Left of the picture is reed 0, right of it the last reed: finite colours, no NaN.
    const first = new Float64Array(3);
    const last = new Float64Array(3);
    s.sample(0.5 / 64, 0.5, 0, 0, first);
    s.sample(63.5 / 64, 0.5, 63, 0, last);
    s.sample(-0.2, 0.5, 0, 0, other);
    expect(Array.from(other)).toEqual(Array.from(first));
    s.sample(1.2, 0.5, 63, 0, other);
    expect(Array.from(other)).toEqual(Array.from(last));
  });

  it("is deterministic, pure, and sensitive to the seed", () => {
    const make = (seed: number): number[] => {
      const s = flutedSampler(fluted({ jitter: 1, grain: 0.5, seed }), 24, 12);
      s.prepare(timeCoords(1.25, 4));
      const all: number[] = [];
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 24; x++) all.push(...at(s, 24, 12, x, y));
      return all;
    };
    expect(make(7)).toEqual(make(7));
    expect(make(7)).not.toEqual(make(8));
    const s = flutedSampler(fluted({ jitter: 1 }), 24, 12);
    s.prepare(timeCoords(0.5));
    expect(at(s, 24, 12, 5, 5)).toEqual(at(s, 24, 12, 5, 5));
  });

  it("is seamless at the loop boundary, bit for bit, with grain", () => {
    const T = 3.3;
    const s = flutedSampler(
      fluted({ grain: 0.5, jitter: 1, seed: 21 }, { seed: 4 }),
      16,
      9,
    );
    const frame = (t: number): number[] => {
      s.prepare(timeCoords(t, T));
      const all: number[] = [];
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < 16; x++) all.push(...at(s, 16, 9, x, y));
      return all;
    };
    expect(frame(T)).toEqual(frame(0));
    expect(frame(2 * T)).toEqual(frame(0));
    expect(frame(T / 2)).not.toEqual(frame(0));
  });

  it("works over a fluid source with a loop too", () => {
    const spec = pointFluted({ grain: 0.4 });
    expect(spec.source.kind).toBe("fluid");
    const s = flutedSampler(spec, 8, 2);
    s.prepare(timeCoords(0, 5));
    const a = at(s, 8, 2, 2, 1);
    s.prepare(timeCoords(5, 5));
    expect(at(s, 8, 2, 2, 1)).toEqual(a);
  });

  it("copies what it needs from the spec at construction", () => {
    const spec = fluted({ refraction: 1, shade: 0, jitter: 0, grain: 0 });
    const s = flutedSampler(spec, 64, 8);
    s.prepare(timeCoords(0));
    const before = at(s, 64, 8, 2, 2);
    spec.refraction = 0;
    spec.shade = 1;
    spec.jitter = 1;
    spec.reeds = 2;
    spec.direction = "horizontal";
    spec.grain = 1;
    flowOf(spec).scale = 9;
    s.prepare(timeCoords(0));
    expect(at(s, 64, 8, 2, 2)).toEqual(before);
  });

  it("rejects a bad width or height before building anything", () => {
    const spec = fluted();
    for (const bad of [0, -3, NaN, Infinity, 2.5, 0.5, "8", null, undefined])
      for (const which of ["width", "height"] as const) {
        const args: [number, number] =
          which === "width" ? [bad as number, 8] : [8, bad as number];
        expect(() => flutedSampler(spec, ...args)).toThrow(VisError);
        expect(() => flutedSampler(spec, ...args)).toThrow(
          new RegExp(`^${which} must be a positive `),
        );
      }
  });

  it.each([
    ["u", NaN, 0.5],
    ["u", Infinity, 0.5],
    ["u", -1e7, 0.5],
    ["v", 0.5, NaN],
    ["v", 0.5, -Infinity],
    ["v", 0.5, 1e7],
  ])(
    "throws a VisError naming %s for a bad coordinate (%f, %f)",
    (name, u, v) => {
      // Refraction 1 would otherwise hide a huge coordinate behind the reed centre.
      for (const direction of ["vertical", "horizontal"] as const) {
        const s = flutedSampler(
          fluted({ direction, refraction: 1, shade: 0, jitter: 0 }),
          16,
          16,
        );
        s.prepare(timeCoords(0));
        expect(() => {
          s.sample(u, v, 0, 0, new Float64Array(3));
        }).toThrow(VisError);
        expect(() => {
          s.sample(u, v, 0, 0, new Float64Array(3));
        }).toThrow(new RegExp(`^${name} must be a finite number`));
      }
    },
  );

  it("accepts a coordinate far outside the picture, up to the shared reach", () => {
    const s = flutedSampler(
      fluted({ refraction: 1, shade: 0, jitter: 0 }),
      16,
      16,
    );
    s.prepare(timeCoords(0));
    const out = new Float64Array(3);
    s.sample(5e5, -5e5, 0, 0, out);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it("scales the coordinate limit by the aspect, wide pictures only (an aspect swap fails)", () => {
    const out = new Float64Array(3);
    const sampler = (width: number, height: number) => {
      const s = flutedSampler(
        fluted({ refraction: 1, shade: 0, jitter: 0 }),
        width,
        height,
      );
      s.prepare(timeCoords(0));
      return s;
    };
    // 1600 x 16 is 100:1: the limit is 1e6 / 100 = 1e4.
    const wide = sampler(1600, 16);
    expect(() => {
      wide.sample(2e4, 0.5, 0, 0, out);
    }).toThrow(/^u must be/);
    expect(() => {
      wide.sample(0.5, -2e4, 0, 0, out);
    }).toThrow(/^v must be/);
    expect(() => {
      wide.sample(5e3, -5e3, 0, 0, out);
    }).not.toThrow();
    // 16 x 1600 is tall: the limit stays 1e6, so the same coordinates are fine.
    const tall = sampler(16, 1600);
    expect(() => {
      tall.sample(2e4, -2e4, 0, 0, out);
    }).not.toThrow();
    expect(() => {
      tall.sample(2e6, 0.5, 0, 0, out);
    }).toThrow(/^u must be/);
  });

  it("before the first prepare samples at time 0", () => {
    const spec = fluted({ jitter: 1 });
    const fresh = flutedSampler(spec, 16, 16);
    const zero = flutedSampler(spec, 16, 16);
    zero.prepare(timeCoords(0));
    expect(at(fresh, 16, 16, 3, 3)).toEqual(at(zero, 16, 16, 3, 3));
  });
});
