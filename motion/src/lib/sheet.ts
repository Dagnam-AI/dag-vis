export interface SheetSpec {
  count: number;
  cols: number;
  tileWidth: number;
  tileHeight: number;
  captionHeight: number;
  gap: number;
  margin: number;
}
export interface SheetLayout {
  width: number;
  height: number;
  cells: { x: number; y: number }[];
}

/** Grid geometry for the storyboard contact sheet (6-8 frames, one caption each). */
export function sheetLayout(s: SheetSpec): SheetLayout {
  for (const [name, v, min] of [
    ["count", s.count, 1],
    ["cols", s.cols, 1],
    ["tileWidth", s.tileWidth, 1],
    ["tileHeight", s.tileHeight, 1],
    ["captionHeight", s.captionHeight, 0],
    ["gap", s.gap, 0],
    ["margin", s.margin, 0],
  ] as const)
    if (!Number.isInteger(v) || v < min)
      throw new Error(
        `${name} must be an integer >= ${String(min)}, got ${String(v)}`,
      );
  const rows = Math.ceil(s.count / s.cols);
  const cellH = s.tileHeight + s.captionHeight;
  const cells = Array.from({ length: s.count }, (_, i) => ({
    x: s.margin + (i % s.cols) * (s.tileWidth + s.gap),
    y: s.margin + Math.floor(i / s.cols) * (cellH + s.gap),
  }));
  return {
    width: 2 * s.margin + s.cols * s.tileWidth + (s.cols - 1) * s.gap,
    height: 2 * s.margin + rows * cellH + (rows - 1) * s.gap,
    cells,
  };
}

/** Columns that keep a storyboard in two rows: 5-6 frames give 3, 7-8 give 4, never more columns than frames. */
export function sheetColumns(count: number): number {
  if (!Number.isInteger(count) || count < 1)
    throw new Error(`count must be an integer >= 1, got ${String(count)}`);
  return Math.min(count, Math.max(2, Math.ceil(count / 2)));
}
