import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { pattern } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("stripes", () => {
  it("draws the four LoadStripes bars by default (16px bars, 4px gap, 44px tall)", () => {
    const p = pattern({ kind: "stripes" });
    expect(p.tile).toEqual({ width: 80, height: 48 });
    expect(p.defs).toContain(
      '<rect x="0" y="0" width="16" height="44" fill="#d42762"/>',
    );
    expect(p.defs).toContain(
      '<rect x="60" y="0" width="16" height="44" fill="#10abba"/>',
    );
  });

  it("accepts custom colours and bar geometry", () => {
    const p = pattern({
      kind: "stripes",
      colors: ["#000", "#fff"],
      barWidth: 10,
      gap: 0,
      barHeight: 10,
    });
    expect(p.tile).toEqual({ width: 20, height: 10 });
    expect(p.defs).toContain('<rect x="10" y="0" width="10" height="10"');
  });

  it("paints each bar in its colour with gaps between and below (resvg)", () => {
    const r = rasterize(pattern({ kind: "stripes" }).svg);
    // Sample is 3 x 5 tiles of 80 x 48.
    expect([r.width, r.height]).toEqual([240, 240]);
    const bars = [
      [212, 39, 98],
      [237, 196, 28],
      [27, 215, 102],
      [16, 171, 186],
    ];
    for (const [tx, ty] of [
      [0, 0],
      [80, 48],
      [160, 192],
    ] as const) {
      bars.forEach((rgb, i) => {
        const x = tx + i * 20;
        expect(pixelAt(r, x, ty)).toEqual([...rgb, 255]);
        expect(pixelAt(r, x + 15, ty + 43)).toEqual([...rgb, 255]);
        // 4px gap to the right of the bar, and below it.
        expect(pixelAt(r, x + 16, ty + 20)[3]).toBe(0);
        expect(pixelAt(r, x + 19, ty + 20)[3]).toBe(0);
        expect(pixelAt(r, x + 8, ty + 44)[3]).toBe(0);
        expect(pixelAt(r, x + 8, ty + 47)[3]).toBe(0);
      });
    }
  });

  it("applies opacity and a colour's own alpha to each bar", () => {
    const p = pattern({
      kind: "stripes",
      colors: ["#ff0000", "#00ff0080"],
      opacity: 0.5,
      barWidth: 8,
      gap: 0,
      barHeight: 8,
    });
    expect(p.defs).toContain('fill="#ff0000" fill-opacity="0.5"');
    expect(p.defs).toContain('fill="#00ff00" fill-opacity="0.251"');
    const r = rasterize(p.svg);
    expect(pixelAt(r, 2, 2)[3]).toBe(128);
    expect(pixelAt(r, 10, 2)[3]).toBe(64);
  });

  it("validates colours, naming the offender", () => {
    for (const colors of [[], "#fff", {}, [1], ["#fff", null], null]) {
      expect(() => pattern({ kind: "stripes", colors } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "stripes", colors } as never)).toThrow(
        "colors",
      );
    }
    expect(() => pattern({ kind: "stripes", colors: ["#fff", "bad"] })).toThrow(
      "colors[1]: invalid colour: bad",
    );
  });

  it("rejects holes in the colours array, naming the index", () => {
    const leading: unknown[] = [];
    leading[1] = "#fff";
    expect(() =>
      pattern({ kind: "stripes", colors: leading as never }),
    ).toThrow("colors[0] must be a colour string, got undefined");
    const trailing: unknown[] = ["#fff", "#000"];
    trailing.length = 3;
    expect(() =>
      pattern({ kind: "stripes", colors: trailing as never }),
    ).toThrow("colors[2]");
  });

  it("validates bar geometry", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["barWidth", { barWidth: 0 }],
      ["barWidth", { barWidth: 0.5 }],
      ["barWidth", { barWidth: Number.NaN }],
      ["barWidth", { barWidth: 1e9 }],
      ["barWidth", { barWidth: "16" }],
      ["barWidth", { barWidth: null }],
      ["gap", { gap: null }],
      ["barHeight", { barHeight: null }],
      ["gap", { gap: -1 }],
      ["gap", { gap: Infinity }],
      ["gap", { gap: 16385 }],
      ["barHeight", { barHeight: 0 }],
      ["barHeight", { barHeight: -3 }],
      ["barHeight", { barHeight: Number.NaN }],
    ];
    for (const [name, extra] of bad) {
      expect(() => pattern({ kind: "stripes", ...extra } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "stripes", ...extra } as never)).toThrow(
        name,
      );
    }
  });

  it("caps the number of bars and the tile it adds up to", () => {
    const colors = (n: number) => Array.from({ length: n }, () => "#abcdef");
    const many = pattern({ kind: "stripes", colors: colors(64) });
    expect(many.tile.width).toBe(64 * 20);
    expect((many.defs.match(/<rect /g) ?? []).length).toBe(64);
    expect(() => pattern({ kind: "stripes", colors: colors(65) })).toThrow(
      "got 65",
    );
    expect(() => pattern({ kind: "stripes", barWidth: 5000, gap: 0 })).toThrow(
      "tile width",
    );
    expect(() =>
      pattern({ kind: "stripes", barHeight: 16384, gap: 1 }),
    ).toThrow("tile height");
  });

  it("matches its golden", () => {
    expectGolden("pattern/stripes.svg", pattern({ kind: "stripes" }).svg);
  });
});
