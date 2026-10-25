import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UNBOUNDED_500 } from "../../src/brand/unbounded-500-metrics.js";
import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import { FONTS, expectMatchesFont } from "../helpers/ttf.js";

describe("Unbounded 500 metrics", () => {
  it("equal the shipped static wght 500 font's head, hhea and hmtx values for every code point", () => {
    expectMatchesFont(UNBOUNDED_500, join(FONTS, "Unbounded-Medium.ttf"));
    expect(UNBOUNDED_500.unitsPerEm).toBe(1000);
  });

  it("are wider than the 400 table in total, and only the micro sign falls back to .notdef", () => {
    const total = (t: { advances: ReadonlyMap<number, number> }): number =>
      [...t.advances.values()].reduce((a, b) => a + b, 0);
    expect(total(UNBOUNDED_500)).toBeGreaterThan(total(UNBOUNDED));
    expect(
      [...UNBOUNDED_500.advances]
        .filter(([, w]) => w === UNBOUNDED_500.fallback)
        .map(([cp]) => cp),
    ).toEqual([0xb5]);
  });
});
