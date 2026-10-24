import { describe, expect, it } from "vitest";
import { VisError } from "../../../src/core/index.js";
import { grainOffset } from "../../../src/field/cpu/grain.js";
import {
  BASE_WEIGHT,
  fluidDrift,
  fluidLab,
  fluidPositions,
  fluidSampler,
} from "../../../src/field/cpu/fluid.js";
import { rgbToOklab } from "../../../src/field/oklab.js";
import {
  MAX_FLUID_POINTS,
  resolveField,
  type ResolvedFluid,
} from "../../../src/field/spec.js";
import { timeCoords } from "../../../src/field/time.js";

function fluid(extra: Record<string, unknown> = {}): ResolvedFluid {
  const r = resolveField({
    kind: "fluid",
    grain: 0,
    points: [
      { at: [0.1, 0.1], color: "#ff0000" },
      { at: [0.9, 0.9], color: "#0000ff", spread: 0.5 },
    ],
    ...extra,
  });
  if (r.kind !== "fluid") throw new Error("unreachable");
  return r;
}

function pointsAt(
  n: number,
  extra: Record<string, unknown> = {},
): ResolvedFluid {
  return fluid({
    points: Array.from({ length: n }, (_, i) => ({
      at: [(i + 0.5) / n, 0.5],
      color: i % 2 === 0 ? "#ff8800" : "#0088ff",
    })),
    ...extra,
  });
}

/** sRGB of the grey with OKLab lightness L (a = b = 0): linear = L^3, then the sRGB curve. */
function grey(L: number): number {
  const lin = L * L * L;
  return lin <= 0.0031308
    ? lin * 12.92
    : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
}

function pixel(
  s: ReturnType<typeof fluidSampler>,
  u: number,
  v: number,
): number[] {
  const out = new Float64Array(3);
  s.sample(u, v, 0, 0, out);
  return Array.from(out);
}

describe("fluidDrift", () => {
  it("draws integer frequencies 1..3 and phases in [0, 2π) from the seed", () => {
    const d = fluidDrift(fluid());
    expect(fluidDrift(fluid())).toEqual(d);
    expect(fluidDrift(fluid({ seed: 2 }))).not.toEqual(d);
    for (let i = 0; i < 2; i++) {
      expect([1, 2, 3]).toContain(d.kx[i]);
      expect([1, 2, 3]).toContain(d.ky[i]);
      expect(d.phx[i]).toBeGreaterThanOrEqual(0);
      expect(d.phx[i]).toBeLessThan(2 * Math.PI);
      expect(d.phy[i]).toBeGreaterThanOrEqual(0);
      expect(d.phy[i]).toBeLessThan(2 * Math.PI);
    }
  });

  it.each([
    [
      1,
      [2, 1, 3, 1, 2, 3],
      [
        3.314047491791736, 6.164125024412341, 3.8505801245980553,
        4.52856271464286, 2.8605528570056267, 3.0711475743551975,
      ],
    ],
    [
      2,
      [3, 1, 3, 2, 3, 1],
      [
        1.7925679825773875, 3.3800719412665012, 3.136575992968599,
        2.2446343719056263, 4.937747921957747, 1.2663467907582604,
      ],
    ],
    [
      4294967295,
      [3, 1, 3, 2, 1, 3],
      [
        4.496578392470317, 5.93170335134531, 4.275693393780653,
        2.988107608710171, 5.47559148882116, 1.18971145413174,
      ],
    ],
    [
      0,
      [1, 1, 2, 2, 2, 2],
      [
        1.402859522364338, 0.9186151878040926, 3.8657384589520967,
        4.077695403192457, 1.5472816946532253, 0.6148203310146176,
      ],
    ],
  ])(
    "matches an independent mulberry32 draw for seed %i (kx, ky, phx, phy per point)",
    (seed, ks, phases) => {
      const d = fluidDrift(pointsAt(3, { seed }));
      // Draw order per point: kx, ky, phx, phy.
      expect(Array.from(d.kx)).toEqual([ks[0], ks[2], ks[4]]);
      expect(Array.from(d.ky)).toEqual([ks[1], ks[3], ks[5]]);
      [0, 2, 4].forEach((j, i) => {
        expect(d.phx[i]).toBeCloseTo(phases[j]!, 14);
        expect(d.phy[i]).toBeCloseTo(phases[j + 1]!, 14);
      });
    },
  );

  it("supports the maximum number of points", () => {
    const d = fluidDrift(pointsAt(MAX_FLUID_POINTS));
    expect(d.kx.length).toBe(MAX_FLUID_POINTS);
    expect(d.phy.length).toBe(MAX_FLUID_POINTS);
  });

  it("does not depend on the points or their colours, only on the seed and the count", () => {
    const a = fluidDrift(pointsAt(2, { seed: 9 }));
    const b = fluidDrift(fluid({ seed: 9 }));
    expect(a).toEqual(b);
  });
});

