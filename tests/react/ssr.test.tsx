// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { Gradient, VisBackground } from "../../src/react/index.js";

describe("server rendering", () => {
  it("runs in an environment with no window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("renders <VisBackground> to an empty wrapper with only overflow hidden (the canvas is added by an effect)", () => {
    const html = renderToString(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: 0.1 }}
        className="bg"
        style={{ height: 120 }}
      />,
    );
    expect(html).toBe(
      '<div class="bg" style="overflow:hidden;height:120px"></div>',
    );
  });

  it("renders every effect without touching the DOM", () => {
    for (const effect of [
      "dither",
      "pixel",
      "terminal",
      "glitch",
      "ribbon",
    ] as const)
      expect(renderToString(<VisBackground effect={effect} />)).toContain(
        "<div",
      );
  });

  it("renders <Gradient> to an inline svg", () => {
    const html = renderToString(
      <Gradient
        spec={{ kind: "linear", angle: 90, stops: ["#000000", "#ffffff"] }}
      />,
    );
    expect(html).toContain(
      '<svg preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%"',
    );
  });

  it("throws a VisError for an unknown effect, including inherited keys", () => {
    for (const bad of ["bogus", "toString"])
      expect(() =>
        renderToString(<VisBackground effect={bad as "dither"} />),
      ).toThrow(VisError);
  });
});
