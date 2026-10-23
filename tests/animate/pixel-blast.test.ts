// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError, createRng } from "../../src/core/index.js";
import {
  PIXEL_BLAST_DEFAULTS,
  createPixelBlast,
} from "../../src/animate/pixel-blast.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";
import { installFakeGl, type FakeGl } from "./fake-gl.js";

function first(fake: ReturnType<typeof installFakeGl>): FakeGl {
  const gl = fake.gls[0];
  if (!gl) throw new Error("no WebGL context was requested");
  return gl;
}

const uniforms = (calls: string[]) =>
  calls.filter((c) => c.startsWith("uniform"));

describe("createPixelBlast", () => {
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

  const colour = (): string | undefined =>
    uniforms(first(fake).calls)
      .filter((c) => c.startsWith("uniform3f uColor"))
      .at(-1);

  it("uploads today's defaults with a seeded time offset, blending and premultiplied alpha", () => {
    const h = createPixelBlast(canvas);
    h.start();
    dom.resize(100, 50);
    dom.frame(0);
    const gl = first(fake);
    const offset = createRng(1).next() * 1000;
    expect(gl.attrs).toMatchObject({ premultipliedAlpha: true });
    expect(gl.calls).toContain(
      `blendFuncSeparate ${String(gl.SRC_ALPHA)} ${String(gl.ONE_MINUS_SRC_ALPHA)} ${String(gl.ONE)} ${String(gl.ONE_MINUS_SRC_ALPHA)}`,
    );
    expect(uniforms(gl.calls)).toEqual([
      "uniform2f uResolution 200 100",
      `uniform1f uTime ${String(offset)}`,
      "uniform3f uColor 0.7058823529411765 0.592156862745098 0.8117647058823529",
      `uniform1f uPixelSize ${String(PIXEL_BLAST_DEFAULTS.pixelSize * 2)}`,
      "uniform1f uScale 2",
      "uniform1f uDensity 1",
      "uniform1f uEdgeFade 0.5",
      "uniform1i uShapeType 0",
    ]);
  });

  it("maps the landing Pro card props and folds today's speed 0.5 into time", () => {
    const h = createPixelBlast(canvas, {
      color: "#ef4444",
      patternDensity: 2,
      pixelSize: 4,
      edgeFade: 0.4,
      seed: 7,
      speed: 2,
    });
    h.start();
    dom.frame(1000); // 1 s wall × speed 2 = 2 s virtual → uTime = offset + 0.5 × 2
    const u = uniforms(first(fake).calls);
    expect(u).toContain(
      `uniform1f uTime ${String(createRng(7).next() * 1000 + 1)}`,
    );
    expect(u).toContain("uniform1f uDensity 2");
    expect(u).toContain("uniform1f uPixelSize 8");
    expect(u).toContain("uniform1f uEdgeFade 0.4");
    expect(colour()).toBe(
      "uniform3f uColor 0.9372549019607843 0.26666666666666666 0.26666666666666666",
    );
  });

  it("maps every shape and accepts colors[0] as the colour", () => {
    const shapes = { square: 0, circle: 1, triangle: 2, diamond: 3 } as const;
    for (const [shape, code] of Object.entries(shapes)) {
      document.body.innerHTML = "";
      const parent = document.createElement("div");
      const c = document.createElement("canvas");
      parent.appendChild(c);
      document.body.appendChild(parent);
      const h = createPixelBlast(c, {
        shape: shape as keyof typeof shapes,
        colors: ["#000000"],
      });
      h.renderAt(0);
      const gl = fake.gls.at(-1);
      if (!gl) throw new Error("no WebGL context was requested");
      const u = uniforms(gl.calls);
      expect(u).toContain(`uniform1i uShapeType ${String(code)}`);
      expect(u).toContain("uniform3f uColor 0 0 0");
    }
  });

  it("update({ colors }) takes effect: the colors[0] fallback is resolved at draw time (E4)", () => {
    const h = createPixelBlast(canvas, { colors: ["#ff0000"] });
    h.renderAt(0);
    expect(colour()).toBe("uniform3f uColor 1 0 0");
    h.update({ colors: ["#00ff00"] });
    h.renderAt(0);
    expect(colour()).toBe("uniform3f uColor 0 1 0");
    // an explicit color still wins over the palette
    h.update({ color: "#0000ff" });
    h.renderAt(0);
    expect(colour()).toBe("uniform3f uColor 0 0 1");
    h.update({ colors: ["#ffffff"] });
    h.renderAt(0);
    expect(colour()).toBe("uniform3f uColor 0 0 1");
  });

  it("update({ colors }) also reaches a blast created with neither color nor colors", () => {
    const h = createPixelBlast(canvas);
    h.renderAt(0);
    h.update({ colors: ["#ff0000"] });
    h.renderAt(0);
    expect(colour()).toBe("uniform3f uColor 1 0 0");
  });

  it("update({ seed }) re-phases a live effect", () => {
    const h = createPixelBlast(canvas, { seed: 1 });
    h.renderAt(0);
    h.update({ seed: 9 });
    h.renderAt(0);
    expect(
      uniforms(first(fake).calls)
        .filter((c) => c.startsWith("uniform1f uTime"))
        .at(-1),
    ).toBe(`uniform1f uTime ${String(createRng(9).next() * 1000)}`);
  });

  it("renderAt is deterministic and honours loop", () => {
    const h = createPixelBlast(canvas, { seed: 3, loop: { duration: 4 } });
    h.renderAt(5.5);
    const firstFrame = uniforms(first(fake).calls);
    h.renderAt(1.5);
    expect(uniforms(first(fake).calls).slice(firstFrame.length)).toEqual(
      firstFrame,
    );
    expect(firstFrame).toContain(
      `uniform1f uTime ${String(createRng(3).next() * 1000 + 0.75)}`,
    );
  });

  it("validates options and names the offending one", () => {
    expect(() =>
      createPixelBlast(canvas, { shape: "hexagon" as never }),
    ).toThrow(/shape must be one of square, circle, triangle, diamond/);
    expect(() =>
      createPixelBlast(canvas, { shape: "toString" as never }),
    ).toThrow(/shape must be one of/);
    expect(() => createPixelBlast(canvas, { pixelSize: 0 })).toThrow(VisError);
    expect(() => createPixelBlast(canvas, { patternScale: 0 })).toThrow(
      /patternScale/,
    );
    expect(() => createPixelBlast(canvas, { patternDensity: -1 })).toThrow(
      /patternDensity/,
    );
    expect(() => createPixelBlast(canvas, { edgeFade: -0.1 })).toThrow(
      /edgeFade/,
    );
    expect(() => createPixelBlast(canvas, { color: "zzz" })).toThrow(
      /^color: invalid colour/,
    );
    expect(() =>
      createPixelBlast(canvas, { color: [1, 0, 0] as unknown as string }),
    ).toThrow(/^color: colour must be a string/);
    expect(() =>
      createPixelBlast(canvas, { colors: ["#fff", "nope"] }),
    ).toThrow(/^colors\[1\]: invalid colour/);
    const h = createPixelBlast(canvas);
    expect(() => {
      h.update({ colors: ["bad"] });
    }).toThrow(/^colors\[0\]/);
    expect(() => {
      h.update({ shape: "hexagon" as never });
    }).toThrow(VisError);
  });

  it("destroy() deletes its program but keeps the context, so the same canvas can host a new blast (E1)", () => {
    const h = createPixelBlast(canvas);
    h.start();
    h.destroy();
    const gl = first(fake);
    expect(gl.calls.at(-1)).toBe("deleteProgram");
    expect(gl.calls).not.toContain("loseContext");
    const again = createPixelBlast(canvas);
    const before = gl.calls.length;
    again.renderAt(0);
    expect(gl.calls.slice(before)).toContain("drawArrays 4 0 3");
    expect(fake.gls).toHaveLength(1);
  });
});