describe("fluidPositions", () => {
  const spec = fluid();

  it("closes exactly over a loop and moves with theta", () => {
    const a = fluidPositions(spec, 0);
    const b = fluidPositions(spec, 2 * Math.PI);
    expect(a.length).toBe(4);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i]!, 12);
    expect(fluidPositions(spec, 1)).not.toEqual(a);
  });

  it("is a Lissajous: at + drift * (sin(kx θ + φx), cos(ky θ + φy)), hand-derived", () => {
    const one = fluid({
      drift: 0.1,
      points: [{ at: [0.3, 0.6], color: "#ffffff" }],
    });
    const drift = {
      kx: Int32Array.of(1),
      ky: Int32Array.of(2),
      phx: Float64Array.of(0),
      phy: Float64Array.of(0),
    };
    // theta = π/2: x = 0.3 + 0.1 sin(π/2) = 0.4, y = 0.6 + 0.1 cos(π) = 0.5.
    const p = fluidPositions(one, Math.PI / 2, drift);
    expect(p[0]).toBeCloseTo(0.4, 14);
    expect(p[1]).toBeCloseTo(0.5, 14);
    // theta = 0 with phases π/2 and π: x = 0.3 + 0.1 * 1, y = 0.6 + 0.1 * (-1).
    const q = fluidPositions(one, 0, {
      ...drift,
      phx: Float64Array.of(Math.PI / 2),
      phy: Float64Array.of(Math.PI),
    });
    expect(q[0]).toBeCloseTo(0.4, 14);
    expect(q[1]).toBeCloseTo(0.5, 14);
  });

  it("uses the seeded drift when none is passed, and a different seed moves the points", () => {
    const d = fluidDrift(spec);
    expect(fluidPositions(spec, 0.7)).toEqual(fluidPositions(spec, 0.7, d));
    expect(fluidPositions(fluid({ seed: 5 }), 0.7)).not.toEqual(
      fluidPositions(spec, 0.7),
    );
  });

  it("stays within drift of the anchor, on both axes", () => {
    for (let k = 0; k < 50; k++) {
      const p = fluidPositions(spec, k * 0.37);
      expect(Math.abs(p[0]! - 0.1)).toBeLessThanOrEqual(0.08 + 1e-12);
      expect(Math.abs(p[1]! - 0.1)).toBeLessThanOrEqual(0.08 + 1e-12);
      expect(Math.abs(p[2]! - 0.9)).toBeLessThanOrEqual(0.08 + 1e-12);
      expect(Math.abs(p[3]! - 0.9)).toBeLessThanOrEqual(0.08 + 1e-12);
    }
  });

  it("drift 0 gives static positions at the anchors", () => {
    const still = fluid({ drift: 0 });
    for (const th of [0, 1, 123.4, -5])
      expect(Array.from(fluidPositions(still, th))).toEqual([
        0.1, 0.1, 0.9, 0.9,
      ]);
  });

  it.each([NaN, Infinity, -Infinity])("rejects theta = %s, naming it", (th) => {
    expect(() => fluidPositions(spec, th)).toThrow(VisError);
    expect(() => fluidPositions(spec, th)).toThrow(
      /theta must be a finite number/,
    );
  });

  it.each(["1", null, undefined, {}])(
    "rejects a non-number theta (%s)",
    (th) => {
      expect(() => fluidPositions(spec, th as number)).toThrow(
        /theta must be a finite number/,
      );
    },
  );
});

