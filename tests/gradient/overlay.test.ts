import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient } from "../../src/gradient/index.js";
import { overlayLayer } from "../../src/gradient/overlay.js";

describe("overlay", () => {
  it("renders an <image> with opacity and blend, and a CSS url layer", () => {
    const o = overlayLayer(
      { image: "https://x/y.png", opacity: 0.5, blend: "multiply" },
      { width: 10, height: 20 },
    );
    expect(o.svg).toBe(
      '<image href="https://x/y.png" width="10" height="20" preserveAspectRatio="xMidYMid slice" opacity="0.5" style="mix-blend-mode:multiply"/>',
    );
    expect(o.cssImage).toBe('url("https://x/y.png") center / cover no-repeat');
    expect(o.cssBlend).toBe("multiply");
  });

  it("goes on top of the gradient in both outputs", () => {
    const g = gradient({
      kind: "linear",
      stops: ["#000", "#fff"],
      overlay: { image: "a.png" },
      size: { width: 10, height: 10 },
    });
    expect(g.svg).toMatch(/^<rect .*\/><image href="a.png"/);
    expect(g.css).toBe(
      'background: url("a.png") center / cover no-repeat, linear-gradient(180deg, #000000 0%, #ffffff 100%); background-blend-mode: normal, normal;',
    );
  });

  it("escapes quotes in the image url and validates opacity/blend", () => {
    expect(
      overlayLayer({ image: 'a"b.png' }, { width: 1, height: 1 }).cssImage,
    ).toContain('url("a%22b.png")');
    expect(
      overlayLayer({ image: "a\\b\nc\rd.png" }, { width: 1, height: 1 })
        .cssImage,
    ).toContain('url("a%5Cb%0Ac%0Dd.png")');
    expect(() =>
      gradient({
        kind: "linear",
        stops: ["#000", "#fff"],
        overlay: { image: "a", opacity: 2 },
      }),
    ).toThrow(VisError);
    expect(() =>
      gradient({
        kind: "linear",
        stops: ["#000", "#fff"],
        overlay: { image: "a", blend: "burn" as never },
      }),
    ).toThrow(VisError);
  });
});
