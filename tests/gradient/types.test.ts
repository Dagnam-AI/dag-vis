import { describe, expect, it } from "vitest";

import type { GradientSpec } from "../../src/gradient/types.js";

// types.ts has no runtime code; this pins (at compile time, via tsc) that the
// union names every kind the registry will dispatch on.
describe("GradientSpec", () => {
  it("covers every gradient kind", () => {
    const kinds = {
      linear: { kind: "linear", stops: ["#000", "#fff"] },
      radial: { kind: "radial", stops: ["#000", "#fff"] },
      conic: { kind: "conic", stops: ["#000", "#fff"] },
      mesh: { kind: "mesh", base: "#000", points: [] },
      aurora: { kind: "aurora", palette: ["#000"] },
      banded: { kind: "banded", stops: ["#000", "#fff"], bands: 4 },
      layers: { kind: "layers", layers: [] },
      freeform: { kind: "freeform", points: [] },
      glows: { kind: "glows", base: "#000", glows: [] },
      fluted: {
        kind: "fluted",
        source: { kind: "linear", stops: ["#000", "#fff"] },
      },
    } satisfies Record<GradientSpec["kind"], GradientSpec>;
    expect(Object.keys(kinds)).toHaveLength(10);
  });
});
