// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  GLITCH_DEFAULTS,
  cellState,
  changedAt,
  createGlitch,
  lastChange,
  type Rgb,
} from "../../src/animate/glitch.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";
import { installFakeGl } from "./fake-gl.js";

const PALETTE: Rgb[] = [
  [58, 18, 18],
  [122, 31, 31],
  [239, 68, 68],
];
const CHARS = Array.from("AB");

describe("pure cell state", () => {
  it("changedAt is a seeded per-tick Bernoulli(~0.05), true from tick 0 down when not looping", () => {
    expect(changedAt(1, 0, 0, 0)).toBe(true);
    expect(changedAt(1, 0, -3, 0)).toBe(true);
    let hits = 0;
    for (let k = 1; k <= 4000; k += 1) if (changedAt(1, 7, k, 0)) hits += 1;
    expect(hits).toBeGreaterThan(140);
    expect(hits).toBeLessThan(260);
    // The same tick across many cells is just as close to 5 %, so cells are independent.
    for (const tick of [1, 77, 1234]) {
      let cells = 0;
      for (let c = 0; c < 4000; c += 1)
        if (changedAt(1, c, tick, 0)) cells += 1;
      expect(cells).toBeGreaterThan(140);
      expect(cells).toBeLessThan(260);
    }
    expect(changedAt(1, 7, 42, 0)).toBe(changedAt(1, 7, 42, 0));
    const a = Array.from({ length: 200 }, (_, k) => changedAt(1, 7, k + 1, 0));
    const b = Array.from({ length: 200 }, (_, k) => changedAt(2, 7, k + 1, 0));
    expect(a).not.toEqual(b);
  });

  it("keeps the 5 % rate in a short loop, where a forced change per loop tops up the draws", () => {
    for (const K of [40, 100]) {
      let hits = 0;
      for (let c = 0; c < 400; c += 1)
        for (let k = 0; k < K; k += 1) if (changedAt(3, c, k, K)) hits += 1;
      const expected = 0.05 * 400 * K;
      expect(hits).toBeGreaterThan(expected * 0.85);
      expect(hits).toBeLessThan(expected * 1.15);
    }
    // One tick per loop: the only tick is the cell's forced change.
    expect(changedAt(3, 5, 0, 1)).toBe(true);
    expect(changedAt(3, 5, 17, 1)).toBe(true);
  });

  it("lastChange returns the most recent change <= k", () => {
    for (const cell of [3, 4, 5]) {
      const last = lastChange(1, cell, 500, 0);
      expect(last).toBeLessThanOrEqual(500);
      expect(changedAt(1, cell, last, 0)).toBe(true);
      for (let t = last + 1; t <= 500; t += 1)
        expect(changedAt(1, cell, t, 0)).toBe(false);
    }
    // Ticks <= 0 are all "changes", so the scan stops at the tick itself.
    expect(lastChange(9, 9, -1000, 0)).toBe(-1000);
    expect(lastChange(9, 9, 0, 0)).toBe(0);
  });

  it("every cell changes at least once every 400 ticks (no loop) or K ticks (loop)", () => {
    for (let c = 0; c < 600; c += 1) {
      expect(1000 - lastChange(4, c, 1000, 0)).toBeLessThan(400);
    }
    const K = 40;
    for (let c = 0; c < 600; c += 1)
      for (const k of [0, 13, 39])
        expect(k - lastChange(4, c, k, K)).toBeLessThan(K);
  });

  it("looping is periodic in the tick, including across the seam", () => {
    const K = 40;
    for (let c = 0; c < 100; c += 1) {
      for (const k of [-45, -1, 0, 7, 39]) {
        expect(lastChange(1, c, k + K, K)).toBe(lastChange(1, c, k, K) + K);
        expect(changedAt(1, c, k + K, K)).toBe(changedAt(1, c, k, K));
      }
    }
    expect(lastChange(1, 3, -1, K)).toBeLessThanOrEqual(-1);
  });

  it("a looping cell's state really changes at its changes: two per loop at least, so short loops move", () => {
    for (const K of [4, 20, 21]) {
      let moving = 0;
      for (let c = 0; c < 400; c += 1) {
        const keys = new Set<number>();
        for (let k = 0; k < K; k += 1)
          keys.add(((lastChange(1, c, k, K) % K) + K) % K);
        // distinct states over the loop: more than one means the cell visibly changes
        if (keys.size > 1) moving += 1;
      }
      expect(moving / 400).toBeGreaterThan(0.99);
    }
  });

  it("seeds 2^32 apart do not collide", () => {
    const seq = (seed: number) =>
      Array.from({ length: 300 }, (_, k) => changedAt(seed, 0, k + 1, 0));
    expect(seq(1)).not.toEqual(seq(1 + 2 ** 32));
    expect(seq(0)).not.toEqual(seq(2 ** 32));
    expect(seq(-5)).not.toEqual(seq(2 ** 32 - 5));
    const states = (seed: number) =>
      Array.from({ length: 60 }, (_, c) =>
        cellState(seed, c, 5, 0, CHARS, PALETTE),
      );
    expect(states(1)).not.toEqual(states(1 + 2 ** 32));
  });

  it("lastChange never hangs on a non-finite tick", () => {
    expect(lastChange(1, 0, Number.NaN, 0)).toBeNaN();
    expect(lastChange(1, 0, Number.NaN, 40)).toBeNaN();
  });

  it("cellState picks char and colour from a seeded stream, periodic in a loop", () => {
    const a = cellState(1, 4, 12, 0, CHARS, PALETTE);
    expect(CHARS).toContain(a.char);
    expect(PALETTE).toContainEqual(a.rgb);
    expect(cellState(1, 4, 12, 0, CHARS, PALETTE)).toEqual(a);
    expect(cellState(1, 4, 12 + 40, 40, CHARS, PALETTE)).toEqual(
      cellState(1, 4, 12, 40, CHARS, PALETTE),
    );
    expect(cellState(1, 4, -28, 40, CHARS, PALETTE)).toEqual(
      cellState(1, 4, 12, 40, CHARS, PALETTE),
    );
    const seen = new Set<string>();
    for (let c = 0; c < 200; c += 1)
      seen.add(cellState(1, c, 5, 0, CHARS, PALETTE).char);
    expect(seen.size).toBe(2);
    const colours = new Set<string>();
    for (let c = 0; c < 200; c += 1)
      colours.add(cellState(1, c, 5, 0, CHARS, PALETTE).rgb.join());
    expect(colours.size).toBe(3);
  });
});

