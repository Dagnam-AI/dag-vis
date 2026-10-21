import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { createRng } from "../../src/core/rng.js";
import { ribbonCurves } from "../../src/scene/ribbon-curves.js";
import type { RibbonOptions } from "../../src/scene/ribbon-curves.js";

type Curves = ReturnType<typeof ribbonCurves>;

/** Point j of line i, with the indexing the type system cannot prove. */
function at(curves: Curves, i: number, j: number): [number, number] {
  const p = curves[i]?.[j];
  if (p === undefined) throw new Error(`no point ${i}/${j}`);
  return p;
}

const flat = (curves: Curves): number[] =>
  curves.flatMap((c) => c.flatMap(([x, y]) => [x, y]));

/** A spine-only ribbon: no thickness, no wave. */
const SPINE = { thickness: 0, amplitude: 0 } as const;

describe("ribbonCurves", () => {
  it("returns `lines` curves of `samples` points each, inside a sane bounding box", () => {
    const curves = ribbonCurves({
      width: 400,
      height: 200,
      lines: 12,
      samples: 16,
    });
    expect(curves).toHaveLength(12);
    for (const c of curves) {
      expect(c).toHaveLength(16);
      for (const [x, y] of c) {
        expect(x).toBeGreaterThan(-400);
        expect(x).toBeLessThan(800);
        expect(y).toBeGreaterThan(-200);
        expect(y).toBeLessThan(400);
      }
    }
  });

  it("defaults to 120 lines x 96 samples on the diagonal", () => {
    const curves = ribbonCurves({ width: 300, height: 100 });
    expect(curves).toHaveLength(120);
    expect(curves[0]).toHaveLength(96);
    // Diagonal: starts bottom-left, ends top-right (spine-only is exact).
    const spine = ribbonCurves({ width: 300, height: 100, ...SPINE });
    expect(at(spine, 60, 0)).toEqual([0, 100]);
    expect(at(spine, 60, 95)).toEqual([300, 0]);
  });

  it("puts the diagonal spine's endpoints exactly at the corners and the horizontal's at mid height", () => {
    const d = ribbonCurves({
      width: 400,
      height: 200,
      lines: 3,
      samples: 7,
      ...SPINE,
    });
    for (let i = 0; i < 3; i++) {
      expect(at(d, i, 0)).toEqual([0, 200]);
      expect(at(d, i, 6)).toEqual([400, 0]);
      // Evenly spaced along the straight spine.
      expect(at(d, i, 3)[0]).toBeCloseTo(200, 9);
      expect(at(d, i, 3)[1]).toBeCloseTo(100, 9);
    }
    const h = ribbonCurves({
      width: 400,
      height: 200,
      path: "horizontal",
      lines: 3,
      samples: 5,
      ...SPINE,
    });
    for (const c of h)
      c.forEach(([x, y], j) => {
        expect(x).toBeCloseTo(100 * j, 9);
        expect(y).toBeCloseTo(100, 9);
      });
  });

  it("walks a custom spine by arc length, through its corners", () => {
    // Two equal legs: the sample at s = .5 sits exactly on the corner.
    const l = ribbonCurves({
      width: 100,
      height: 100,
      path: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      lines: 2,
      samples: 5,
      ...SPINE,
    });
    const expected = [
      [0, 0],
      [50, 0],
      [100, 0],
      [100, 50],
      [100, 100],
    ];
    for (const c of l)
      c.forEach(([x, y], j) => {
        expect(x).toBeCloseTo(expected[j]?.[0] ?? NaN, 9);
        expect(y).toBeCloseTo(expected[j]?.[1] ?? NaN, 9);
      });
    expect(at(l, 0, 0)).toEqual([0, 0]);
    expect(at(l, 0, 4)).toEqual([100, 100]);
    // Unequal legs (100 px and 900 px): speed is uniform per px, not per leg.
    const u = ribbonCurves({
      width: 1000,
      height: 100,
      path: [
        [0, 0],
        [0.1, 0],
        [1, 0],
      ],
      lines: 2,
      samples: 11,
      ...SPINE,
    });
    for (const c of u)
      c.forEach(([x, y], j) => {
        expect(x).toBeCloseTo(100 * j, 9);
        expect(y).toBeCloseTo(0, 9);
      });
  });

  it("offsets the family along the spine's normal and collapses it where cos(pi*twist*s) = 0", () => {
    // Horizontal spine: the unit normal is (0, 1), so the offset is a pure y shift.
    // twist 1, no wave, no jitter, phase 0: offset = u * thickness * m * cos(pi * s).
    const w = 400;
    const h = 200;
    const lines = 5;
    const c = ribbonCurves({
      width: w,
      height: h,
      path: "horizontal",
      lines,
      samples: 5,
      twist: 1,
      amplitude: 0,
      thickness: 0.5,
      jitter: 0,
    });
    for (let i = 0; i < lines; i++) {
      const u = i / (lines - 1) - 0.5;
      // s = 0 and s = 1: the full spread, mirrored.
      expect(at(c, i, 0)[1]).toBeCloseTo(h / 2 + u * 0.5 * h, 9);
      expect(at(c, i, 4)[1]).toBeCloseTo(h / 2 - u * 0.5 * h, 9);
      // s = 0.5: every line crosses the spine.
      expect(at(c, i, 2)[1]).toBeCloseTo(h / 2, 9);
      // s = 0.25 and 0.75: cos = +-sqrt(1/2).
      expect(at(c, i, 1)[1]).toBeCloseTo(h / 2 + u * 0.5 * h * Math.SQRT1_2, 9);
      expect(at(c, i, 3)[1]).toBeCloseTo(h / 2 - u * 0.5 * h * Math.SQRT1_2, 9);
    }
  });

  it("adds the wave amplitude * m * sin(2*pi*frequency*s + phase + u*pi) along the normal", () => {
    const w = 300;
    const h = 120;
    const lines = 4;
    const samples = 9;
    const phase = 0.7;
    const c = ribbonCurves(
      {
        width: w,
        height: h,
        path: "horizontal",
        lines,
        samples,
        thickness: 0,
        amplitude: 0.2,
        frequency: 1.5,
      },
      phase,
    );
    for (let i = 0; i < lines; i++) {
      const u = i / (lines - 1) - 0.5;
      for (let j = 0; j < samples; j++) {
        const s = j / (samples - 1);
        const [x, y] = at(c, i, j);
        expect(x).toBeCloseTo(w * s, 9);
        expect(y).toBeCloseTo(
          h / 2 +
            0.2 * h * Math.sin(2 * Math.PI * 1.5 * s + phase + u * Math.PI),
          9,
        );
      }
    }
  });

  it("offsets the diagonal along its own unit normal", () => {
    // Spine (0, h) -> (w, 0): direction (w, -h), normal (h, w) / |(w, h)|.
    const w = 300;
    const h = 400;
    const c = ribbonCurves({
      width: w,
      height: h,
      lines: 3,
      samples: 2,
      twist: 0,
      amplitude: 0,
      thickness: 0.4,
      jitter: 0,
    });
    const len = Math.hypot(w, h);
    // u = 0.5, twist 0, phase 0: offset = 0.5 * 0.4 * min(w, h) at both ends.
    const d = 0.5 * 0.4 * Math.min(w, h);
    const top = at(c, 2, 0);
    expect(top[0]).toBeCloseTo((d * h) / len, 9);
    expect(top[1]).toBeCloseTo(h + (d * w) / len, 9);
    const bottom = at(c, 0, 1);
    expect(bottom[0]).toBeCloseTo(w - (d * h) / len, 9);
    expect(bottom[1]).toBeCloseTo(-(d * w) / len, 9);
  });

  it("is deterministic per seed and moves with phase", () => {
    const o = { width: 100, height: 100, lines: 4, samples: 8, seed: 2 };
    const a = ribbonCurves(o);
    expect(a).toEqual(ribbonCurves(o));
    expect(a).not.toEqual(ribbonCurves({ ...o, seed: 3 }));
    expect(a).not.toEqual(ribbonCurves(o, 0.5));
    // Every point differs bit for bit across two calls' worth of options too.
    expect(ribbonCurves(o, 0.25)).toEqual(ribbonCurves({ ...o }, 0.25));
  });

  it("ignores the seed when there is no jitter", () => {
    const o = { width: 100, height: 100, lines: 4, samples: 8, jitter: 0 };
    expect(ribbonCurves({ ...o, seed: 1 })).toEqual(
      ribbonCurves({ ...o, seed: 99 }),
    );
  });

  it("keeps each line's jitter fixed while phase animates (the same ribbon moves)", () => {
    // Horizontal, no wave, no twist: line i sits at y = h/2 + u*T*m*cos(phase + phi_i).
    // Two reference phases pin phi_i without knowing the rng; any other phase must then
    // follow cos(p + phi) = cos(p)cos(phi) - sin(p)sin(phi).
    const o: RibbonOptions = {
      width: 300,
      height: 200,
      path: "horizontal",
      lines: 7,
      samples: 2,
      twist: 0,
      amplitude: 0,
      thickness: 0.5,
      jitter: 1,
      seed: 5,
    };
    const spread = (p: number): number[] =>
      ribbonCurves(o, p).map((c) => c[0]?.[1] ?? NaN);
    const at0 = spread(0);
    const atQuarter = spread(Math.PI / 2);
    for (const p of [0.3, 1.9, -2.4, 7, 123.456]) {
      const got = spread(p);
      got.forEach((y, i) => {
        const u = i / 6 - 0.5;
        const k = u * 0.5 * 200;
        const c0 = ((at0[i] ?? NaN) - 100) / (k || 1);
        const cq = ((atQuarter[i] ?? NaN) - 100) / (k || 1);
        // cq = -sin(phi); cos(p + phi) = cos(p) cos(phi) + sin(p) * cq
        const expected =
          u === 0 ? 100 : 100 + k * (Math.cos(p) * c0 + Math.sin(p) * cq);
        expect(y).toBeCloseTo(expected, 9);
      });
    }
    // And the jitter really is seeded: the lines are not all in step.
    const phis = at0.map((y, i) =>
      Math.acos((y - 100) / ((i / 6 - 0.5) * 100 || 1)),
    );
    expect(
      new Set(phis.filter(Number.isFinite).map((v) => v.toFixed(6))).size,
    ).toBeGreaterThan(1);
    // The jitter of line i is the i-th draw: phi_i = jitter * range(-1, 1) * pi.
    const rng = createRng(5);
    const first = rng.range(-1, 1) * Math.PI;
    expect(at(ribbonCurves(o, 0), 0, 0)[1]).toBeCloseTo(
      100 + -0.5 * 0.5 * 200 * Math.cos(first),
      9,
    );
  });

  it("is periodic in phase with period 2*pi, for any finite phase", () => {
    const o = { width: 200, height: 100, lines: 5, samples: 12, seed: 3 };
    for (const p of [0, 0.4, -1.1, 50]) {
      const a = flat(ribbonCurves(o, p));
      const b = flat(ribbonCurves(o, p + 2 * Math.PI * 1000));
      a.forEach((v, k) => {
        expect(b[k]).toBeCloseTo(v, 6);
      });
    }
    // Reduced exactly, so a phase that has run for ages keeps the per-line jitter
    // (added raw, 1e15 + phi would round phi away: its ulp is 0.125).
    for (const p of [1e15, -1e12 + 0.5, 12345.678])
      expect(ribbonCurves(o, p)).toEqual(ribbonCurves(o, p % (2 * Math.PI)));
    const huge = flat(ribbonCurves(o, Number.MAX_VALUE));
    expect(huge.every(Number.isFinite)).toBe(true);
  });

  it("handles a single line (u would divide by zero)", () => {
    const c = ribbonCurves({
      width: 200,
      height: 100,
      path: "horizontal",
      lines: 1,
      samples: 5,
      thickness: 1,
      twist: 3,
      amplitude: 0.1,
      frequency: 1,
    });
    expect(c).toHaveLength(1);
    expect(flat(c).every(Number.isFinite)).toBe(true);
    // u = 0: the thickness term vanishes, only the wave remains.
    c[0]?.forEach(([x, y], j) => {
      const s = j / 4;
      expect(x).toBeCloseTo(200 * s, 9);
      expect(y).toBeCloseTo(50 + 0.1 * 100 * Math.sin(2 * Math.PI * s), 9);
    });
  });

  it("accepts the largest sizes and counts", () => {
    const c = ribbonCurves({
      width: 16384,
      height: 16384,
      lines: 400,
      samples: 1000,
    });
    expect(c).toHaveLength(400);
    expect(c[399]).toHaveLength(1000);
  });

  it("does not mutate its options or a frozen custom path", () => {
    const path = Object.freeze([
      Object.freeze([0, 0] as const),
      Object.freeze([1, 1] as const),
    ]);
    const o = Object.freeze({ width: 50, height: 50, path, lines: 2 });
    expect(() => ribbonCurves(o)).not.toThrow();
  });

  describe("degenerate spines", () => {
    const base = { width: 100, height: 100, lines: 3, samples: 6 };

    it("skips zero-length segments instead of dividing by them", () => {
      const clean = ribbonCurves({
        ...base,
        path: [
          [0, 0],
          [1, 1],
        ],
      });
      const dupes = ribbonCurves({
        ...base,
        path: [
          [0, 0],
          [0, 0],
          [0, 0],
          [1, 1],
          [1, 1],
        ],
      });
      expect(flat(dupes).every(Number.isFinite)).toBe(true);
      expect(dupes).toEqual(clean);
    });

    it("throws when every point coincides", () => {
      expect(() =>
        ribbonCurves({
          ...base,
          path: [
            [0.5, 0.5],
            [0.5, 0.5],
            [0.5, 0.5],
          ],
        }),
      ).toThrow(/path must span a distance/);
    });

    it("keeps a spine that doubles back finite", () => {
      const c = ribbonCurves({
        ...base,
        path: [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
      });
      expect(flat(c).every(Number.isFinite)).toBe(true);
    });

    it("keeps a spine with a vanishing segment finite", () => {
      const c = ribbonCurves({
        ...base,
        samples: 50,
        path: [
          [0, 0],
          [1, 1],
          [1 + Number.EPSILON, 1],
          [1e-300, 1e-300],
          [5e-324, 0],
        ],
      });
      expect(flat(c).every(Number.isFinite)).toBe(true);
    });
  });

  describe("finite for every allowed input combination", () => {
    const sizes: [number, number][] = [
      [1, 1],
      [16384, 16384],
      [16384, 1],
      [1, 16384],
      [300, 170],
    ];
    const paths: NonNullable<RibbonOptions["path"]>[] = [
      "diagonal",
      "horizontal",
      [
        [-1000, 1000],
        [1000, -1000],
      ],
      [
        [0, 0],
        [0.3, 0.9],
        [0.3, 0.9],
        [0.9, 0.1],
        [0, 0],
      ],
    ];
    const twists = [-1000, -1.5, 0, 2, 1000];
    const amps = [-100, 0, 0.12, 100];
    const freqs = [-1000, 0, 1.5, 1000];
    const thicks = [0, 0.35, 100];
    const jitters = [0, 0.15, 1];
    const phases = [0, -7.5, 1e6, -1e300, Number.MAX_VALUE];
    const counts: [number, number][] = [
      [1, 2],
      [2, 2],
      [3, 17],
      [400, 5],
    ];

    it("holds over each parameter's extremes, one at a time", () => {
      const check = (o: RibbonOptions, phase: number): void => {
        const curves = ribbonCurves(o, phase);
        const pts = flat(curves);
        expect(pts.length).toBe((o.lines ?? 120) * (o.samples ?? 96) * 2);
        expect(
          pts.every((v) => typeof v === "number" && Number.isFinite(v)),
        ).toBe(true);
      };
      const d = { width: 300, height: 170, lines: 6, samples: 9 };
      sizes.forEach(([width, height]) => {
        check({ ...d, width, height }, 0);
      });
      paths.forEach((path) => {
        check({ ...d, path }, 0);
      });
      twists.forEach((twist) => {
        check({ ...d, twist }, 0);
      });
      amps.forEach((amplitude) => {
        check({ ...d, amplitude }, 0);
      });
      freqs.forEach((frequency) => {
        check({ ...d, frequency }, 0);
      });
      thicks.forEach((thickness) => {
        check({ ...d, thickness }, 0);
      });
      jitters.forEach((jitter) => {
        check({ ...d, jitter }, 0);
      });
      phases.forEach((phase) => {
        check(d, phase);
      });
      counts.forEach(([lines, samples]) => {
        check({ ...d, lines, samples }, 0);
      });
    });

    it("holds over a seeded random sample of combinations, extremes included", () => {
      const rng = createRng(2026);
      for (let n = 0; n < 400; n++) {
        const [width, height] = rng.pick(sizes);
        const [lines, samples] = rng.pick(counts);
        const o: RibbonOptions = {
          width,
          height,
          path: rng.pick(paths),
          lines,
          samples,
          twist: rng.pick(twists),
          amplitude: rng.pick(amps),
          frequency: rng.pick(freqs),
          thickness: rng.pick(thicks),
          jitter: rng.pick(jitters),
          seed: rng.int(-1000, 1000),
        };
        const pts = flat(ribbonCurves(o, rng.pick(phases)));
        expect(pts.length).toBe(lines * samples * 2);
        expect(pts.every((v) => Number.isFinite(v))).toBe(true);
      }
    });
  });

  describe("validation", () => {
    const ok = { width: 10, height: 10 };
    it.each<[string, unknown, number | undefined, RegExp]>([
      [
        "width 0",
        { ...ok, width: 0 },
        undefined,
        /width must be a number in 1\.\.16384, got 0/,
      ],
      ["width NaN", { ...ok, width: NaN }, undefined, /width .*got NaN/],
      ["width string", { ...ok, width: "10" }, undefined, /width .*got "10"/],
      [
        "width too large",
        { ...ok, width: 16385 },
        undefined,
        /width .*got 16385/,
      ],
      ["height null", { ...ok, height: null }, undefined, /height .*got null/],
      ["height -1", { ...ok, height: -1 }, undefined, /height .*got -1/],
      [
        "height Infinity",
        { ...ok, height: Infinity },
        undefined,
        /height .*got Infinity/,
      ],
      [
        "lines 401",
        { ...ok, lines: 401 },
        undefined,
        /lines must be an integer in 1\.\.400, got 401/,
      ],
      ["lines 0", { ...ok, lines: 0 }, undefined, /lines .*got 0/],
      ["lines 2.5", { ...ok, lines: 2.5 }, undefined, /lines .*got 2\.5/],
      ["lines null", { ...ok, lines: null }, undefined, /lines .*got null/],
      [
        "samples 1",
        { ...ok, samples: 1 },
        undefined,
        /samples must be an integer in 2\.\.1000, got 1/,
      ],
      [
        "samples 1001",
        { ...ok, samples: 1001 },
        undefined,
        /samples .*got 1001/,
      ],
      ["samples NaN", { ...ok, samples: NaN }, undefined, /samples .*got NaN/],
      [
        "twist Infinity",
        { ...ok, twist: Infinity },
        undefined,
        /twist .*got Infinity/,
      ],
      ["twist 1001", { ...ok, twist: 1001 }, undefined, /twist .*got 1001/],
      [
        "amplitude NaN",
        { ...ok, amplitude: NaN },
        undefined,
        /amplitude .*got NaN/,
      ],
      [
        "amplitude 101",
        { ...ok, amplitude: 101 },
        undefined,
        /amplitude .*got 101/,
      ],
      [
        "frequency -1001",
        { ...ok, frequency: -1001 },
        undefined,
        /frequency .*got -1001/,
      ],
      [
        "thickness -1",
        { ...ok, thickness: -1 },
        undefined,
        /thickness .*got -1/,
      ],
      [
        "thickness null",
        { ...ok, thickness: null },
        undefined,
        /thickness .*got null/,
      ],
      ["jitter 2", { ...ok, jitter: 2 }, undefined, /jitter .*got 2/],
      ["jitter NaN", { ...ok, jitter: NaN }, undefined, /jitter .*got NaN/],
      [
        "seed 1.5",
        { ...ok, seed: 1.5 },
        undefined,
        /seed must be a safe integer, got 1\.5/,
      ],
      ["seed NaN", { ...ok, seed: NaN }, undefined, /seed .*got NaN/],
      ["seed null", { ...ok, seed: null }, undefined, /seed .*got null/],
      ["phase NaN", ok, NaN, /phase must be a finite number, got NaN/],
      ["phase Infinity", ok, Infinity, /phase .*got Infinity/],
      ["phase null", ok, null as never, /phase .*got null/],
      [
        "path unknown",
        { ...ok, path: "zigzag" },
        undefined,
        /path must be .*got "zigzag"/,
      ],
      [
        "path null",
        { ...ok, path: null },
        undefined,
        /path must be .*got null/,
      ],
      ["path number", { ...ok, path: 3 }, undefined, /path must be .*got 3/],
      [
        "path one point",
        { ...ok, path: [[0, 0]] },
        undefined,
        /path must be .*2\.\.1000/,
      ],
      ["path empty", { ...ok, path: [] }, undefined, /path must be/],
      [
        "path too long",
        { ...ok, path: Array.from({ length: 1001 }, () => [0, 0]) },
        undefined,
        /path must be/,
      ],
      [
        "path point not a pair",
        { ...ok, path: [[0, 0], [1]] },
        undefined,
        /path\[1\] must be \[x, y\]/,
      ],
      [
        "path point a number",
        { ...ok, path: [[0, 0], 5] },
        undefined,
        /path\[1\] must be \[x, y\], got 5/,
      ],
      [
        "path x NaN",
        {
          ...ok,
          path: [
            [0, 0],
            [NaN, 1],
          ],
        },
        undefined,
        /path\[1\]\[0\] .*got NaN/,
      ],
      [
        "path y string",
        {
          ...ok,
          path: [
            [0, 0],
            [1, "1"],
          ],
        },
        undefined,
        /path\[1\]\[1\] .*got "1"/,
      ],
      [
        "path x huge",
        {
          ...ok,
          path: [
            [0, 0],
            [1e300, 1],
          ],
        },
        undefined,
        /path\[1\]\[0\] .*got 1e\+300/,
      ],
      ["options null", null, undefined, /options must be an object, got null/],
      [
        "options a string",
        "x",
        undefined,
        /options must be an object, got "x"/,
      ],
    ])(
      "%s throws a VisError naming the parameter and value",
      (_n, opts, phase, re) => {
        expect(() => ribbonCurves(opts as RibbonOptions, phase)).toThrow(
          VisError,
        );
        expect(() => ribbonCurves(opts as RibbonOptions, phase)).toThrow(re);
      },
    );

    it("uses the default only for undefined", () => {
      expect(
        ribbonCurves({
          ...ok,
          lines: undefined,
          samples: undefined,
          twist: undefined,
          amplitude: undefined,
          frequency: undefined,
          thickness: undefined,
          jitter: undefined,
          seed: undefined,
          path: undefined,
        } as unknown as RibbonOptions),
      ).toEqual(ribbonCurves(ok));
      expect(ribbonCurves(ok, undefined)).toEqual(ribbonCurves(ok));
    });

    it("ignores options it does not know (the animated renderer passes its own)", () => {
      expect(
        ribbonCurves({
          ...ok,
          colors: ["#fff"],
          extra: 1,
        } as unknown as RibbonOptions),
      ).toEqual(ribbonCurves(ok));
    });
  });
});
