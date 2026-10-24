import { describe, expect, it } from "vitest";

import {
  sheetColumns,
  sheetLayout,
  type SheetSpec,
} from "../../src/lib/sheet.ts";

const base: SheetSpec = {
  count: 1,
  cols: 1,
  tileWidth: 1,
  tileHeight: 1,
  captionHeight: 1,
  gap: 0,
  margin: 0,
};

describe("sheetLayout", () => {
  it("tiles left to right, top to bottom, with gaps and margins", () => {
    const l = sheetLayout({
      count: 5,
      cols: 3,
      tileWidth: 480,
      tileHeight: 270,
      captionHeight: 56,
      gap: 24,
      margin: 48,
    });
    expect(l.width).toBe(48 * 2 + 3 * 480 + 2 * 24);
    expect(l.height).toBe(48 * 2 + 2 * (270 + 56) + 24);
    expect(l.cells).toEqual([
      { x: 48, y: 48 },
      { x: 552, y: 48 },
      { x: 1056, y: 48 },
      { x: 48, y: 398 },
      { x: 552, y: 398 },
    ]);
  });

  it("is a single tile plus margins when there is one cell", () => {
    expect(
      sheetLayout({ ...base, tileWidth: 10, tileHeight: 6, margin: 2 }),
    ).toEqual({ width: 14, height: 11, cells: [{ x: 2, y: 2 }] });
  });

  it("rejects an empty sheet or non-positive geometry", () => {
    expect(() => sheetLayout({ ...base, count: 0 })).toThrow(/count/);
    expect(() => sheetLayout({ ...base, cols: 0 })).toThrow(/cols/);
    expect(() => sheetLayout({ ...base, tileWidth: 0 })).toThrow(/tileWidth/);
    expect(() => sheetLayout({ ...base, tileHeight: 0 })).toThrow(/tileHeight/);
  });

  it("rejects negative spacing but allows zero", () => {
    expect(() => sheetLayout({ ...base, captionHeight: -1 })).toThrow(
      /captionHeight/,
    );
    expect(() => sheetLayout({ ...base, gap: -1 })).toThrow(/gap/);
    expect(() => sheetLayout({ ...base, margin: -1 })).toThrow(/margin/);
    expect(() => sheetLayout({ ...base, captionHeight: 0 })).not.toThrow();
  });

  it("rejects fractions and non-finite numbers", () => {
    expect(() => sheetLayout({ ...base, tileWidth: 1.5 })).toThrow(
      /tileWidth must be an integer >= 1, got 1.5/,
    );
    expect(() => sheetLayout({ ...base, gap: Number.NaN })).toThrow(/gap/);
  });
});

describe("rows", () => {
  const rowsOf = (count: number, cols: number): number => {
    const l = sheetLayout({
      ...base,
      count,
      cols,
      tileHeight: 10,
      captionHeight: 0,
    });
    return l.height / 10;
  };

  it("fills the last row exactly when the count is a multiple of the columns", () => {
    expect(rowsOf(6, 3)).toBe(2);
    expect(rowsOf(3, 3)).toBe(1);
    expect(rowsOf(7, 3)).toBe(3);
  });
});

describe("sheetColumns", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
    [8, 4],
  ])("%i frames use %i columns", (count, cols) => {
    expect(sheetColumns(count)).toBe(cols);
  });

  it("keeps 5 to 8 frames in exactly two rows", () => {
    for (let count = 5; count <= 8; count++) {
      const cols = sheetColumns(count);
      const l = sheetLayout({
        ...base,
        count,
        cols,
        tileHeight: 10,
        captionHeight: 0,
      });
      expect(l.height / 10).toBe(2);
    }
  });

  it("rejects a count below one or a fraction", () => {
    expect(() => sheetColumns(0)).toThrow(/count/);
    expect(() => sheetColumns(2.5)).toThrow(/count/);
  });
});