describe("fluidLab", () => {
  it("converts each point colour once, in order", () => {
    const lab = fluidLab(fluid());
    expect(lab.length).toBe(6);
    expect(lab[1]).toBeGreaterThan(0.1);
    expect(Array.from(lab.subarray(0, 3))).toEqual(rgbToOklab(1, 0, 0));
    expect(Array.from(lab.subarray(3, 6))).toEqual(rgbToOklab(0, 0, 1));
    expect(BASE_WEIGHT).toBe(0.02);
  });
});

describe("fluidSampler", () => {
  it("samples the dominant colour near each point and blends between", () => {
    const s = fluidSampler(fluid({ drift: 0 }), 100, 100);
    s.prepare(timeCoords(0));
    const a = pixel(s, 0.1, 0.1);
    expect(a[0]).toBeGreaterThan(0.8);
    expect(a[2]).toBeLessThan(0.3);
    const b = pixel(s, 0.9, 0.9);
    expect(b[2]).toBeGreaterThan(0.6);
    for (const c of pixel(s, 0.5, 0.5)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("one pixel by hand: white point on a black base, sampled on the point", () => {
    // w = exp(0) = 1, so lab = (labWhite + 0.02 labBlack) / 1.02 with labBlack = 0.
    // labWhite = (1, 0, 0) and a = b = 0 gives l = m = s = L^3, linear = L^3 (every
    // matrix row sums to 1), so sRGB = 1.055 (L^3)^(1/2.4) - 0.055 = 1.055 L^1.25 - 0.055.
    const spec = fluid({
      drift: 0,
      base: "#000000",
      points: [{ at: [0.25, 0.75], color: "#ffffff" }],
    });
    const s = fluidSampler(spec, 40, 40);
    s.prepare(timeCoords(0));
    const expected = 1.055 * Math.pow(1 / 1.02, 1.25) - 0.055;
    expect(expected).toBeCloseTo(0.9742, 4);
    for (const c of pixel(s, 0.25, 0.75)) expect(c).toBeCloseTo(expected, 6);
  });

  it("the Gaussian falls off as exp(-d² / (2σ²)) with σ = softness * spread, on a square picture", () => {
    // Black point on a white base: lab = (w * 0 + 0.02 * 1) / (w + 0.02) = L.
    const spec = fluid({
      drift: 0,
      softness: 0.05,
      base: "#ffffff",
      points: [{ at: [0.5, 0.5], color: "#000000", spread: 2 }],
    });
    const s = fluidSampler(spec, 10, 10);
    s.prepare(timeCoords(0));
    const sigma = 0.05 * 2;
    const d = 0.3;
    const w = Math.exp(-(d * d) / (2 * sigma * sigma));
    const L = 0.02 / (w + 0.02);
    const expected = grey(L);
    expect(expected).toBeGreaterThan(0.3);
    expect(expected).toBeLessThan(0.8);
    // Horizontal and vertical offsets of 0.3 give the same weight when the picture is square.
    for (const c of pixel(s, 0.8, 0.5)) expect(c).toBeCloseTo(expected, 6);
    for (const c of pixel(s, 0.5, 0.2)) expect(c).toBeCloseTo(expected, 6);
  });

  it("measures distance in pixels' aspect: a horizontal offset counts aspect times more", () => {
    const spec = fluid({
      drift: 0,
      softness: 0.03,
      points: [{ at: [0.5, 0.5], color: "#000000" }],
      base: "#ffffff",
    });
    const wide = fluidSampler(spec, 200, 100);
    wide.prepare(timeCoords(0));
    const h = pixel(wide, 0.55, 0.5)[0]!;
    const v = pixel(wide, 0.5, 0.55)[0]!;
    // Same 0.05 offset: horizontally it is 0.1 in height units, so it is lighter.
    expect(h).toBeGreaterThan(v);
    const sigma = 0.03;
    const w = Math.exp(-(0.1 * 0.1) / (2 * sigma * sigma));
    expect(h).toBeCloseTo(grey(0.02 / (w + 0.02)), 6);
    expect(h).toBeGreaterThan(0.5);
  });

  it("far from every point it settles to the base colour (exp underflows to 0, no NaN)", () => {
    const spec = fluid({
      drift: 0,
      softness: 0.01,
      base: "#336699",
      points: [{ at: [0, 0], color: "#ff0000", spread: 0.1 }],
    });
    const s = fluidSampler(spec, 100, 100);
    s.prepare(timeCoords(0));
    // sigma = 0.001, so d = 1 is 5e5 exponent units: the weight is exactly 0.
    const out = pixel(s, 1, 1);
    expect(out[0]).toBeCloseTo(0x33 / 255, 5);
    expect(out[1]).toBeCloseTo(0x66 / 255, 5);
    expect(out[2]).toBeCloseTo(0x99 / 255, 5);
    // The largest legal pull-away: no NaN, still the base.
    const far = pixel(s, 1e5, -1e5);
    for (let i = 0; i < 3; i++) expect(far[i]).toBe(out[i]);
  });

  it("an exponent in the denormal range adds nothing visible and is never NaN", () => {
    // sigma2 = 2 * 0.0001^2 = 2e-8 ... pick d so the exponent is about -720 (exp is denormal there).
    const spec = fluid({
      drift: 0,
      softness: 0.1,
      base: "#336699",
      points: [{ at: [0, 0.5], color: "#ff0000", spread: 0.1 }],
    });
    const s = fluidSampler(spec, 10, 10);
    s.prepare(timeCoords(0));
    // sigma = 0.01, 2 sigma^2 = 2e-4; d^2 / 2e-4 = 720 gives d = sqrt(0.144) = 0.3795.
    const d = Math.sqrt(720 * 2e-4);
    expect(Math.exp(-720)).toBeGreaterThan(0);
    expect(Math.exp(-720)).toBeLessThan(1e-300);
    const out = pixel(s, d, 0.5);
    for (const c of out) expect(Number.isNaN(c)).toBe(false);
    expect(out[0]).toBeCloseTo(0x33 / 255, 5);
  });

  it("weights are normalised: identical colours everywhere give that colour", () => {
    const spec = fluid({
      base: "#ff8800",
      points: [
        { at: [0.2, 0.2], color: "#ff8800" },
        { at: [0.7, 0.4], color: "#ff8800", spread: 3 },
        { at: [0.5, 0.9], color: "#ff8800", spread: 0.2 },
      ],
    });
    const s = fluidSampler(spec, 64, 64);
    s.prepare(timeCoords(1.3));
    for (const [u, v] of [
      [0, 0],
      [0.2, 0.2],
      [0.5, 0.5],
      [1, 1],
      [0.7, 0.4],
    ]) {
      const c = pixel(s, u!, v!);
      expect(c[0]).toBeCloseTo(1, 5);
      expect(c[1]).toBeCloseTo(0x88 / 255, 5);
      expect(c[2]).toBeCloseTo(0, 5);
    }
  });

  it("BASE_WEIGHT pulls an otherwise pure point colour slightly towards the base", () => {
    const spec = fluid({
      drift: 0,
      base: "#000000",
      points: [{ at: [0.5, 0.5], color: "#ffffff" }],
    });
    const s = fluidSampler(spec, 10, 10);
    s.prepare(timeCoords(0));
    const c = pixel(s, 0.5, 0.5)[0]!;
    expect(c).toBeLessThan(1);
    expect(c).toBeGreaterThan(0.97);
  });

  it("the default base is the mean of the point colours (in sRGB), far away", () => {
    const s = fluidSampler(fluid({ drift: 0, softness: 0.01 }), 10, 10);
    s.prepare(timeCoords(0));
    const out = pixel(s, 0.5, 0.5);
    expect(out[0]).toBeCloseTo(0.5, 4);
    expect(out[1]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(0.5, 4);
  });

  it("supports one point and the maximum number of points", () => {
    for (const n of [1, 2, 5, MAX_FLUID_POINTS]) {
      const s = fluidSampler(pointsAt(n), 32, 32);
      s.prepare(timeCoords(0.5));
      for (const c of pixel(s, 0.5, 0.5)) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("drift moves the picture and drift 0 keeps it still", () => {
    const moving = fluidSampler(fluid({ drift: 0.2 }), 32, 32);
    moving.prepare(timeCoords(0));
    const a = pixel(moving, 0.15, 0.15);
    moving.prepare(timeCoords(3));
    expect(pixel(moving, 0.15, 0.15)).not.toEqual(a);
    const still = fluidSampler(fluid({ drift: 0 }), 32, 32);
    still.prepare(timeCoords(0));
    const b = pixel(still, 0.15, 0.15);
    still.prepare(timeCoords(3));
    expect(pixel(still, 0.15, 0.15)).toEqual(b);
  });

  it("is seamless: t = 0, T and 2T give the same picture, bit for bit, grain included", () => {
    const s = fluidSampler(fluid({ grain: 0.8, drift: 0.3, seed: 41 }), 16, 9);
    const grid = (t: number): number[] => {
      s.prepare(timeCoords(t, 4));
      const out: number[] = [];
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < 16; x++) {
          const o = new Float64Array(3);
          s.sample((x + 0.5) / 16, (y + 0.5) / 9, x, y, o);
          out.push(...o);
        }
      return out;
    };
    const t0 = grid(0);
    expect(grid(4)).toEqual(t0);
    expect(grid(8)).toEqual(t0);
    expect(grid(2)).not.toEqual(t0);
  });

  it("without a loop the drift keeps going (no repetition after a short time)", () => {
    const s = fluidSampler(fluid({ drift: 0.2 }), 8, 8);
    s.prepare(timeCoords(0));
    const a = pixel(s, 0.2, 0.2);
    s.prepare(timeCoords((2 * Math.PI) / 0.4));
    // theta = 2π again, but the grain-free picture closes only when the paths do:
    // every kx, ky is an integer, so after 2π the points are back.
    for (let i = 0; i < 3; i++)
      expect(pixel(s, 0.2, 0.2)[i]).toBeCloseTo(a[i]!, 9);
    s.prepare(timeCoords(1));
    expect(pixel(s, 0.2, 0.2)).not.toEqual(a);
  });

  it("is pure: the same prepared time and arguments give the same colour, in any order", () => {
    const s = fluidSampler(fluid(), 20, 20);
    s.prepare(timeCoords(1.7));
    const a = pixel(s, 0.3, 0.6);
    pixel(s, 0.9, 0.1);
    expect(pixel(s, 0.3, 0.6)).toEqual(a);
  });

  it("samples at time 0 before the first prepare, and prepare's TimeCoords is copied", () => {
    const spec = fluid({ drift: 0.2 });
    const fresh = fluidSampler(spec, 8, 8);
    const prepared = fluidSampler(spec, 8, 8);
    prepared.prepare(timeCoords(0));
    expect(pixel(fresh, 0.2, 0.3)).toEqual(pixel(prepared, 0.2, 0.3));
    const tc = timeCoords(2);
    prepared.prepare(tc);
    const at2 = pixel(prepared, 0.2, 0.3);
    tc.theta = 99;
    expect(pixel(prepared, 0.2, 0.3)).toEqual(at2);
  });

  it("does not see later changes to the spec", () => {
    const spec = fluid({ drift: 0 });
    const s = fluidSampler(spec, 8, 8);
    s.prepare(timeCoords(0));
    const a = pixel(s, 0.1, 0.1);
    (spec.points[0] as { at: [number, number] }).at = [0.9, 0.1];
    (spec.base as { r: number }).r = 0;
    spec.softness = 2;
    spec.drift = 0.5;
    s.prepare(timeCoords(1));
    s.prepare(timeCoords(0));
    expect(pixel(s, 0.1, 0.1)).toEqual(a);
  });

  it("grain is the same offset on all channels and follows animatedGrain", () => {
    const base = fluidSampler(fluid({ drift: 0 }), 8, 8);
    const grained = fluidSampler(fluid({ drift: 0, grain: 1, seed: 77 }), 8, 8);
    const still = fluidSampler(
      fluid({ drift: 0, grain: 1, seed: 77, animatedGrain: false }),
      8,
      8,
    );
    const o0 = new Float64Array(3);
    const o1 = new Float64Array(3);
    for (const [t, frame] of [
      [0, 0],
      [1, 24],
    ] as const) {
      const tc = timeCoords(t);
      base.prepare(tc);
      grained.prepare(tc);
      still.prepare(tc);
      base.sample(0.5, 0.5, 4, 3, o0);
      grained.sample(0.5, 0.5, 4, 3, o1);
      const g = grainOffset(4, 3, frame, 77, 1);
      for (let i = 0; i < 3; i++) expect(o1[i]! - o0[i]!).toBeCloseTo(g, 12);
      still.sample(0.5, 0.5, 4, 3, o1);
      const gs = grainOffset(4, 3, 0, 77, 1);
      for (let i = 0; i < 3; i++) expect(o1[i]! - o0[i]!).toBeCloseTo(gs, 12);
    }
  });

  it.each([
    ["width", 0, 8],
    ["width", NaN, 8],
    ["width", Infinity, 8],
    ["width", -1, 8],
    ["height", 0, 8],
    ["height", NaN, 8],
    ["height", -3, 8],
  ])("rejects %s = %s", (name, bad) => {
    const [w, h] = name === "width" ? [bad, 8] : [8, bad];
    expect(() => fluidSampler(fluid(), w, h)).toThrow(
      new RegExp(`${name} must be a positive finite number`),
    );
  });

  it("rejects a non-number size", () => {
    expect(() => fluidSampler(fluid(), "8" as unknown as number, 8)).toThrow(
      VisError,
    );
  });

  it.each([NaN, Infinity, -Infinity, 1e300, -1e12])(
    "rejects u = v = %s with a VisError naming it",
    (bad) => {
      const s = fluidSampler(fluid(), 16, 16);
      s.prepare(timeCoords(0));
      const out = new Float64Array(3);
      expect(() => {
        s.sample(bad, 0.5, 0, 0, out);
      }).toThrow(/u must be a finite number/);
      expect(() => {
        s.sample(0.5, bad, 0, 0, out);
      }).toThrow(/v must be a finite number/);
    },
  );

  it("accepts a coordinate far outside the picture (the limit is about 1e6 / aspect)", () => {
    const s = fluidSampler(fluid({ drift: 0, base: "#336699" }), 16, 16);
    s.prepare(timeCoords(0));
    expect(pixel(s, 5e5, -5e5)[2]).toBeCloseTo(0x99 / 255, 5);
    const wide = fluidSampler(fluid({ drift: 0 }), 1600, 16);
    const out = new Float64Array(3);
    expect(() => {
      wide.sample(2e4, 0.5, 0, 0, out);
    }).toThrow(/u must be/);
    expect(() => {
      wide.sample(5e3, 0.5, 0, 0, out);
    }).not.toThrow();
  });

  it("a tiny softness and spread at the legal minimum stays finite everywhere", () => {
    const spec = fluid({
      softness: 0.01,
      points: [{ at: [0.5, 0.5], color: "#ff0000", spread: 0.1 }],
    });
    const s = fluidSampler(spec, 4000, 10);
    s.prepare(timeCoords(0));
    for (const [u, v] of [
      [0.5, 0.5],
      [0, 0],
      [1, 1],
      [-2, 3],
    ])
      for (const c of pixel(s, u!, v!)) expect(Number.isFinite(c)).toBe(true);
  });
});
