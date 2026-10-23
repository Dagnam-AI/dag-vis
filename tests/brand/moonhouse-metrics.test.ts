import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOONHOUSE } from "../../src/brand/moonhouse-metrics.js";
import { FONTS, expectMatchesFont } from "../helpers/ttf.js";

describe("Moonhouse metrics", () => {
  it("equal the shipped font's head, hhea and hmtx values for every code point", () => {
    expectMatchesFont(MOONHOUSE, join(FONTS, "moonhouse", "moonhouse.ttf"));
    expect(MOONHOUSE.unitsPerEm).toBe(1000);
  });

  it("pin a few advances: a caps-style face with narrower lowercase and no curly quotes", () => {
    expect(MOONHOUSE.advances.get(0x41)).toBe(835); // A
    expect(MOONHOUSE.advances.get(0x61)).toBe(739); // a: the card uppercases first
    expect(MOONHOUSE.advances.get(0x20)).toBe(500);
    expect(MOONHOUSE.advances.get(0x2019)).toBe(MOONHOUSE.fallback); // ’ has no glyph
    expect(MOONHOUSE.ascent + MOONHOUSE.descent).toBe(MOONHOUSE.unitsPerEm);
  });
});
