// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  COMMON_DEFAULTS,
  assertFinite,
  createRuntime,
  loopTime,
  merge,
  validateCommon,
  type FrameRenderer,
  type ResolvedOptions,
  type EffectOptions,
} from "../../src/animate/runtime.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";

interface Opts extends EffectOptions {
  size?: number;
}

function recorder(): FrameRenderer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    init: (c) => calls.push(`init ${c.tagName}`),
    resize: (dpr) => calls.push(`resize ${dpr}`),
    draw: (t) => calls.push(`draw ${t.toFixed(3)}`),
    dispose: () => calls.push("dispose"),
  };
}

function mount(): HTMLCanvasElement {
  const parent = document.createElement("div");
  const canvas = document.createElement("canvas");
  parent.appendChild(canvas);
  document.body.appendChild(parent);
  return canvas;
}

function make(
  canvas: HTMLCanvasElement,
  extra: Partial<Opts> = {},
  r = recorder(),
) {
  const opts: ResolvedOptions<Opts> = { ...COMMON_DEFAULTS, size: 1, ...extra };
  const validate = (o: ResolvedOptions<Opts>) => {
    validateCommon(o);
    assertFinite("size", o.size, 0, false);
  };
  validate(opts);
  return { handle: createRuntime<Opts>(canvas, opts, validate, r), r, opts };
}

describe("helpers", () => {
  it("merge skips undefined and keeps defined values", () => {
    expect(merge({ a: 1, b: 2 }, { a: undefined, b: 3 })).toEqual({
      a: 1,
      b: 3,
    });
  });
  it("assertFinite enforces inclusive and exclusive floors", () => {
    expect(() => {
      assertFinite("x", 0, 0);
    }).not.toThrow();
    expect(() => {
      assertFinite("x", 0, 0, false);
    }).toThrow(VisError);
    expect(() => {
      assertFinite("x", Number.NaN, 0);
    }).toThrow(/x must be a finite number >= 0, got NaN/);
  });
  it("validateCommon rejects bad speed, fps, maxDpr, seed, loop and colours", () => {
    const base = { ...COMMON_DEFAULTS };
    expect(() => {
      validateCommon({ ...base, speed: -1 });
    }).toThrow(VisError);
    expect(() => {
      validateCommon({ ...base, fps: 0 });
    }).toThrow(VisError);
    expect(() => {
      validateCommon({ ...base, maxDpr: 0 });
    }).toThrow(VisError);
    expect(() => {
      validateCommon({ ...base, seed: 1.5 });
    }).toThrow(/seed must be an integer/);
    expect(() => {
      validateCommon({ ...base, loop: { duration: 0 } });
    }).toThrow(/loop.duration/);
    expect(() => {
      validateCommon({ ...base, colors: ["#fff", "nope"] });
    }).toThrow(VisError);
    expect(() => {
      validateCommon({ ...base, colors: ["#fff"], loop: { duration: 2 } });
    }).not.toThrow();
  });
  it("loopTime wraps into [0, duration) and passes through without a loop", () => {
    expect(loopTime(5, undefined)).toBe(5);
    expect(loopTime(5, { duration: 2 })).toBe(1);
    expect(loopTime(-0.5, { duration: 2 })).toBe(1.5);
    expect(loopTime(2, { duration: 2 })).toBe(0);
  });
});

