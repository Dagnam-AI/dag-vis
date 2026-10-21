import { describe, expect, it } from "vitest";

import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";

describe("conic gradient", () => {
  it("renders CSS conic and an SVG wedge pattern", () => {
    const g = gradient({
      kind: "conic",
      from: 30,
      at: [0.25, 0.75],
      stops: ["#f00", "#0f0", "#00f"],
      size: { width: 100, height: 100 },
    });
    expect(g.css).toBe(
      "background: conic-gradient(from 30deg at 25% 75%, #ff0000 0%, #00ff00 50%, #0000ff 100%);",
    );
    expect(g.defs).toContain(
      '<pattern id="vis1-g" patternUnits="userSpaceOnUse" width="100" height="100">',
    );
    expect((g.defs.match(/<path /g) ?? []).length).toBe(72);
  });

  it("supports repeat (repeating-conic-gradient, wrapped sampling) and reverse", () => {
    const g = gradient({
      kind: "conic",
      stops: [
        { color: "#000", at: 0 },
        { color: "#fff", at: 0.5 },
      ],
      repeat: true,
      reverse: true,
    });
    expect(g.css).toContain(
      "repeating-conic-gradient(from 0deg at 50% 50%, #ffffff 50%, #000000 100%)",
    );
    expect((g.defs.match(/<path /g) ?? []).length).toBe(72);
  });

  it("emits fill-opacity only for translucent wedges", () => {
    const g = gradient({
      kind: "conic",
      stops: [
        { color: "#fff", at: 0, opacity: 0.5 },
        { color: "#fff", at: 1, opacity: 0.5 },
      ],
    });
    expect(g.defs).toContain("fill-opacity=");
    expect(g.defs).toContain('fill="#ffffff" fill-opacity="0.5"/>');
  });

  it("matches its golden", () => {
    expectGolden(
      "gradient/conic.svg",
      gradientSvg({
        kind: "conic",
        stops: ["#ef4444", "#edc41c", "#1bd766", "#10abba", "#ef4444"],
        size: { width: 80, height: 60 },
      }),
    );
  });
});
