import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import { FONTS, expectMatchesFont } from "../helpers/ttf.js";

describe("Unbounded metrics", () => {
  it("equal the shipped static wght 400 font's head, hhea and hmtx values for every code point", () => {
    expectMatchesFont(UNBOUNDED, join(FONTS, "Unbounded-Regular.ttf"));
    expect(UNBOUNDED.unitsPerEm).toBe(1000);
  });

  it("pin a few advances; only the micro sign falls back to .notdef", () => {
    expect(UNBOUNDED.advances.get(0x41)).toBe(899); // A
    expect(UNBOUNDED.advances.get(0x2026)).toBe(711); // …
    expect(UNBOUNDED.advances.get(0xb5)).toBe(UNBOUNDED.fallback);
    expect(UNBOUNDED.fallback).toBe(837);
    expect(
      [...UNBOUNDED.advances].filter(([, w]) => w === UNBOUNDED.fallback),
    ).toEqual([[0xb5, 837]]);
  });
});
