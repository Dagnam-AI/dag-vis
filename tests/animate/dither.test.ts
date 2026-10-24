// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { DITHER_DEFAULTS, createDither } from "../../src/animate/dither.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";
import { installFakeGl, type FakeGl } from "./fake-gl.js";

function first(fake: ReturnType<typeof installFakeGl>): FakeGl {
  const gl = fake.gls[0];
  if (!gl) throw new Error("no WebGL context was requested");
  return gl;
}

const uniforms = (calls: string[]) =>
  calls.filter((c) => c.startsWith("uniform"));

/** The resize repaints the frame first: the frame under test is the second half, and the two must match. */
const lastFrame = (u: string[]): string[] => {
  const half = u.length / 2;
  expect(u.slice(0, half)).toEqual(u.slice(half));
  return u.slice(half);
};

describe("createDither", () => {
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

  it("creates no context before start and uploads today's defaults at t = 0", () => {
    const h = createDither(canvas);
    expect(fake.gls).toHaveLength(0);
    h.start();
    dom.resize(100, 50);
    dom.frame(0);
    const gl = first(fake);
    expect(gl.attrs).toMatchObject({ premultipliedAlpha: true });
    expect(gl.calls).toContain(`disable ${gl.BLEND}`);
    expect(lastFrame(uniforms(gl.calls))).toEqual([
      "uniform2f resolution 200 100",
      "uniform1f time 0",
      `uniform1f waveSpeed ${DITHER_DEFAULTS.waveSpeed}`,
      "uniform1f waveFrequency 3",
      `uniform1f waveAmplitude ${DITHER_DEFAULTS.waveAmplitude}`,
      "uniform3f waveColor 0.5019607843137255 0.5019607843137255 0.5019607843137255",
      "uniform1f colorNum 4",
      "uniform1f pixelSize 4", // 2 CSS px × dpr 2
    ]);
  });

  it("maps the landing Free card props (0.15 / 0.1) and scales time by speed", () => {
    const h = createDither(canvas, {
      waveSpeed: 0.15,
      waveAmplitude: 0.1,
      colorNum: 4,
      pixelSize: 1,
      color: "#e64040",
      speed: 2,
    });
    h.start();
    dom.frame(500);
    const u = uniforms(first(fake).calls);
    expect(u).toContain("uniform1f time 1");
    expect(u).toContain("uniform1f waveSpeed 0.15");
    expect(u).toContain("uniform1f waveAmplitude 0.1");
    expect(u).toContain("uniform1f pixelSize 2");
    expect(u.find((c) => c.startsWith("uniform3f waveColor"))).toBe(
      "uniform3f waveColor 0.9019607843137255 0.25098039215686274 0.25098039215686274",
    );
  });

  it("falls back to colors[0] when color is absent and update() changes uniforms on the next frame", () => {
    const h = createDither(canvas, { colors: ["#ff0000"] });
    h.start();
    dom.frame(16);
    expect(uniforms(first(fake).calls)).toContain("uniform3f waveColor 1 0 0");
    h.update({ waveSpeed: 0.2, color: "#00ff00" });
    dom.frame(16);
    expect(uniforms(first(fake).calls).slice(-6)).toContain(
      "uniform1f waveSpeed 0.2",
    );
    expect(uniforms(first(fake).calls).at(-3)).toBe(
      "uniform3f waveColor 0 1 0",
    );
  });

  it("update({ colors }) takes effect: the colors[0] fallback is resolved at draw time", () => {
    const waveColor = (): string | undefined =>
      uniforms(first(fake).calls)
        .filter((c) => c.startsWith("uniform3f waveColor"))
        .at(-1);
    const h = createDither(canvas, { colors: ["#ff0000"] });
    h.start();
    dom.frame(16);
    expect(waveColor()).toBe("uniform3f waveColor 1 0 0");
    h.update({ colors: ["#00ff00"] });
    dom.frame(16);
    expect(waveColor()).toBe("uniform3f waveColor 0 1 0");
    // an explicit color still wins over the palette
    h.update({ color: "#0000ff" });
    dom.frame(16);
    expect(waveColor()).toBe("uniform3f waveColor 0 0 1");
    h.update({ colors: ["#ffffff"] });
    dom.frame(16);
    expect(waveColor()).toBe("uniform3f waveColor 0 0 1");
  });

  it("update({ colors }) also reaches a dither created with neither color nor colors", () => {
    const h = createDither(canvas);
    h.renderAt(0);
    h.update({ colors: ["#ff0000"] });
    h.renderAt(0);
    expect(
      uniforms(first(fake).calls)
        .filter((c) => c.startsWith("uniform3f waveColor"))
        .at(-1),
    ).toBe("uniform3f waveColor 1 0 0");
  });

  it("names the offending option in a bad-colour error", () => {
    expect(() => createDither(canvas, { color: "not-a-colour" })).toThrow(
      /^color: invalid colour/,
    );
    expect(() =>
      createDither(canvas, { color: [1, 0, 0] as unknown as string }),
    ).toThrow(/^color: colour must be a string/);
    expect(() => createDither(canvas, { colors: ["#fff", "nope"] })).toThrow(
      /^colors\[1\]: invalid colour/,
    );
    const h = createDither(canvas);
    expect(() => {
      h.update({ colors: ["bad"] });
    }).toThrow(/^colors\[0\]/);
  });

  it("renderAt is deterministic and honours loop", () => {
    const a = createDither(canvas, { loop: { duration: 4 } });
    a.renderAt(5.25);
    const firstFrame = uniforms(first(fake).calls);
    a.renderAt(1.25);
    expect(uniforms(first(fake).calls).slice(firstFrame.length)).toEqual(
      firstFrame,
    );
    expect(firstFrame).toContain("uniform1f time 1.25");
  });

  it("exports frozen defaults a consumer cannot mutate", () => {
    expect(Object.isFrozen(DITHER_DEFAULTS)).toBe(true);
    expect(() => {
      // @ts-expect-error readonly: the fallback colour of every live effect
      DITHER_DEFAULTS.color = "#000000";
    }).toThrow(TypeError);
    expect(DITHER_DEFAULTS.color).toBe("#808080");
  });

  it("validates its own options", () => {
    expect(() => createDither(canvas, { colorNum: 1 })).toThrow(/colorNum/);
    expect(() => createDither(canvas, { pixelSize: 0 })).toThrow(VisError);
    expect(() => createDither(canvas, { waveFrequency: 0 })).toThrow(
      /waveFrequency/,
    );
    expect(() => createDither(canvas, { waveSpeed: -1 })).toThrow(/waveSpeed/);
    expect(() => createDither(canvas, { waveAmplitude: -0.1 })).toThrow(
      /waveAmplitude/,
    );
    expect(() => createDither(canvas, { color: "not-a-colour" })).toThrow(
      VisError,
    );
    const h = createDither(canvas);
    expect(() => {
      h.update({ colorNum: Number.NaN });
    }).toThrow(VisError);
  });

  it("a rejected update leaves the uniforms of the next frame unchanged", () => {
    const h = createDither(canvas, { colorNum: 4, waveSpeed: 0.5 });
    h.renderAt(0);
    const gl = first(fake);
    const frame = () => {
      gl.calls.length = 0;
      h.renderAt(0);
      return uniforms(gl.calls);
    };
    const before = frame();
    expect(() => {
      h.update({ colorNum: Number.NaN, waveSpeed: 9 });
    }).toThrow(VisError);
    expect(frame()).toEqual(before);
  });

  it("destroy() deletes its program but keeps the context, so the same canvas can host a new dither", () => {
    const h = createDither(canvas);
    h.start();
    h.destroy();
    const gl = first(fake);
    expect(gl.calls.at(-1)).toBe("deleteProgram");
    expect(gl.calls).not.toContain("loseContext");
    const again = createDither(canvas);
    const before = gl.calls.length;
    again.renderAt(0);
    expect(gl.calls.slice(before)).toContain("drawArrays 4 0 3");
    expect(fake.gls).toHaveLength(1);
  });
});
