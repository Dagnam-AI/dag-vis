import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UNBOUNDED_700 } from "../../src/brand/unbounded-700-metrics.js";
import { UNBOUNDED_500 } from "../../src/brand/unbounded-500-metrics.js";
import { FONTS, expectMatchesFont } from "../helpers/ttf.js";

describe("Unbounded 700 metrics", () => {
  it("equal the shipped static wght 700 font's head, hhea and hmtx values for every code point", () => {
    expectMatchesFont(UNBOUNDED_700, join(FONTS, "Unbounded-Bold.ttf"));
    expect(UNBOUNDED_700.unitsPerEm).toBe(1000);
  });

  it("are wider than the 500 table in total, and only the micro sign falls back to .notdef", () => {
    const total = (t: { advances: ReadonlyMap<number, number> }): number =>
      [...t.advances.values()].reduce((a, b) => a + b, 0);
    expect(total(UNBOUNDED_700)).toBeGreaterThan(total(UNBOUNDED_500));
    expect(
      [...UNBOUNDED_700.advances]
        .filter(([, w]) => w === UNBOUNDED_700.fallback)
        .map(([cp]) => cp),
    ).toEqual([0xb5]);
  });
});
