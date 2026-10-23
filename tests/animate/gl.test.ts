// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  FULLSCREEN_VERT,
  createGlRuntime,
  createProgram,
  drawFullscreen,
  getGl,
  glRenderer,
  uniformSetters,
} from "../../src/animate/gl.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";
import { installFakeGl, type FakeGl } from "./fake-gl.js";

function first(fake: ReturnType<typeof installFakeGl>): FakeGl {
  const gl = fake.gls[0];
  if (!gl) throw new Error("no WebGL context was requested");
  return gl;
}

const FRAG =
  "#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){o=vec4(1.0);}";

describe("getGl / createProgram", () => {
  let fake: ReturnType<typeof installFakeGl>;
  afterEach(() => {
    fake.restore();
  });

  it("requests webgl2 with alpha and the given premultipliedAlpha", () => {
    fake = installFakeGl();
    const canvas = document.createElement("canvas");
    const gl = getGl(canvas, false);
    expect(first(fake).attrs).toEqual({
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    // No powerPreference: the browser's default, so a discrete GPU is not woken for a background.
    expect(first(fake).attrs).not.toHaveProperty("powerPreference");
    expect(gl).toBe(first(fake));
  });

  it("reuses the canvas context for the same alpha mode, and refuses the other one (M1)", () => {
    fake = installFakeGl();
    const canvas = document.createElement("canvas");
    const gl = getGl(canvas, true);
    expect(getGl(canvas, true)).toBe(gl);
    expect(fake.gls).toHaveLength(1);
    expect(() => getGl(canvas, false)).toThrow(VisError);
    expect(() => getGl(canvas, false)).toThrow(
      /^premultipliedAlpha: this canvas already has a context created with premultipliedAlpha true; use a fresh canvas/,
    );
  });

  it("does not compare alpha modes on a lost context (it has no attributes)", () => {
    fake = installFakeGl();
    const canvas = document.createElement("canvas");
    const gl = getGl(canvas, true);
    first(fake).lost = true;
    expect(getGl(canvas, false)).toBe(gl);
  });

  it("throws VisError when WebGL2 is unavailable", () => {
    fake = installFakeGl({ webgl2: false });
    expect(() => getGl(document.createElement("canvas"), true)).toThrow(
      /WebGL2 is not available/,
    );
  });

  it("compiles the fullscreen-triangle vertex shader plus the fragment and links", () => {
    fake = installFakeGl();
    const gl = getGl(document.createElement("canvas"), true);
    const prog = createProgram(gl, FULLSCREEN_VERT, FRAG);
    const p = uniformSetters(gl, prog);
    expect(p.program).toBe(prog);
    expect(FULLSCREEN_VERT.startsWith("#version 300 es")).toBe(true);
    expect(FULLSCREEN_VERT).toContain("gl_VertexID");
    expect(first(fake).calls).toEqual([
      "createShader vertex",
      "compileShader",
      "createShader fragment",
      "compileShader",
      "createProgram",
      "linkProgram",
      "deleteShader",
      "deleteShader",
    ]);
    p.f1("a", 1);
    p.f2("b", 1, 2);
    p.f3("c", 1, 2, 3);
    p.i1("d", 4);
    p.f1("a", 5);
    // locations are cached per name
    expect(
      first(fake).calls.filter((c) => c.startsWith("getUniformLocation")),
    ).toEqual([
      "getUniformLocation a",
      "getUniformLocation b",
      "getUniformLocation c",
      "getUniformLocation d",
    ]);
    expect(first(fake).calls.filter((c) => c.startsWith("uniform"))).toEqual([
      "uniform1f a 1",
      "uniform2f b 1 2",
      "uniform3f c 1 2 3",
      "uniform1i d 4",
      "uniform1f a 5",
    ]);
    drawFullscreen(gl);
    expect(first(fake).calls.at(-1)).toBe("drawArrays 4 0 3");
  });

  it("a canvas whose context was lost fails visibly instead of drawing nothing", () => {
    fake = installFakeGl();
    const canvas = document.createElement("canvas");
    const gl = getGl(canvas, true);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    expect(() =>
      createProgram(getGl(canvas, true), FULLSCREEN_VERT, FRAG),
    ).toThrow(/could not create the vertex shader/);
    expect(gl).toBe(first(fake)); // the same context object comes back for the same canvas
  });

  it("frees the vertex shader when only the fragment stage fails to compile", () => {
    fake = installFakeGl();
    const gl = getGl(document.createElement("canvas"), true);
    first(fake).compileOk = false;
    first(fake).compileFailsOn = "fragment";
    expect(() => createProgram(gl, FULLSCREEN_VERT, FRAG)).toThrow(
      /fragment shader failed to compile/,
    );
    expect(first(fake).calls.filter((c) => c === "deleteShader")).toHaveLength(
      2,
    );
    expect(first(fake).calls).not.toContain("createProgram");
  });

  it("reports compile and link failures with the info log and frees the objects", () => {
    fake = installFakeGl();
    const gl = getGl(document.createElement("canvas"), true);
    first(fake).compileOk = false;
    expect(() => createProgram(gl, FULLSCREEN_VERT, FRAG)).toThrow(
      /vertex shader failed to compile: fake: compile error/,
    );
    expect(first(fake).calls.at(-1)).toBe("deleteShader");
    first(fake).compileOk = true;
    first(fake).linkOk = false;
    expect(() => createProgram(gl, FULLSCREEN_VERT, FRAG)).toThrow(
      /program failed to link: fake: link error/,
    );
    expect(first(fake).calls.at(-1)).toBe("deleteProgram");
    first(fake).infoLog = null; // a driver with no log still yields a readable error
    expect(() => createProgram(gl, FULLSCREEN_VERT, FRAG)).toThrow(
      /program failed to link: $/,
    );
    first(fake).linkOk = true;
    first(fake).compileOk = false;
    expect(() => createProgram(gl, FULLSCREEN_VERT, FRAG)).toThrow(
      /vertex shader failed to compile: $/,
    );
  });
});

describe("glRenderer", () => {
  let fake: ReturnType<typeof installFakeGl>;
  beforeEach(() => {
    fake = installFakeGl();
  });
  afterEach(() => {
    fake.restore();
  });

  function setup(blend: boolean, existing?: HTMLCanvasElement) {
    const canvas = existing ?? document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 10;
    const uploads: string[] = [];
    const r = glRenderer({
      fragment: FRAG,
      premultipliedAlpha: !blend,
      blend,
      uniforms: (p, t, w, h, dpr) => {
        uploads.push(`${t} ${w} ${h} ${dpr}`);
        p.f1("time", t);
      },
    });
    return { canvas, r, uploads };
  }

  it("draws a fullscreen triangle with viewport, clear and the effect's uniforms", () => {
    const { canvas, r, uploads } = setup(false);
    r.init(canvas);
    r.resize(2);
    r.draw(1.5);
    const gl = first(fake);
    expect(gl.attrs?.premultipliedAlpha).toBe(true);
    expect(uploads).toEqual(["1.5 20 10 2"]);
    // uniforms() runs after useProgram, so the cached-location lookup sits between the state calls and the draw.
    expect(gl.calls.slice(-8)).toEqual([
      "useProgram",
      "viewport 0 0 20 10",
      "clearColor 0 0 0 0",
      `clear ${gl.COLOR_BUFFER_BIT}`,
      `disable ${gl.BLEND}`,
      "getUniformLocation time",
      "uniform1f time 1.5",
      "drawArrays 4 0 3",
    ]);
  });

  it("enables non-premultiplied alpha blending when asked", () => {
    const { canvas, r } = setup(true);
    r.init(canvas);
    r.resize(1);
    r.draw(0);
    const gl = first(fake);
    expect(gl.calls).toContain(`enable ${gl.BLEND}`);
    expect(gl.calls).toContain(
      `blendFuncSeparate ${gl.SRC_ALPHA} ${gl.ONE_MINUS_SRC_ALPHA} ${gl.ONE} ${gl.ONE_MINUS_SRC_ALPHA}`,
    );
  });

  it("stops drawing on webglcontextlost (preventDefault) and rebuilds and repaints on restored", () => {
    const { canvas, r, uploads } = setup(false);
    r.init(canvas);
    r.resize(1);
    r.draw(0.5);
    expect(uploads).toEqual(["0.5 20 10 1"]);
    const gl = first(fake);
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    r.draw(1); // the fake still reports a live context: only the event stops this draw
    expect(uploads).toEqual(["0.5 20 10 1"]);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(gl.programs).toBe(2);
    // The loss cleared the buffer and nothing is looping: the restore repaints the latest requested frame.
    expect(uploads).toEqual(["0.5 20 10 1", "1 20 10 1"]);
    r.draw(2);
    expect(uploads.at(-1)).toBe("2 20 10 1");
    gl.lost = true; // a lost context that fired no event is still skipped
    r.draw(3);
    expect(uploads).toHaveLength(3);
  });

  it("dispose after a failed init (no WebGL2) does not throw", () => {
    fake.restore();
    fake = installFakeGl({ webgl2: false });
    const { canvas, r } = setup(false);
    expect(() => {
      r.init(canvas);
    }).toThrow(VisError);
    expect(() => {
      r.dispose();
    }).not.toThrow();
  });

  it("dispose while the context is lost has no program to delete", () => {
    const { canvas, r } = setup(false);
    r.init(canvas);
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    r.dispose();
    expect(first(fake).calls).not.toContain("deleteProgram");
    expect(first(fake).calls).not.toContain("loseContext");
  });

  it("draw() before init is a no-op and dispose releases the program and listeners, not the canvas's context", () => {
    const { canvas, r, uploads } = setup(false);
    r.draw(0);
    expect(uploads).toEqual([]);
    r.init(canvas);
    r.dispose();
    const gl = first(fake);
    expect(gl.calls.at(-1)).toBe("deleteProgram");
    expect(gl.calls).not.toContain("loseContext");
    expect(gl.lost).toBe(false);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(gl.programs).toBe(1); // listener removed → no rebuild
    r.dispose(); // idempotent
  });

  it("create, destroy, create again on the SAME canvas draws again (React StrictMode, effect switching)", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 10;
    const first1 = setup(false, canvas);
    first1.r.init(canvas);
    first1.r.draw(1);
    first1.r.dispose();
    const second = setup(false, canvas);
    second.r.init(canvas);
    second.r.draw(2);
    expect(first1.uploads).toEqual(["1 20 10 1"]);
    expect(second.uploads).toEqual(["2 20 10 1"]);
    expect(fake.gls).toHaveLength(1); // one context per canvas, reused
    expect(first(fake).lost).toBe(false);
  });
});

describe("createGlRuntime (hook form)", () => {
  let fake: ReturnType<typeof installFakeGl>;
  let dom: FakeDom;
  beforeEach(() => {
    fake = installFakeGl();
    dom = installFakeDom({ dpr: 1 });
  });
  afterEach(() => {
    fake.restore();
    dom.restore();
    document.body.innerHTML = "";
  });

  it("setup on first renderAt, render per frame with the device size, setup again after restore, teardown on destroy", () => {
    const parent = document.createElement("div");
    const canvas = document.createElement("canvas");
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    const log: string[] = [];
    const h = createGlRuntime(
      canvas,
      {
        setup: () => log.push("setup"),
        render: (_gl, t, w, hh) => log.push(`render ${t} ${w} ${hh}`),
        teardown: () => log.push("teardown"),
      },
      { loop: { duration: 2 } },
    );
    expect(fake.gls).toHaveLength(0);
    expect(h.duration).toBe(2);
    h.renderAt(3); // wraps to 1
    expect(log).toEqual(["setup", "render 1 1 1"]);
    expect(first(fake).attrs?.premultipliedAlpha).toBe(true);
    expect(first(fake).calls).toContain("viewport 0 0 1 1");
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    h.renderAt(0.5); // nothing while lost
    expect(log).toHaveLength(2);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    // Setup again, then a repaint of the latest requested frame (the handle is not looping).
    expect(log.slice(2)).toEqual(["setup", "render 0.5 1 1"]);
    h.renderAt(0.25);
    expect(log.at(-1)).toBe("render 0.25 1 1");
    first(fake).lost = true; // lost without an event
    h.renderAt(0.75);
    expect(log).toHaveLength(5);
    first(fake).lost = false;
    h.destroy();
    expect(log.at(-1)).toBe("teardown");
    expect(first(fake).calls).not.toContain("loseContext");
  });

  it("destroy after a failed init (no WebGL2) does not throw", () => {
    fake.restore();
    fake = installFakeGl({ webgl2: false });
    const h = createGlRuntime(document.createElement("canvas"), {
      setup: () => undefined,
      render: () => undefined,
    });
    expect(() => {
      h.renderAt(0);
    }).toThrow(VisError);
    expect(() => {
      h.destroy();
    }).not.toThrow();
  });

  it("teardown is optional; common options are validated", () => {
    const canvas = document.createElement("canvas");
    expect(() =>
      createGlRuntime(
        canvas,
        { setup: () => undefined, render: () => undefined },
        { fps: 0 },
      ),
    ).toThrow(VisError);
    const h = createGlRuntime(canvas, {
      setup: () => undefined,
      render: () => undefined,
    });
    h.renderAt(0);
    h.destroy();
    expect(first(fake).calls).not.toContain("loseContext");
  });

  it("create, destroy, create again on the SAME canvas renders again (React StrictMode, effect switching)", () => {
    const canvas = document.createElement("canvas");
    const log: string[] = [];
    const hooks = (tag: string) => ({
      setup: () => log.push(`${tag} setup`),
      render: () => log.push(`${tag} render`),
      teardown: () => log.push(`${tag} teardown`),
    });
    const a = createGlRuntime(canvas, hooks("a"));
    a.renderAt(0);
    a.destroy();
    const b = createGlRuntime(canvas, hooks("b"));
    b.renderAt(0);
    expect(log).toEqual([
      "a setup",
      "a render",
      "a teardown",
      "b setup",
      "b render",
    ]);
    expect(fake.gls).toHaveLength(1);
    expect(first(fake).lost).toBe(false);
  });

  it("teardown still runs when setup threw, so it must tolerate partial setup", () => {
    const canvas = document.createElement("canvas");
    const log: string[] = [];
    const h = createGlRuntime(canvas, {
      setup: () => {
        throw new VisError("bad shader");
      },
      render: () => log.push("render"),
      teardown: () => log.push("teardown"),
    });
    expect(() => {
      h.renderAt(0);
    }).toThrow(/bad shader/);
    h.destroy();
    expect(log).toEqual(["teardown"]);
  });
});
