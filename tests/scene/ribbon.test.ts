import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { ribbonCurves } from "../../src/scene/ribbon-curves.js";
import { ribbon } from "../../src/scene/ribbon.js";
import type { RibbonSvgOptions } from "../../src/scene/ribbon.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const small = { width: 240, height: 120, lines: 12, samples: 16 } as const;

const paths = (svg: string): string[] =>
  [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1] ?? "");

/** The numbers of a path's data, as [x, y] pairs. */
const points = (d: string): [number, number][] =>
  [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);

describe("ribbon", () => {
  it("strokes every curve with a spine-aligned gradient on a transparent background", () => {
    const svg = ribbon(small);
    expect(paths(svg)).toHaveLength(12);
    expect(svg).toContain(
      '<linearGradient id="vis1-ribbon" gradientUnits="userSpaceOnUse" x1="0" y1="120" x2="240" y2="0">',
    );
    expect(svg).toContain('stroke="url(#vis1-ribbon)"');
    expect(svg).not.toContain("<rect");
  });

  it("draws the points ribbonCurves returns, formatted through fmt", () => {
    const o = { ...small, seed: 4 };
    const curves = ribbonCurves(o);
    const drawn = paths(ribbon(o));
    expect(drawn).toHaveLength(curves.length);
    drawn.forEach((d, i) => {
      expect(d.startsWith("M")).toBe(true);
      const got = points(d);
      const want = curves[i] ?? [];
      expect(got).toHaveLength(want.length);
      got.forEach(([x, y], j) => {
        expect(x).toBeCloseTo(want[j]?.[0] ?? NaN, 3);
        expect(y).toBeCloseTo(want[j]?.[1] ?? NaN, 3);
      });
      // At most three decimals, never exponent notation.
      expect(d).not.toMatch(/\.\d{4}|e[+-]?\d/);
    });
  });

  it("phase advances the curve family: 0 is the default, 2*pi returns, and it draws what ribbonCurves returns", () => {
    expect(ribbon(small, 0)).toBe(ribbon(small));
    expect(ribbon(small, 1)).not.toBe(ribbon(small));
    expect(paths(ribbon(small, 2 * Math.PI))).toEqual(paths(ribbon(small)));
    const want = ribbonCurves(small, 1.25);
    paths(ribbon(small, 1.25)).forEach((d, i) => {
      points(d).forEach(([x, y], j) => {
        expect(x).toBeCloseTo(want[i]?.[j]?.[0] ?? NaN, 3);
        expect(y).toBeCloseTo(want[i]?.[j]?.[1] ?? NaN, 3);
      });
    });
  });

  it("rejects a phase that is not a finite number, naming it", () => {
    for (const bad of [NaN, Infinity, "1" as never, null as never])
      expect(() => ribbon(small, bad)).toThrow(/phase/);
  });

  it("puts the stroke styling once on the group, in output px, with no vector-effect", () => {
    const svg = ribbon({ ...small, strokeWidth: 2.5, opacity: 0.4 });
    expect(svg).toContain(
      '<g opacity="0.4" fill="none" stroke="url(#vis1-ribbon)" stroke-width="2.5" stroke-linejoin="round">',
    );
    expect(svg).not.toContain("vector-effect");
    expect(svg).not.toContain("transform");
    // Paths carry only their data.
    for (const m of svg.matchAll(/<path [^>]*>/g))
      expect(m[0]).toMatch(/^<path d="[^"]*"\/>$/);
  });

  it("adds a solid or gradient background, mesh cross-lines, and custom stroke/opacity", () => {
    const solid = ribbon({
      ...small,
      background: "#0a0a0a",
      strokeWidth: 2,
      opacity: 0.5,
    });
    expect(solid).toContain('<rect width="240" height="120" fill="#0a0a0a"/>');
    expect(solid).toContain('stroke-width="2"');
    expect(solid).toContain('opacity="0.5"');
    const grad = ribbon({
      ...small,
      background: { kind: "linear", stops: ["#000", "#333"] },
    });
    expect(grad).toContain('fill="url(#vis1-bg-g)"');
    const mesh = ribbon({ ...small, mesh: true, meshLines: 5 });
    expect(paths(mesh)).toHaveLength(17);
  });

  it("keeps a translucent background's alpha as fill-opacity", () => {
    const svg = ribbon({ ...small, background: "#ff000080" });
    expect(svg).toMatch(
      /<rect width="240" height="120" fill="#ff0000" fill-opacity="0\.50\d*"\/>/,
    );
  });

  it("draws each mesh cross-line through the same sample of every curve", () => {
    const o = { ...small, mesh: true, meshLines: 4, seed: 7 };
    const all = paths(ribbon(o));
    const curves = ribbonCurves(o);
    expect(all).toHaveLength(12 + 4);
    // Cross-lines at samples 0, 5, 10, 15 (round(k / 3 * 15)).
    [0, 5, 10, 15].forEach((j, k) => {
      const got = points(all[12 + k] ?? "");
      expect(got).toHaveLength(12);
      got.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(curves[i]?.[j]?.[0] ?? NaN, 3);
        expect(y).toBeCloseTo(curves[i]?.[j]?.[1] ?? NaN, 3);
      });
    });
    // One cross-line is the first sample, and the default never exceeds `samples`.
    expect(paths(ribbon({ ...o, meshLines: 1 }))).toHaveLength(13);
    expect(paths(ribbon({ ...small, samples: 5, mesh: true }))).toHaveLength(
      12 + 5,
    );
  });

  it("runs the stroke gradient along horizontal and custom spines", () => {
    expect(ribbon({ ...small, path: "horizontal" })).toContain(
      'x1="0" y1="60" x2="240" y2="60"',
    );
    expect(
      ribbon({
        ...small,
        path: [
          [0, 0],
          [0.5, 1],
          [1, 1],
        ],
      }),
    ).toContain('x1="0" y1="0" x2="240" y2="120"');
  });

  it("runs the gradient to the farthest point of a closed spine", () => {
    const svg = ribbon({
      ...small,
      path: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    });
    expect(svg).toContain('x1="0" y1="0" x2="240" y2="120"');
  });

  it("skips repeated spine points when it aims the gradient", () => {
    const svg = ribbon({
      ...small,
      path: [
        [0, 0],
        [0, 0],
        [1, 1],
        [1, 1],
      ],
    });
    expect(svg).toContain('x1="0" y1="0" x2="240" y2="120"');
  });

  it("colours the stroke gradient evenly, keeping each colour's alpha", () => {
    const svg = ribbon({
      ...small,
      colors: ["#ff0000", "#00ff0080", "#0000ff"],
    });
    expect(svg).toContain(
      '<stop offset="0" stop-color="#ff0000"/><stop offset="0.5" stop-color="#00ff00" stop-opacity="0.502"/><stop offset="1" stop-color="#0000ff"/>',
    );
  });

  it("namespaces its ids by idPrefix and seed", () => {
    expect(ribbon({ ...small, seed: 9 })).toContain('id="vis9-ribbon"');
    const svg = ribbon({
      ...small,
      idPrefix: "r_1-x",
      background: { kind: "linear", stops: ["#000", "#333"] },
    });
    expect(svg).toContain('id="r_1-x-ribbon"');
    expect(svg).toContain("url(#r_1-x-bg-g)");
    expect(svg).not.toContain("vis1");
    const longest = "a".repeat(60);
    expect(ribbon({ ...small, idPrefix: longest })).toContain(
      `id="${longest}-ribbon"`,
    );
  });

  describe("pixels", () => {
    const bold: RibbonSvgOptions = {
      width: 200,
      height: 100,
      lines: 3,
      samples: 32,
      thickness: 0,
      amplitude: 0,
      strokeWidth: 8,
      opacity: 1,
      colors: ["#ff0000", "#0000ff"],
      background: "#000000",
    };

    it("fades the colours along the diagonal from bottom-left to top-right", () => {
      const r = rasterize(ribbon(bold));
      // The spine is (0, 100) -> (200, 0): s = 0.1, 0.5, 0.9 are x = 20, 100, 180.
      const [r1, , b1] = pixelAt(r, 20, 90);
      expect(r1).toBeGreaterThan(200);
      expect(b1).toBeLessThan(60);
      const [rm, , bm] = pixelAt(r, 100, 50);
      expect(rm).toBeGreaterThan(90);
      expect(bm).toBeGreaterThan(90);
      expect(Math.abs(rm - bm)).toBeLessThan(25);
      const [r9, , b9] = pixelAt(r, 180, 10);
      expect(b9).toBeGreaterThan(200);
      expect(r9).toBeLessThan(60);
      // Off the spine it is the background.
      expect(pixelAt(r, 190, 90)).toEqual([0, 0, 0, 255]);
    });

    it("a single line has no cross-lines to mesh: no degenerate one-point path", () => {
      const one = ribbon({ ...small, lines: 1, mesh: true });
      expect(paths(one)).toEqual(paths(ribbon({ ...small, lines: 1 })));
      expect(one).not.toMatch(/d="M[^L"]*"/);
      // Two lines still get their cross-lines.
      expect(paths(ribbon({ ...small, lines: 2, mesh: true }))).toHaveLength(
        2 + 16,
      );
    });

    it("draws strokes strokeWidth px thick, at any canvas size", () => {
      const thickness = (width: number, height: number): number => {
        const r = rasterize(
          ribbon({
            width,
            height,
            path: "horizontal",
            lines: 1,
            samples: 8,
            thickness: 0,
            amplitude: 0,
            strokeWidth: 10,
            opacity: 1,
            colors: ["#ffffff", "#ffffff"],
            background: "#000000",
          }),
        );
        let sum = 0;
        for (let y = 0; y < height; y++) sum += pixelAt(r, width >> 1, y)[0];
        return sum / 255;
      };
      for (const [w, h] of [
        [200, 100],
        [800, 400],
        [300, 100],
      ] as const)
        expect(thickness(w, h)).toBeCloseTo(10, 0);
    });

    it("draws nothing outside the strokes when there is no background", () => {
      const r = rasterize(
        ribbon({
          width: 100,
          height: 100,
          path: "horizontal",
          lines: 1,
          samples: 4,
          thickness: 0,
          amplitude: 0,
          strokeWidth: 4,
          opacity: 1,
        }),
      );
      expect(pixelAt(r, 50, 50)[3]).toBe(255);
      expect(pixelAt(r, 50, 10)[3]).toBe(0);
      expect(pixelAt(r, 5, 95)[3]).toBe(0);
    });

    it("applies the group opacity once, so crossings do not darken it", () => {
      const r = rasterize(
        ribbon({
          width: 100,
          height: 100,
          path: "horizontal",
          lines: 3,
          samples: 4,
          thickness: 0,
          amplitude: 0,
          strokeWidth: 6,
          opacity: 0.5,
          colors: ["#ffffff", "#ffffff"],
        }),
      );
      // Three identical lines on top of each other: still 50 %, not 87 %.
      const a = pixelAt(r, 50, 50)[3];
      expect(a).toBeGreaterThan(125);
      expect(a).toBeLessThan(131);
    });
  });

  describe("size", () => {
    it("stays bounded: the default is small, the cap is a few MB", () => {
      expect(ribbon({ width: 1200, height: 630 }).length).toBeLessThan(260_000);
      const worst = ribbon({
        width: 16384,
        height: 16384,
        lines: 400,
        samples: 250,
      });
      expect(worst.length).toBeLessThan(2_000_000);
      const meshed = ribbon({
        width: 16384,
        height: 16384,
        lines: 250,
        samples: 200,
        mesh: true,
        meshLines: 200,
      });
      expect(meshed.length).toBeLessThan(2_000_000);
    });

    it("rejects more than 100000 drawn points before computing any", () => {
      expect(() =>
        ribbon({ width: 100, height: 100, lines: 400, samples: 251 }),
      ).toThrow(/ribbon would draw 100400 points .*limit is 100000/);
      expect(() =>
        ribbon({ width: 100, height: 100, lines: 400, samples: 1000 }),
      ).toThrow(VisError);
      // Mesh cross-lines count too: 250 * (200 + 201).
      expect(() =>
        ribbon({
          width: 100,
          height: 100,
          lines: 250,
          samples: 201,
          mesh: true,
          meshLines: 201,
        }),
      ).toThrow(/ribbon would draw 100500 points/);
      // Exactly at the limit is fine.
      expect(() =>
        ribbon({ width: 100, height: 100, lines: 400, samples: 250 }),
      ).not.toThrow();
    });
  });

  describe("validation", () => {
    it.each<[string, unknown, RegExp]>([
      [
        "colors one entry",
        { colors: ["#fff"] },
        /colors must hold 2\.\.64 colours, got 1/,
      ],
      ["colors empty", { colors: [] }, /colors must hold 2\.\.64/],
      [
        "colors too many",
        { colors: Array.from({ length: 65 }, () => "#fff") },
        /colors must hold 2\.\.64 colours, got 65/,
      ],
      [
        "colors a string",
        { colors: "#fff" },
        /colors must be an array of 2\.\.64 colours, got "#fff"/,
      ],
      ["colors null", { colors: null }, /colors must be an array .*got null/],
      ["colors bad entry", { colors: ["#fff", "nope"] }, /colors\[1\]: .*nope/],
      [
        "colors non-string entry",
        { colors: ["#fff", 5] },
        /colors\[1\] must be a colour string, got 5/,
      ],
      [
        "opacity 2",
        { opacity: 2 },
        /opacity must be a number in 0\.\.1, got 2/,
      ],
      ["opacity NaN", { opacity: NaN }, /opacity .*got NaN/],
      ["opacity null", { opacity: null }, /opacity .*got null/],
      [
        "strokeWidth 0",
        { strokeWidth: 0 },
        /strokeWidth must be a number in 0\.001\.\.64, got 0/,
      ],
      ["strokeWidth 65", { strokeWidth: 65 }, /strokeWidth .*got 65/],
      [
        "strokeWidth Infinity",
        { strokeWidth: Infinity },
        /strokeWidth .*got Infinity/,
      ],
      [
        "meshLines 0",
        { mesh: true, meshLines: 0 },
        /meshLines must be an integer in 1\.\.16, got 0/,
      ],
      ["meshLines 0 without mesh", { meshLines: 0 }, /meshLines .*got 0/],
      [
        "meshLines more than samples",
        { mesh: true, meshLines: 17 },
        /meshLines .*1\.\.16, got 17/,
      ],
      ["meshLines 1.5", { meshLines: 1.5 }, /meshLines .*got 1\.5/],
      ["mesh a string", { mesh: "yes" }, /mesh must be a boolean, got "yes"/],
      ["mesh null", { mesh: null }, /mesh must be a boolean, got null/],
      ["idPrefix empty", { idPrefix: "" }, /idPrefix must be a valid id/],
      ["idPrefix digit first", { idPrefix: "1a" }, /idPrefix .*got "1a"/],
      ["idPrefix quote", { idPrefix: 'a"b' }, /idPrefix/],
      ["idPrefix 61 chars", { idPrefix: "a".repeat(61) }, /idPrefix/],
      ["idPrefix number", { idPrefix: 5 }, /idPrefix .*got 5/],
      ["idPrefix null", { idPrefix: null }, /idPrefix .*got null/],
      [
        "background number",
        { background: 5 },
        /background must be a colour string or a gradient spec, got 5/,
      ],
      [
        "background null",
        { background: null },
        /background must be .*got null/,
      ],
      [
        "background array",
        { background: [] },
        /background must be .*got object/,
      ],
      ["background bad colour", { background: "nope" }, /background: .*nope/],
      [
        "background bad gradient",
        { background: { kind: "linear", stops: ["#fff"] } },
        /^background: .*at least 2 stops/,
      ],
      ["width 0", { width: 0 }, /width .*got 0/],
      ["lines 401", { lines: 401 }, /lines .*got 401/],
      ["path unknown", { path: "zigzag" }, /path must be .*"zigzag"/],
      ["seed 1.5", { seed: 1.5 }, /seed must be a safe integer, got 1\.5/],
    ])(
      "%s throws a VisError naming the parameter and value",
      (_n, extra, re) => {
        const opts = { ...small, ...(extra as object) } as RibbonSvgOptions;
        expect(() => ribbon(opts)).toThrow(VisError);
        expect(() => ribbon(opts)).toThrow(re);
      },
    );

    it("rejects non-object options", () => {
      expect(() => ribbon(null as never)).toThrow(
        /options must be an object, got null/,
      );
      expect(() => ribbon(5 as never)).toThrow(VisError);
    });

    it("uses defaults only for undefined", () => {
      expect(
        ribbon({
          ...small,
          colors: undefined,
          background: undefined,
          strokeWidth: undefined,
          opacity: undefined,
          mesh: undefined,
          meshLines: undefined,
          idPrefix: undefined,
        } as unknown as RibbonSvgOptions),
      ).toBe(ribbon(small));
    });
  });

  it("is deterministic and matches its goldens", () => {
    expect(ribbon(small)).toBe(ribbon(small));
    expectGolden(
      "scene/ribbon.svg",
      ribbon({ ...small, background: "#0a0a0a", mesh: true, meshLines: 6 }),
    );
    expectGolden(
      "scene/ribbon-wave.svg",
      ribbon({
        width: 600,
        height: 300,
        path: [
          [0, 0.7],
          [0.35, 0.3],
          [0.65, 0.8],
          [1, 0.35],
        ],
        lines: 40,
        samples: 64,
        twist: 1.5,
        amplitude: 0.06,
        frequency: 2,
        thickness: 0.25,
        seed: 3,
        colors: ["#ef4444", "#7c3aed", "#10abba"],
        background: {
          kind: "linear",
          angle: 135,
          stops: ["#08080a", "#1a1030"],
        },
      }),
    );
  });
});