describe("createGlitch", () => {
  let dom: FakeDom;
  let fake: ReturnType<typeof installFakeGl>;
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    dom = installFakeDom({ dpr: 2 });
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

  const ctx = (i = 0) => {
    const c = fake.ctx2ds[i];
    if (!c) throw new Error("no 2D context was requested");
    return c;
  };
  const texts = (i = 0) => ctx(i).calls.filter((c) => c.startsWith("fillText"));
  /** The fillText lines of one `renderAt(t)`. */
  function shot(h: { renderAt(t: number): void }, t: number, i = 0): string[] {
    ctx(i).calls.length = 0;
    h.renderAt(t);
    return texts(i);
  }
  /** A handle with a one-cell (10×20) canvas. */
  function oneCell(opts: Parameters<typeof createGlitch>[1] = {}) {
    const h = createGlitch(canvas, { vignette: "none", ...opts });
    h.start();
    dom.resize(10, 20);
    return h;
  }
  const fill = (line: string) => line.split(" rgb(")[1];
  const lerp = (a: number, b: number, p: number) => Math.round(a + (b - a) * p);

  it("draws a 10×20 CSS-px monospace grid at dpr with today's defaults and an outer vignette", () => {
    const h = createGlitch(canvas);
    h.start();
    dom.resize(45, 30); // 5 columns × 2 rows
    ctx().calls.length = 0; // the resize repaint is not the frame under test
    dom.frame(0);
    const c = ctx();
    expect(c.calls).toContain("setTransform 2 0 0 2 0 0");
    expect(c.calls).toContain("clearRect 0 0 45 30");
    expect(c.font).toBe("16px monospace");
    expect(c.textBaseline).toBe("top");
    const t = texts();
    expect(t).toHaveLength(10);
    expect(t[0]).toMatch(
      /^fillText [A-Z!@#$&*()\-_+=/[\]{};:<>.,0-9] 0 0 rgb\(/,
    );
    expect(t[6]).toMatch(/^fillText . 10 20 rgb\(/);
    expect(c.calls).toContain(
      "createRadialGradient 22.5 15 0 22.5 15 27.04163456597992",
    );
    expect(c.calls).toContain("addColorStop radial 0.6 rgba(0,0,0,0)");
    expect(c.calls).toContain("addColorStop radial 1 rgba(0,0,0,1)");
    expect(c.calls.at(-1)).toMatch(/^fillRect 0 0 45 30 /);
    for (const line of t)
      expect(line).toMatch(/rgb\((43, 69, 57|97, 220, 163|97, 179, 220)\)$/);
  });

  it("maps the landing Enterprise card: palette colours only (initial state settled), no vignette", () => {
    const h = createGlitch(canvas, {
      colors: ["#3a1212", "#7a1f1f", "#ef4444"],
      glitchSpeed: 50,
      characters: GLITCH_DEFAULTS.characters,
      smooth: true,
      vignette: "none",
    });
    h.start();
    dom.resize(20, 20);
    ctx().calls.length = 0;
    dom.frame(0);
    expect(texts()).toHaveLength(2);
    for (const line of texts())
      expect(line).toMatch(/rgb\((58, 18, 18|122, 31, 31|239, 68, 68)\)$/);
    expect(ctx().calls.some((c) => c.startsWith("createRadialGradient"))).toBe(
      false,
    );
  });

  it("center vignette uses today's CSS stops", () => {
    const h = createGlitch(canvas, { vignette: "center" });
    h.renderAt(0);
    expect(ctx().calls).toContain("addColorStop radial 0 rgba(0,0,0,0.8)");
    expect(ctx().calls).toContain("addColorStop radial 0.6 rgba(0,0,0,0)");
    expect(ctx().calls.some((c) => c.includes("radial 1 "))).toBe(false);
  });

  it("splits characters by code point", () => {
    const h = oneCell({ characters: "😀" });
    expect(shot(h, 0)[0]).toMatch(/^fillText 😀 0 0 /);
  });

  it("renderAt(t) is a pure function of (seed, t): a live handle equals a cold one", () => {
    const a = createGlitch(canvas, { seed: 3, vignette: "none" });
    a.start();
    dom.resize(100, 60); // 10 × 3 cells
    for (const t of [0.3, 1.1, 3.333, 9.99]) shot(a, t);
    const live = shot(a, 3.333);
    expect(live).toHaveLength(30);
    const other = document.createElement("canvas");
    document.body.appendChild(document.createElement("div")).appendChild(other);
    const b = createGlitch(other, { seed: 3, vignette: "none" });
    b.start();
    dom.resize(100, 60);
    expect(shot(b, 3.333, 1)).toEqual(live);
    // a backwards jump recomputes to the same picture
    shot(b, 1.1, 1);
    expect(shot(b, 3.333, 1)).toEqual(live);
    // the same tick at a different t only moves the tweens, never the characters
    const chars = (lines: string[]) => lines.map((l) => l.split(" ")[1]);
    expect(chars(shot(b, 3.333 + 0.001, 1))).toEqual(chars(live));
  });

  it("glitches about 5 % of the cells per 50 ms tick", () => {
    const h = createGlitch(canvas, { vignette: "none", characters: "AB" });
    h.start();
    dom.resize(300, 200); // 30 × 10 cells
    let before = shot(h, 10.01).map((l) => l.split(" ")[1]);
    let changed = 0;
    let possible = 0;
    for (let k = 1; k <= 40; k += 1) {
      const after = shot(h, 10.01 + k * 0.05).map((l) => l.split(" ")[1]);
      for (let i = 0; i < after.length; i += 1) {
        possible += 1;
        if (after[i] !== before[i]) changed += 1;
      }
      before = after;
    }
    // 2 characters: half of the re-rolls land on the same glyph
    const rate = (changed / possible) * 2;
    expect(rate).toBeGreaterThan(0.035);
    expect(rate).toBeLessThan(0.065);
  });

  it("smooth tweens from the previous to the current colour over 1/3 s of virtual time; smooth: false snaps", () => {
    const seed = 1;
    const period = 0.05;
    const h = oneCell({
      seed,
      colors: ["#000000", "#ffffff"],
      characters: "A",
    });
    const pal: Rgb[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    // A change at tick k > 0 to a different colour, then 8 quiet ticks.
    let k = 1;
    const quiet = (from: number) => {
      for (let t = from + 1; t <= from + 8; t += 1)
        if (changedAt(seed, 0, t, 0)) return false;
      return true;
    };
    const differs = (tick: number) =>
      cellState(seed, 0, lastChange(seed, 0, tick - 1, 0), 0, ["A"], pal)
        .rgb[0] !== cellState(seed, 0, tick, 0, ["A"], pal).rgb[0];
    while (!(changedAt(seed, 0, k, 0) && differs(k) && quiet(k))) k += 1;
    const prev = cellState(
      seed,
      0,
      lastChange(seed, 0, k - 1, 0),
      0,
      ["A"],
      pal,
    ).rgb[0];
    const cur = cellState(seed, 0, k, 0, ["A"], pal).rgb[0];
    expect(prev).not.toBe(cur);
    const at = (dt: number) => fill(shot(h, k * period + dt)[0] ?? "");
    // 0.01 s in: 3 % of the way.
    expect(at(0.01)).toBe(
      `${String(lerp(prev, cur, 0.03))}, ${String(lerp(prev, cur, 0.03))}, ${String(lerp(prev, cur, 0.03))})`,
    );
    const mid = 0.15; // 0.05 s of the 1/3 s tween
    expect(at(0.05)).toBe(
      `${String(lerp(prev, cur, mid))}, ${String(lerp(prev, cur, mid))}, ${String(lerp(prev, cur, mid))})`,
    );
    const done = `${String(cur)}, ${String(cur)}, ${String(cur)})`;
    expect(at(1 / 3 + 0.001)).toBe(done);
    expect(at(0.4)).toBe(done);
    h.update({ smooth: false });
    expect(at(0.01)).toBe(done);
  });

  it("does not tween the initial state (today's first frame is settled)", () => {
    const h = oneCell({ colors: ["#000000", "#ffffff"] });
    const first = shot(h, 0);
    expect(shot(h, 0.01)[0]?.split(" ")[1]).toBe(first[0]?.split(" ")[1]);
    expect(["0, 0, 0)", "255, 255, 255)"]).toContain(fill(first[0] ?? ""));
  });

  it("treats a negative t as the first frame and rejects a non-finite one", () => {
    const h = oneCell({ seed: 5 });
    const zero = shot(h, 0);
    expect(shot(h, -4)).toEqual(zero);
    expect(() => shot(h, Number.NaN)).toThrow(/^t must be a finite number/);
    expect(() => shot(h, Number.POSITIVE_INFINITY)).toThrow(VisError);
  });

  it("loop makes frame 0 and frame duration identical, and distinct from the middle", () => {
    const h = createGlitch(canvas, { loop: { duration: 2 }, vignette: "none" });
    h.start();
    dom.resize(60, 40);
    const zero = shot(h, 0);
    expect(zero).toHaveLength(12);
    expect(shot(h, 2)).toEqual(zero);
    expect(shot(h, 4)).toEqual(zero);
    expect(shot(h, 1)).not.toEqual(zero);
  });

  it("a looping cell only changes on its own change ticks (no flicker for quiet cells)", () => {
    const duration = 2; // 40 ticks of 50 ms
    for (let seed = 1; seed <= 12; seed += 1) {
      const h = oneCell({ seed, loop: { duration }, characters: "ABCDEFGHIJ" });
      let prev = shot(h, 0.01)[0]?.split(" ")[1];
      for (let k = 1; k < 40; k += 1) {
        const now = shot(h, (k + 0.2) * 0.05)[0]?.split(" ")[1];
        if (!changedAt(seed, 0, k, 40)) expect(now).toBe(prev);
        prev = now;
      }
    }
  });

  it("a loop whose duration is not a multiple of the tick stays seamless: the step back to frame 0 is one ordinary tick", () => {
    const duration = 1.03; // 21 ticks of 49.05 ms
    const h = createGlitch(canvas, {
      loop: { duration },
      vignette: "none",
      seed: 4,
      characters: GLITCH_DEFAULTS.characters,
    });
    h.start();
    dom.resize(300, 200); // 30 × 10 cells
    const before = shot(h, duration - 1e-9);
    const start = shot(h, 0);
    expect(before).toHaveLength(300);
    let changing = 0;
    for (const [i, line] of start.entries()) {
      if (changedAt(4, i, 0, 21)) {
        // The seam tick re-rolls these cells: they are the only ones allowed to differ.
        changing += 1;
        continue;
      }
      expect(before[i]).toBe(line);
    }
    // Not vacuous: a good share of the cells really does change across the seam.
    expect(changing).toBeGreaterThan(300 * 0.05 * 0.5);
    const differing = start.filter((l, i) => l !== before[i]).length;
    expect(differing).toBeGreaterThan(changing * 0.8);
    expect(shot(h, duration)).toEqual(start);
  });

  /** Glyph lines of `ticks` successive frames of a `loop` grid (one frame per tick, mid-tick). */
  function glyphRun(duration: number, seed: number, ticks: number): string[][] {
    const h = createGlitch(canvas, {
      loop: { duration },
      vignette: "none",
      seed,
      characters: GLITCH_DEFAULTS.characters,
    });
    h.start();
    dom.resize(300, 200); // 30 × 10 cells
    const period = duration / ticks;
    return Array.from({ length: ticks }, (_, k) =>
      shot(h, (k + 0.5) * period).map((l) => l.split(" ")[1] ?? ""),
    );
  }

  it("short loops still visibly change: most cells show a new glyph at some tick (1 s and 2 s)", () => {
    for (const [duration, ticks] of [
      [1, 20],
      [2, 40],
    ] as const) {
      const run = glyphRun(duration, 2, ticks);
      let moving = 0;
      for (let i = 0; i < 300; i += 1)
        if (run.some((frame, k) => frame[i] !== run[(k + 1) % ticks]?.[i]))
          moving += 1;
      expect(moving / 300).toBeGreaterThan(0.9);
    }
  });

  it("loops of any length glitch at the overall 5 % rate (6 s) and shorter ones at 2/K", () => {
    // 59 glyphs: a re-roll lands on the same glyph 1/59 of the time.
    const rate = (run: string[][]): number => {
      let changed = 0;
      const ticks = run.length;
      for (let k = 0; k < ticks; k += 1)
        for (let i = 0; i < 300; i += 1)
          if (run[k]?.[i] !== run[(k + 1) % ticks]?.[i]) changed += 1;
      return changed / (300 * ticks);
    };
    const six = rate(glyphRun(6, 3, 120));
    expect(six).toBeGreaterThan(0.04);
    expect(six).toBeLessThan(0.06);
    const one = rate(glyphRun(1, 3, 20)); // 2 changes per 20 ticks = 10 %
    expect(one).toBeGreaterThan(0.08);
    expect(one).toBeLessThan(0.12);
  });

  it("the same overall rate without a loop", () => {
    const h = createGlitch(canvas, {
      vignette: "none",
      seed: 3,
      characters: GLITCH_DEFAULTS.characters,
    });
    h.start();
    dom.resize(300, 200);
    let prev = shot(h, 50.01).map((l) => l.split(" ")[1]);
    let changed = 0;
    for (let k = 1; k <= 120; k += 1) {
      const now = shot(h, 50.01 + k * 0.05).map((l) => l.split(" ")[1]);
      for (let i = 0; i < 300; i += 1) if (now[i] !== prev[i]) changed += 1;
      prev = now;
    }
    expect(changed / (300 * 120)).toBeGreaterThan(0.04);
    expect(changed / (300 * 120)).toBeLessThan(0.06);
  });

  it("update({ colors, characters, seed }) takes effect on the next frame (E4/E5)", () => {
    const h = oneCell({ characters: "A", colors: ["#000000"] });
    expect(shot(h, 0)[0]).toBe("fillText A 0 0 rgb(0, 0, 0)");
    h.update({ colors: ["#ff0000"] });
    expect(shot(h, 0)[0]).toBe("fillText A 0 0 rgb(255, 0, 0)");
    h.update({ characters: "Z" });
    expect(shot(h, 0)[0]).toBe("fillText Z 0 0 rgb(255, 0, 0)");
    // A whole grid, so seeds 1 and 2 cannot coincide by chance.
    const h2 = createGlitch(canvas, { vignette: "none", seed: 1 });
    h2.start();
    dom.resize(200, 200);
    const one = shot(h2, 100);
    h2.update({ seed: 2 });
    expect(shot(h2, 100)).not.toEqual(one);
    h2.update({ seed: 1 });
    expect(shot(h2, 100)).toEqual(one);
  });

  it("update({ glitchSpeed }) retimes the ticks and a resize regrids the cells", () => {
    const h = createGlitch(canvas, { vignette: "none" });
    h.start();
    dom.resize(45, 30);
    expect(shot(h, 1)).toHaveLength(10);
    dom.resize(90, 60);
    expect(shot(h, 1)).toHaveLength(27); // 9 × 3
    h.update({ glitchSpeed: 200 });
    expect(shot(h, 1)).toHaveLength(27);
  });

  it("accepts any CSS colour and ignores its alpha", () => {
    const h = oneCell({ characters: "A", colors: ["rgba(10, 20, 30, 0.5)"] });
    expect(shot(h, 0)[0]).toBe("fillText A 0 0 rgb(10, 20, 30)");
  });

  it("copies colors and loop: a caller mutating them later changes nothing", () => {
    const colors = ["#000000"];
    const loop = { duration: 2 };
    const h = oneCell({ characters: "A", colors, loop });
    colors[0] = "nope";
    colors.push("#ffffff");
    loop.duration = -1;
    expect(shot(h, 0)[0]).toBe("fillText A 0 0 rgb(0, 0, 0)");
    expect(() => shot(h, 1)).not.toThrow();
    const next = ["#00ff00"];
    const nextLoop = { duration: 4 };
    h.update({ colors: next, loop: nextLoop });
    next[0] = "nope";
    nextLoop.duration = 0;
    expect(shot(h, 0)[0]).toBe("fillText A 0 0 rgb(0, 255, 0)");
    expect(h.duration).toBe(4);
  });

  it("exports frozen defaults with today's values", () => {
    expect(Object.isFrozen(GLITCH_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(GLITCH_DEFAULTS.colors)).toBe(true);
    expect(() => {
      // @ts-expect-error readonly palette shared by every glitch's defaults
      GLITCH_DEFAULTS.colors[0] = "#000000";
    }).toThrow(TypeError);
    expect(GLITCH_DEFAULTS).toEqual({
      colors: ["#2b4539", "#61dca3", "#61b3dc"],
      characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
      glitchSpeed: 50,
      smooth: true,
      vignette: "outer",
    });
    // the frozen palette is copied, so one handle's update never touches another's
    const h = oneCell({ characters: "A" });
    expect(shot(h, 0)[0]).toMatch(/rgb\(/);
  });

  it("validates options and names the offending one", () => {
    expect(() => createGlitch(canvas, { colors: [] })).toThrow(
      /colors must list at least one colour/,
    );
    expect(() => createGlitch(canvas, { colors: "#fff" as never })).toThrow(
      /colors must list at least one colour/,
    );
    expect(() => createGlitch(canvas, { colors: ["#fff", "bad"] })).toThrow(
      /^colors\[1\]: invalid colour/,
    );
    expect(() => createGlitch(canvas, { colors: ["bad"] })).toThrow(VisError);
    expect(() => createGlitch(canvas, { characters: "" })).toThrow(
      /characters must be a non-empty string/,
    );
    expect(() => createGlitch(canvas, { characters: 5 as never })).toThrow(
      /characters must be a non-empty string/,
    );
    expect(() => createGlitch(canvas, { glitchSpeed: 0 })).toThrow(
      /glitchSpeed/,
    );
    expect(() => createGlitch(canvas, { glitchSpeed: 0.5 })).toThrow(
      /glitchSpeed must be a finite number >= 1/,
    );
    expect(() => createGlitch(canvas, { glitchSpeed: Number.NaN })).toThrow(
      /glitchSpeed/,
    );
    expect(() =>
      createGlitch(canvas, { glitchSpeed: Number.POSITIVE_INFINITY }),
    ).toThrow(/glitchSpeed/);
    expect(() => createGlitch(canvas, { smooth: "yes" as never })).toThrow(
      /smooth must be a boolean/,
    );
    expect(() => createGlitch(canvas, { vignette: "inner" as never })).toThrow(
      /vignette must be one of none, outer, center, got inner/,
    );
    expect(() => createGlitch(canvas, { speed: -1 })).toThrow(/speed/);
    expect(() => createGlitch(canvas, { loop: { duration: 0 } })).toThrow(
      /loop\.duration/,
    );
  });

  it("a rejected update leaves the live options untouched", () => {
    const h = oneCell({ characters: "A", colors: ["#000000"] });
    expect(() => {
      h.update({ colors: ["bad"] });
    }).toThrow(VisError);
    expect(() => {
      h.update({ vignette: "nope" as never });
    }).toThrow(VisError);
    expect(shot(h, 0)[0]).toBe("fillText A 0 0 rgb(0, 0, 0)");
  });
});
