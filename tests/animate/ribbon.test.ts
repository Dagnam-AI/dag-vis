// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { ribbon, ribbonCurves } from "../../src/scene/index.js";
import { RIBBON_DEFAULTS, createRibbon } from "../../src/animate/ribbon.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";
import { installFakeGl } from "./fake-gl.js";

describe("ribbonCurves is exactly periodic in 2π (what the loop relies on)", () => {
  const opts = { width: 200, height: 100, lines: 6, seed: 3 };
  it("phase 0, 2π and 2π·k give bit-identical points", () => {
    const zero = ribbonCurves(opts, 0);
    expect(ribbonCurves(opts, 2 * Math.PI)).toEqual(zero);
    expect(ribbonCurves(opts, 4 * Math.PI)).toEqual(zero);
    expect(ribbonCurves(opts, -2 * Math.PI)).toEqual(zero);
    expect(ribbonCurves(opts, Math.PI)).not.toEqual(zero);
  });
});

describe("createRibbon", () => {
  let dom: FakeDom;
  let fake: ReturnType<typeof installFakeGl>;
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    dom = installFakeDom({ dpr: 1 });
    fake = installFakeGl();
    const parent = document.createElement("div");
    canvas = document.createElement("canvas");
    parent.appendChild(canvas);
    document.body.appendChild(parent);
  });
  afterEach(() => {
    fake.restore();
    dom.restore();
    document.body.innerHTML = "";
  });

  const ctx = () => {
    const c = fake.ctx2ds[0];
    if (!c) throw new Error("no 2D context was requested");
    return c;
  };
  const strokes = () => ctx().calls.filter((c) => c.startsWith("stroke"));
  const points = () =>
    ctx().calls.filter((c) => c.startsWith("moveTo") || c.startsWith("lineTo"));
  const stops = () => ctx().calls.filter((c) => c.startsWith("addColorStop"));
  /** The path points of one `renderAt(t)`. */
  function shot(h: { renderAt(t: number): void }, t: number): string[] {
    ctx().calls.length = 0;
    h.renderAt(t);
    return points();
  }
  const sized = (
    opts: Parameters<typeof createRibbon>[1],
    w = 200,
    h = 100,
  ) => {
    const handle = createRibbon(canvas, opts);
    handle.start();
    dom.resize(w, h);
    return handle;
  };
  /** The lines `moveTo`/`lineTo` would produce for these curves. */
  const lines = (curves: [number, number][][]) =>
    curves.flatMap((c) =>
      c.map((p, i) => `${i === 0 ? "moveTo" : "lineTo"} ${p[0]} ${p[1]}`),
    );

  it("strokes every curve ribbonCurves returns, with a gradient along the spine in the given colours", () => {
    const h = sized({
      lines: 3,
      colors: ["#ef4444", "#ffffff"],
      strokeWidth: 2,
      opacity: 0.5,
    });
    ctx().calls.length = 0;
    h.renderAt(0);
    const curves = ribbonCurves(
      { width: 200, height: 100, lines: 3, seed: 1 },
      0,
    );
    // one path, one stroke: overlapping lines are painted as a union, so the opacity applies once
    expect(strokes()).toEqual(["stroke 2 0.5"]);
    // bottom-left to top-right, as the static ribbon's diagonal spine
    expect(ctx().calls).toContain("createLinearGradient 0 100 200 0");
    expect(stops()).toEqual([
      "addColorStop linear 0 #ef4444",
      "addColorStop linear 1 #ffffff",
    ]);
    expect(points()).toEqual(lines(curves));
    expect(ctx().calls).toContain("clearRect 0 0 200 100");
    expect(ctx().lineJoin).toBe("round");
  });

  it("draws the static ribbon's look by default: the scene's defaults, so phase 0 is the same ribbon", () => {
    const h = sized({});
    const drawn = shot(h, 0);
    // identical curves to what the static SVG draws for the same defaults
    const svg = ribbon({ width: 200, height: 100 });
    const curves = ribbonCurves({ width: 200, height: 100 }, 0);
    expect(drawn).toEqual(lines(curves));
    // the static ribbon's stop colours are the animated defaults, not a copy of a literal
    expect([...svg.matchAll(/stop-color="([^"]+)"/g)].map((m) => m[1])).toEqual(
      [...RIBBON_DEFAULTS.colors],
    );
    expect(svg).toContain('stroke-width="1"');
    expect(svg).toContain('opacity="0.8"');
    expect(RIBBON_DEFAULTS).toEqual({
      lines: 120,
      twist: 2,
      amplitude: 0.12,
      frequency: 1.5,
      colors: ["#ef4444", "#7c3aed", "#10abba"],
      strokeWidth: 1,
      opacity: 0.8,
      drift: 0.5,
    });
    expect(stops()).toEqual([
      "addColorStop linear 0 #ef4444",
      "addColorStop linear 0.5 #7c3aed",
      "addColorStop linear 1 #10abba",
    ]);
  });

  it("applies the opacity once to the whole ribbon, as the static SVG's group opacity: one path, one stroke, after every segment", () => {
    // 120 lines overlap heavily (up to 24+ at the nodes); per-line strokes would stack alpha there
    const h = sized({ opacity: 0.8 });
    ctx().calls.length = 0;
    h.renderAt(0);
    const calls = ctx().calls;
    expect(calls.filter((c) => c === "beginPath")).toHaveLength(1);
    expect(strokes()).toEqual(["stroke 1 0.8"]);
    const stroke = calls.findIndex((c) => c.startsWith("stroke"));
    expect(
      calls.lastIndexOf(
        calls.filter((c) => c.startsWith("lineTo")).at(-1) ?? "",
      ),
    ).toBeLessThan(stroke);
    expect(calls.filter((c) => c.startsWith("moveTo"))).toHaveLength(120);
    expect(stroke).toBe(calls.length - 1);
  });

  it("passes twist, amplitude, frequency and seed to ribbonCurves", () => {
    const o = { twist: -1, amplitude: 0.3, frequency: 2.5, seed: 9, lines: 4 };
    const h = sized(o);
    expect(shot(h, 0)).toEqual(
      lines(ribbonCurves({ width: 200, height: 100, ...o }, 0)),
    );
  });

  it("phase advances with t × drift", () => {
    const h = sized({ lines: 2, drift: 1 });
    const at0 = shot(h, 0);
    const at1 = shot(h, 1.5);
    expect(at1).not.toEqual(at0);
    expect(at1).toEqual(
      lines(ribbonCurves({ width: 200, height: 100, lines: 2, seed: 1 }, 1.5)),
    );
  });

  it("loops exactly: phase 2π per duration, frame 0 == frame duration != frame duration/2", () => {
    const h = sized({ lines: 4, loop: { duration: 3 } });
    expect(h.duration).toBe(3);
    const zero = shot(h, 0);
    expect(shot(h, 3)).toEqual(zero);
    expect(shot(h, 6)).toEqual(zero);
    expect(shot(h, 1.5)).not.toEqual(zero);
    // a non-integer frequency and an awkward duration stay exact at the seam
    const odd = sized({ lines: 4, frequency: 1.7, loop: { duration: 0.7 } });
    expect(shot(odd, 0.7)).toEqual(shot(odd, 0));
    // half a loop is phase π (t = 0.25 of 0.5 is exact in binary)
    const half = sized({ lines: 4, frequency: 1.7, loop: { duration: 0.5 } });
    expect(shot(half, 0.25)).toEqual(
      lines(
        ribbonCurves(
          { width: 200, height: 100, lines: 4, frequency: 1.7, seed: 1 },
          Math.PI,
        ),
      ),
    );
  });

  it("a single colour still produces a gradient (one stop)", () => {
    const h = sized({ colors: ["#123456"] });
    ctx().calls.length = 0;
    h.renderAt(0);
    expect(stops()).toEqual(["addColorStop linear 0 #123456"]);
  });

  it("honours a colour's alpha in the gradient", () => {
    const h = sized({ colors: ["rgba(255, 0, 0, 0.5)", "#00ff00"] });
    ctx().calls.length = 0;
    h.renderAt(0);
    expect(stops()).toEqual([
      "addColorStop linear 0 rgba(255, 0, 0, 0.5)",
      "addColorStop linear 1 #00ff00",
    ]);
  });

  it("scales to the dpr", () => {
    dom.restore();
    dom = installFakeDom({ dpr: 2 });
    const h = sized({ lines: 1 });
    ctx().calls.length = 0;
    h.renderAt(0);
    expect(ctx().calls).toContain("setTransform 2 0 0 2 0 0");
    expect(ctx().calls).toContain("clearRect 0 0 200 100");
  });

  it("clears but draws nothing on a canvas under 1 px, and clamps one over 16384 px", () => {
    const h = sized({ lines: 1 });
    canvas.width = 0;
    ctx().calls.length = 0;
    h.renderAt(0);
    expect(ctx().calls).toContain("clearRect 0 0 0 100");
    expect(points()).toEqual([]);
    expect(ctx().calls.some((c) => c.startsWith("createLinearGradient"))).toBe(
      false,
    );
    canvas.width = 40000;
    canvas.height = 20000;
    ctx().calls.length = 0;
    expect(() => {
      h.renderAt(0);
    }).not.toThrow();
    expect(ctx().calls).toContain("createLinearGradient 0 16384 16384 0");
    expect(points().length).toBeGreaterThan(0);
  });

  it("rejects a non-finite t and treats an overflowing t x drift as phase 0", () => {
    const h = sized({ lines: 2 });
    const zero = shot(h, 0);
    expect(() => shot(h, Number.NaN)).toThrow(/^t must be a finite number/);
    expect(() => shot(h, Number.POSITIVE_INFINITY)).toThrow(VisError);
    const huge = sized({ lines: 2, drift: 1e300 });
    expect(shot(huge, 1e300)).toEqual(zero);
  });

  it("update(...) takes effect on the next frame: colors, seed, lines, drift", () => {
    const h = sized({ lines: 2, colors: ["#000000", "#ffffff"] });
    h.update({ colors: ["#ff0000", "#00ff00"] });
    ctx().calls.length = 0;
    h.renderAt(0);
    expect(stops()).toEqual([
      "addColorStop linear 0 #ff0000",
      "addColorStop linear 1 #00ff00",
    ]);
    const a = shot(h, 0);
    h.update({ seed: 2 });
    const b = shot(h, 0);
    expect(b).toEqual(
      lines(ribbonCurves({ width: 200, height: 100, lines: 2, seed: 2 }, 0)),
    );
    expect(b).not.toEqual(a);
    h.update({ lines: 3, drift: 2 });
    ctx().calls.length = 0;
    h.renderAt(1);
    expect(strokes()).toHaveLength(1);
    expect(points()).toEqual(
      lines(ribbonCurves({ width: 200, height: 100, lines: 3, seed: 2 }, 2)),
    );
  });

  it("copies colors and loop: a caller mutating them later changes nothing", () => {
    const colors = ["#000000", "#ffffff"];
    const loop = { duration: 2 };
    const h = sized({ lines: 1, colors, loop });
    colors[0] = "nope";
    colors.push("#ff0000");
    loop.duration = -1;
    ctx().calls.length = 0;
    expect(() => {
      h.renderAt(1);
    }).not.toThrow();
    expect(stops()).toEqual([
      "addColorStop linear 0 #000000",
      "addColorStop linear 1 #ffffff",
    ]);
    const next = ["#00ff00"];
    const nextLoop = { duration: 4 };
    h.update({ colors: next, loop: nextLoop });
    next[0] = "nope";
    nextLoop.duration = 0;
    ctx().calls.length = 0;
    h.renderAt(0);
    expect(stops()).toEqual(["addColorStop linear 0 #00ff00"]);
    expect(h.duration).toBe(4);
  });

  it("exports frozen defaults", () => {
    expect(Object.isFrozen(RIBBON_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(RIBBON_DEFAULTS.colors)).toBe(true);
    expect(() => {
      // @ts-expect-error readonly palette shared by every ribbon's defaults
      RIBBON_DEFAULTS.colors[0] = "#000000";
    }).toThrow(TypeError);
    // the frozen palette is copied: updating one handle leaves the next one's defaults intact
    const h = sized({ lines: 1 });
    h.update({ colors: ["#ff0000"] });
    h.destroy();
    const other = document.createElement("canvas");
    document.body.appendChild(other);
    const h2 = createRibbon(other, { lines: 1 });
    h2.renderAt(0);
    expect(
      fake.ctx2ds.at(-1)?.calls.filter((c) => c.startsWith("addColorStop")),
    ).toHaveLength(3);
  });

  it("validates options and names the offending one", () => {
    // geometry rules come from ribbonCurves itself
    expect(() => createRibbon(canvas, { lines: 0 })).toThrow(/lines/);
    expect(() => createRibbon(canvas, { lines: 401 })).toThrow(/lines/);
    expect(() => createRibbon(canvas, { lines: 1.5 })).toThrow(/lines/);
    expect(() => createRibbon(canvas, { amplitude: 101 })).toThrow(/amplitude/);
    expect(() => createRibbon(canvas, { frequency: 1001 })).toThrow(
      /frequency/,
    );
    expect(() => createRibbon(canvas, { twist: Number.NaN })).toThrow(/twist/);
    expect(() => createRibbon(canvas, { strokeWidth: 0 })).toThrow(
      /strokeWidth must be a finite number >= 0.001 and <= 64/,
    );
    expect(() => createRibbon(canvas, { strokeWidth: 65 })).toThrow(
      /strokeWidth/,
    );
    expect(() => createRibbon(canvas, { opacity: 1.5 })).toThrow(
      /opacity must be a finite number >= 0 and <= 1/,
    );
    expect(() => createRibbon(canvas, { opacity: Number.NaN })).toThrow(
      /opacity/,
    );
    expect(() => createRibbon(canvas, { drift: Number.NaN })).toThrow(
      /drift must be a finite number/,
    );
    expect(() =>
      createRibbon(canvas, { drift: Number.POSITIVE_INFINITY }),
    ).toThrow(/drift/);
    expect(() => createRibbon(canvas, { colors: [] })).toThrow(
      /colors must list 1\.\.64 colours/,
    );
    expect(() => createRibbon(canvas, { colors: "#fff" as never })).toThrow(
      /colors must list 1\.\.64 colours/,
    );
    expect(() =>
      createRibbon(canvas, {
        colors: Array.from({ length: 65 }, () => "#fff"),
      }),
    ).toThrow(/colors must list 1\.\.64 colours/);
    expect(() => createRibbon(canvas, { colors: ["#fff", "bad"] })).toThrow(
      /^colors\[1\]: invalid colour/,
    );
    expect(() => createRibbon(canvas, { colors: ["bad"] })).toThrow(VisError);
    expect(() => createRibbon(canvas, { seed: 1.5 })).toThrow(/seed/);
    expect(() => createRibbon(canvas, { speed: -1 })).toThrow(/speed/);
    expect(() => createRibbon(canvas, { loop: { duration: 0 } })).toThrow(
      /loop\.duration/,
    );
  });

  it("a rejected update leaves the live options untouched", () => {
    const h = sized({ lines: 2 });
    const before = shot(h, 0);
    for (const patch of [
      { lines: 0 },
      { colors: ["bad"] },
      { opacity: 2 },
      { drift: Number.NaN },
    ])
      expect(() => {
        h.update(patch);
      }).toThrow(VisError);
    expect(shot(h, 0)).toEqual(before);
  });
});
