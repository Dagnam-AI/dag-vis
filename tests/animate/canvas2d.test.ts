// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { canvas2dRenderer } from "../../src/animate/canvas2d.js";
import { installFakeGl } from "./fake-gl.js";

describe("canvas2dRenderer", () => {
  let fake: ReturnType<typeof installFakeGl>;
  beforeEach(() => {
    fake = installFakeGl();
  });
  afterEach(() => {
    fake.restore();
  });

  it("hands the 2D context, CSS size, dpr and t to the draw callback", () => {
    const seen: string[] = [];
    const r = canvas2dRenderer((ctx, w, h, dpr, t) => {
      seen.push(`${ctx.canvas.tagName} ${w} ${h} ${dpr} ${t}`);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    r.draw(0); // before init: nothing to draw on
    r.init(canvas);
    r.resize(2);
    r.draw(1.5);
    expect(seen).toEqual(["CANVAS 100 50 2 1.5"]);
    r.dispose();
    r.draw(2);
    expect(seen).toHaveLength(1);
  });

  it("defaults to dpr 1 until the runtime resizes it", () => {
    const seen: string[] = [];
    const r = canvas2dRenderer((_c, w, h, dpr) => {
      seen.push(`${w} ${h} ${dpr}`);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 30;
    canvas.height = 20;
    r.init(canvas);
    r.draw(0);
    expect(seen).toEqual(["30 20 1"]);
  });

  it("can be re-initialised on the same canvas after dispose", () => {
    const seen: number[] = [];
    const r = canvas2dRenderer((_c, _w, _h, _d, t) => {
      seen.push(t);
    });
    const canvas = document.createElement("canvas");
    r.init(canvas);
    r.dispose();
    r.init(canvas);
    r.draw(3);
    expect(seen).toEqual([3]);
  });

  it("throws VisError when the 2D context is unavailable", () => {
    fake.restore();
    fake = installFakeGl({ canvas2d: false });
    const r = canvas2dRenderer(() => undefined);
    const canvas = document.createElement("canvas");
    expect(() => {
      r.init(canvas);
    }).toThrow(VisError);
    expect(() => {
      r.init(canvas);
    }).toThrow(/Canvas 2D is not available/);
  });
});
