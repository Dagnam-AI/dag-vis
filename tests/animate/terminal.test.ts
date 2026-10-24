// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError, createRng } from "../../src/core/index.js";
import {
  TERMINAL_DEFAULTS,
  createTerminal,
} from "../../src/animate/terminal.js";
import { createDither } from "../../src/animate/dither.js";
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

describe("createTerminal", () => {
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

  const last = (prefix: string): string | undefined =>
    uniforms(first(fake).calls)
      .filter((c) => c.startsWith(prefix))
      .at(-1);

  it("uploads today's defaults, non-premultiplied and unblended", () => {
    const h = createTerminal(canvas);
    h.start();
    dom.resize(100, 50);
    dom.frame(0);
    const gl = first(fake);
    const offset = createRng(1).next() * 100;
    expect(gl.attrs).toMatchObject({ premultipliedAlpha: false });
    expect(gl.calls).toContain(`disable ${String(gl.BLEND)}`);
    expect(lastFrame(uniforms(gl.calls))).toEqual([
      `uniform1f iTime ${String(offset * TERMINAL_DEFAULTS.timeScale)}`,
      "uniform3f iResolution 200 100 2",
      "uniform1f uScale 1",
      "uniform2f uGridMul 2 1",
      "uniform1f uDigitSize 1.5",
      "uniform1f uScanlineIntensity 0.3",
      "uniform1f uGlitchAmount 1",
      "uniform1f uFlickerAmount 1",
      "uniform1f uNoiseAmp 1",
      "uniform1f uChromaticAberration 0",
      "uniform1f uDither 0",
      "uniform1f uCurvature 0.2",
      "uniform3f uTint 1 1 1",
      "uniform1f uBrightness 1",
    ]);
  });

  it("maps the landing Team card (tint) and scales time: iTime = (t + offset) × timeScale", () => {
    const h = createTerminal(canvas, { tint: "#ef4444", seed: 5, speed: 2 });
    h.start();
    dom.frame(1000);
    const u = uniforms(first(fake).calls);
    expect(u).toContain(
      `uniform1f iTime ${String((2 + createRng(5).next() * 100) * 0.3)}`,
    );
    expect(u).toContain(
      "uniform3f uTint 0.9372549019607843 0.26666666666666666 0.26666666666666666",
    );
  });

  it("accepts boolean dither and colors[0] as tint", () => {
    const h = createTerminal(canvas, { dither: true, colors: ["#000000"] });
    h.renderAt(0);
    expect(last("uniform1f uDither")).toBe("uniform1f uDither 1");
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 0 0 0");
    h.update({ dither: false });
    h.renderAt(0);
    expect(last("uniform1f uDither")).toBe("uniform1f uDither 0");
    h.update({ dither: 0.5 });
    h.renderAt(0);
    expect(last("uniform1f uDither")).toBe("uniform1f uDither 0.5");
  });

  it("update({ colors }) takes effect: the tint fallback is resolved at draw time", () => {
    const h = createTerminal(canvas, { colors: ["#ff0000"] });
    h.renderAt(0);
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 1 0 0");
    h.update({ colors: ["#00ff00"] });
    h.renderAt(0);
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 0 1 0");
    // an explicit tint still wins over the palette
    h.update({ tint: "#0000ff" });
    h.renderAt(0);
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 0 0 1");
    h.update({ colors: ["#ffffff"] });
    h.renderAt(0);
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 0 0 1");
  });

  it("update({ colors }) also reaches a terminal created with neither tint nor colors", () => {
    const h = createTerminal(canvas);
    h.renderAt(0);
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 1 1 1");
    h.update({ colors: ["#ff0000"] });
    h.renderAt(0);
    expect(last("uniform3f uTint")).toBe("uniform3f uTint 1 0 0");
  });

  it("update({ seed }) re-phases a live effect", () => {
    const h = createTerminal(canvas, { seed: 1 });
    h.renderAt(0);
    h.update({ seed: 9 });
    h.renderAt(0);
    expect(last("uniform1f iTime")).toBe(
      `uniform1f iTime ${String(createRng(9).next() * 100 * 0.3)}`,
    );
  });

  it("the exported default tuple is a valid gridMul (readonly tuples type-check)", () => {
    const h = createTerminal(canvas, { gridMul: TERMINAL_DEFAULTS.gridMul });
    h.renderAt(0);
    expect(last("uniform2f uGridMul")).toBe("uniform2f uGridMul 2 1");
  });

  it("keeps its own copy of gridMul: a caller mutating the array changes nothing", () => {
    const grid: [number, number] = [3, 4];
    const h = createTerminal(canvas, { gridMul: grid });
    grid[0] = 0; // would be invalid, and would bypass validation by reference
    h.renderAt(0);
    expect(last("uniform2f uGridMul")).toBe("uniform2f uGridMul 3 4");
    const patch: [number, number] = [5, 6];
    h.update({ gridMul: patch });
    patch[1] = -1;
    h.renderAt(0);
    expect(last("uniform2f uGridMul")).toBe("uniform2f uGridMul 5 6");
  });

  it("refuses a canvas whose context another effect created with the other alpha mode", () => {
    const d = createDither(canvas);
    d.renderAt(0);
    d.destroy();
    expect(() => {
      createTerminal(canvas).renderAt(0);
    }).toThrow(/^premultipliedAlpha: /);
    // the same alpha mode (a second dither) is fine
    expect(() => {
      createDither(canvas).renderAt(0);
    }).not.toThrow();
  });

  it("update({ timeScale, gridMul }) is read on the next frame", () => {
    const h = createTerminal(canvas, { seed: 2 });
    h.update({ timeScale: 1, gridMul: [3, 4] });
    h.renderAt(1);
    expect(last("uniform1f iTime")).toBe(
      `uniform1f iTime ${String(1 + createRng(2).next() * 100)}`,
    );
    expect(last("uniform2f uGridMul")).toBe("uniform2f uGridMul 3 4");
  });

  it("renderAt is deterministic for the same t and honours loop", () => {
    const h = createTerminal(canvas, { loop: { duration: 4 } });
    h.renderAt(3);
    const firstFrame = uniforms(first(fake).calls);
    h.renderAt(3);
    expect(uniforms(first(fake).calls).slice(firstFrame.length)).toEqual(
      firstFrame,
    );
    h.renderAt(7);
    expect(uniforms(first(fake).calls).slice(firstFrame.length * 2)).toEqual(
      firstFrame,
    );
  });

  it("exports frozen defaults a consumer cannot mutate", () => {
    expect(Object.isFrozen(TERMINAL_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(TERMINAL_DEFAULTS.gridMul)).toBe(true);
    expect(() => {
      // @ts-expect-error readonly: the fallback tint of every live effect
      TERMINAL_DEFAULTS.tint = "#000000";
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error readonly tuple: shared by every terminal's defaults
      TERMINAL_DEFAULTS.gridMul[0] = 9;
    }).toThrow(TypeError);
    expect(TERMINAL_DEFAULTS.tint).toBe("#ffffff");
    expect([...TERMINAL_DEFAULTS.gridMul]).toEqual([2, 1]);
  });

  it("validates options and names the offending one", () => {
    expect(() => createTerminal(canvas, { gridMul: [0, 1] })).toThrow(
      /gridMul\[0\]/,
    );
    expect(() => createTerminal(canvas, { gridMul: [1, -1] })).toThrow(
      /gridMul\[1\]/,
    );
    expect(() => createTerminal(canvas, { gridMul: [1] as never })).toThrow(
      /gridMul must be \[x, y\]/,
    );
    expect(() => createTerminal(canvas, { gridMul: "ab" as never })).toThrow(
      /gridMul must be \[x, y\]/,
    );
    expect(() => createTerminal(canvas, { scale: 0 })).toThrow(VisError);
    expect(() => createTerminal(canvas, { digitSize: 0 })).toThrow(/digitSize/);
    expect(() => createTerminal(canvas, { timeScale: -1 })).toThrow(
      /timeScale/,
    );
    expect(() => createTerminal(canvas, { dither: 2 })).toThrow(
      /dither must be a finite number >= 0 and <= 1/,
    );
    expect(() => createTerminal(canvas, { dither: -0.5 })).toThrow(/dither/);
    expect(() => createTerminal(canvas, { brightness: -1 })).toThrow(
      /brightness/,
    );
    expect(() => createTerminal(canvas, { tint: "nope" })).toThrow(
      /^tint: invalid colour/,
    );
    expect(() => createTerminal(canvas, { colors: ["#fff", "nope"] })).toThrow(
      /^colors\[1\]: invalid colour/,
    );
    for (const key of [
      "scanlineIntensity",
      "glitchAmount",
      "flickerAmount",
      "noiseAmp",
      "chromaticAberration",
      "curvature",
    ] as const) {
      expect(() => createTerminal(canvas, { [key]: Number.NaN })).toThrow(
        new RegExp(key),
      );
    }
    const h = createTerminal(canvas);
    expect(() => {
      h.update({ colors: ["bad"] });
    }).toThrow(/^colors\[0\]/);
    expect(() => {
      h.update({ dither: 3 });
    }).toThrow(VisError);
  });

  it("destroy() deletes its program but keeps the context, so the same canvas can host a new terminal", () => {
    const h = createTerminal(canvas);
    h.start();
    h.destroy();
    const gl = first(fake);
    expect(gl.calls.at(-1)).toBe("deleteProgram");
    expect(gl.calls).not.toContain("loseContext");
    const again = createTerminal(canvas);
    const before = gl.calls.length;
    again.renderAt(0);
    expect(gl.calls.slice(before)).toContain("drawArrays 4 0 3");
    expect(fake.gls).toHaveLength(1);
  });
});
