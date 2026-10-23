import { describe, expect, it } from "vitest";

import { fade } from "../../src/pattern/types.js";
import type { PatternSpec } from "../../src/pattern/types.js";

describe("PatternSpec", () => {
  it("covers every pattern kind", () => {
    // Compile-time: the union names every kind the registry dispatches on.
    const kinds = {
      dots: { kind: "dots" },
      grid: { kind: "grid" },
      lines: { kind: "lines" },
      stripes: { kind: "stripes" },
      dagMesh: { kind: "dagMesh" },
      contours: { kind: "contours" },
      noise: { kind: "noise" },
    } satisfies Record<PatternSpec["kind"], PatternSpec>;
    expect(Object.keys(kinds)).toHaveLength(7);
  });
});

describe("fade", () => {
  it("omits full opacity and keeps anything less", () => {
    expect(fade(1)).toBeUndefined();
    expect(fade(0.4)).toBe(0.4);
    expect(fade(0)).toBe(0);
  });
});