describe("createRuntime", () => {
  let dom: FakeDom;
  beforeEach(() => {
    dom = installFakeDom({ dpr: 2 });
  });
  afterEach(() => {
    dom.restore();
    document.body.innerHTML = "";
  });

  it("creates nothing until start(); start() initialises, sizes from the parent and schedules a frame", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    expect(r.calls).toEqual([]);
    expect(handle.running).toBe(false);
    expect(handle.canvas).toBe(canvas);
    handle.start();
    expect(handle.running).toBe(true);
    expect(dom.resizeObservers).toBe(1);
    expect(dom.intersectionObservers).toBe(1);
    // jsdom's parent rect is 0×0 → clamped to 1×1 CSS px at dpr 2.
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(2);
    expect(canvas.style.width).toBe("1px");
    expect(r.calls).toEqual(["init CANVAS", "resize 2"]);
    expect(dom.pending()).toBe(1);
    handle.start(); // idempotent
    expect(dom.pending()).toBe(1);
  });

  it("the loop is renderAt(elapsed × speed) and the fps cap skips frames", () => {
    const canvas = mount();
    const { handle, r } = make(canvas, { speed: 2, fps: 30 });
    handle.start();
    dom.frame(16); // 32ms virtual → drawn (first frame)
    dom.frame(16); // skipped (16ms < 1000/30 - 1)
    dom.frame(17); // 33ms since the last draw >= 1000/30 - 1: drawn at 98ms virtual
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 0.032",
      "draw 0.098",
    ]);
    expect(dom.pending()).toBe(1);
  });

  it("ResizeObserver entries resize the canvas with the capped DPR", () => {
    const canvas = mount();
    const { handle, r } = make(canvas, { maxDpr: 1.5 });
    handle.start();
    dom.resize(300.4, 420);
    expect(canvas.width).toBe(451); // round(300.4 × 1.5)
    expect(canvas.height).toBe(630);
    expect(canvas.style.height).toBe("420px");
    expect(r.calls.at(-1)).toBe("resize 1.5");
  });

  it("renderAt() initialises lazily, wraps with loop and never touches the clock", () => {
    const canvas = mount();
    const { handle, r } = make(canvas, { loop: { duration: 2 } });
    expect(handle.duration).toBe(2);
    handle.renderAt(5);
    handle.renderAt(5);
    expect(r.calls).toEqual([
      "init CANVAS",
      "resize 2",
      "draw 1.000",
      "draw 1.000",
    ]);
    expect(handle.running).toBe(false);
    expect(dom.pending()).toBe(0);
  });

  it("a detached canvas keeps its own width/height and dpr 1", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const { handle, r } = make(canvas);
    handle.renderAt(0);
    expect(canvas.width).toBe(640);
    expect(r.calls).toEqual(["init CANVAS", "resize 1", "draw 0.000"]);
    expect(dom.resizeObservers).toBe(0);
  });

  it("autoPause pauses on out-of-view and document.hidden, resumes without a time jump", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    dom.frame(16);
    dom.intersect(false);
    dom.frame(16); // tick runs, sees paused, draws nothing, schedules nothing
    expect(dom.pending()).toBe(0);
    dom.frame(1000); // time passes while paused
    dom.intersect(true);
    expect(dom.pending()).toBe(1);
    dom.frame(16);
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 0.016",
      "draw 0.032",
    ]);
    dom.hidden(true);
    dom.frame(16);
    expect(dom.pending()).toBe(0);
    dom.hidden(false);
    expect(dom.pending()).toBe(1);
  });

  it("autoPause: false ignores visibility and creates no IntersectionObserver", () => {
    const canvas = mount();
    const { handle, r } = make(canvas, { autoPause: false });
    handle.start();
    expect(dom.intersectionObservers).toBe(0);
    dom.hidden(true);
    dom.frame(16);
    expect(r.calls.filter((c) => c.startsWith("draw"))).toHaveLength(1);
    expect(dom.pending()).toBe(1);
  });

  it("prefers-reduced-motion renders one static frame, redraws on resize and update, never loops", () => {
    dom.restore();
    dom = installFakeDom({ reducedMotion: true });
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    expect(handle.running).toBe(true);
    expect(dom.pending()).toBe(0);
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual(["draw 0.000"]);
    dom.resize(100, 50);
    handle.update({ size: 3 });
    expect(r.calls.filter((c) => c.startsWith("draw"))).toHaveLength(3);
  });

  it("update merges, validates and leaves a running loop untouched", () => {
    const canvas = mount();
    const { handle, opts } = make(canvas);
    handle.start();
    handle.update({ speed: 0.5, size: undefined });
    expect(opts.speed).toBe(0.5);
    expect(opts.size).toBe(1);
    expect(() => {
      handle.update({ size: -1 });
    }).toThrow(VisError);
    expect(() => {
      handle.update({ speed: Number.POSITIVE_INFINITY });
    }).toThrow(VisError);
    expect(dom.pending()).toBe(1);
  });

  it("stop() cancels the frame and observers; a stopped handle redraws the last time on resize", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    dom.frame(16);
    handle.stop();
    expect(handle.running).toBe(false);
    expect(dom.pending()).toBe(0);
    dom.resize(10, 10);
    expect(r.calls.at(-1)).toBe("draw 0.016");
    const drawn = r.calls.length;
    handle.stop(); // idempotent: no extra draw, nothing rescheduled
    expect(handle.running).toBe(false);
    expect(dom.pending()).toBe(0);
    expect(r.calls).toHaveLength(drawn);
  });

  it("destroy() disposes once and makes start()/renderAt() throw", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    handle.destroy();
    handle.destroy();
    expect(r.calls.filter((c) => c === "dispose")).toHaveLength(1);
    expect(() => {
      handle.start();
    }).toThrow(/destroyed/);
    expect(() => {
      handle.renderAt(0);
    }).toThrow(VisError);
    expect(() => {
      handle.update({});
    }).not.toThrow();
  });

  it("treats a zero devicePixelRatio as 1", () => {
    dom.restore();
    dom = installFakeDom({ dpr: 0 });
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.renderAt(0);
    expect(r.calls).toContain("resize 1");
    expect(canvas.width).toBe(1);
  });

  it("a rejected update() leaves the options and the running loop untouched", () => {
    const canvas = mount();
    const { handle, r, opts } = make(canvas);
    handle.start();
    dom.frame(16);
    expect(() => {
      handle.update({ speed: Number.POSITIVE_INFINITY });
    }).toThrow(VisError);
    expect(() => {
      handle.update({ speed: 3, size: -1 });
    }).toThrow(VisError);
    expect(opts.speed).toBe(1);
    expect(opts.size).toBe(1);
    dom.frame(16);
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 0.016",
      "draw 0.032",
    ]);
  });

  it("a resize after renderAt(t) redraws t, not the loop clock", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.renderAt(5);
    dom.resize(10, 10); // the observer's notification clears the canvas
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 5.000",
      "draw 5.000",
    ]);
  });

  it("restarting under reduced motion repaints the static frame, never the old loop time", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    dom.frame(500);
    handle.stop();
    (globalThis as unknown as Record<string, unknown>).matchMedia = () => ({
      matches: true,
    });
    handle.start();
    dom.resize(5, 5);
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 0.500",
      "draw 0.000",
      "draw 0.000",
    ]);
  });

  it("update() after destroy() never draws, even under reduced motion", () => {
    dom.restore();
    dom = installFakeDom({ reducedMotion: true });
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    handle.destroy();
    handle.update({ speed: 2 });
    expect(r.calls.at(-1)).toBe("dispose");
  });

  it("start() after a stop() while hidden reads document.hidden again and runs", () => {
    const canvas = mount();
    const { handle } = make(canvas);
    handle.start();
    dom.frame(16);
    dom.hidden(true);
    handle.stop();
    dom.hidden(false); // no listener is attached while stopped
    handle.start();
    expect(dom.pending()).toBe(1);
  });

  it("update({ autoPause: false }) while auto-paused restarts the loop", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    dom.frame(16);
    dom.intersect(false);
    dom.frame(16);
    expect(dom.pending()).toBe(0);
    dom.frame(1000);
    handle.update({ autoPause: false });
    expect(dom.pending()).toBe(1);
    dom.frame(16);
    expect(r.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 0.016",
      "draw 0.032",
    ]);
  });

  it("destroy() before any init does not dispose", () => {
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.destroy();
    expect(r.calls).toEqual([]);
  });

  it("works without ResizeObserver / IntersectionObserver / matchMedia", () => {
    dom.restore();
    dom = installFakeDom({ observers: false });
    delete (globalThis as unknown as Record<string, unknown>).matchMedia;
    const canvas = mount();
    const { handle, r } = make(canvas);
    handle.start();
    expect(r.calls).toEqual(["init CANVAS", "resize 1"]);
    dom.frame(16);
    expect(r.calls.at(-1)).toBe("draw 0.016");
  });
});
