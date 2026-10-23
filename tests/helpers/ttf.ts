import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

/**
 * A second, independent reader of the few TrueType tables the font metrics
 * come from (head, hhea, hmtx and a format 4 or 12 cmap), looking one code
 * point up at a time, so the tests check the generated tables against the font
 * files rather than against the generator that wrote them.
 */
export interface Ttf {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  /** Advance of the glyph the cmap maps `cp` to, or `undefined` when it has none. */
  advance(cp: number): number | undefined;
  /** The .notdef glyph's advance. */
  notdef: number;
}

export function readTtf(path: string): Ttf {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const table = (tag: string): number => {
    for (let i = 0; i < view.getUint16(4); i++) {
      const at = 12 + 16 * i;
      if (buf.toString("latin1", at, at + 4) === tag)
        return view.getUint32(at + 8);
    }
    throw new Error(`${path} has no ${tag} table`);
  };
  const head = table("head");
  const hhea = table("hhea");
  const hmtx = table("hmtx");
  const cmap = table("cmap");
  const long = view.getUint16(hhea + 34);
  const advanceOf = (gid: number): number =>
    view.getUint16(hmtx + 4 * Math.min(gid, long - 1));

  const subtables: { offset: number; format: number }[] = [];
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const offset = cmap + view.getUint32(cmap + 4 + 8 * i + 4);
    subtables.push({ offset, format: view.getUint16(offset) });
  }
  const sub = subtables.find((s) => s.format === 12 || s.format === 4);
  if (!sub) throw new Error(`${path} has no format 4 or 12 cmap`);

  const glyph = (cp: number): number => {
    const o = sub.offset;
    if (sub.format === 12) {
      for (let g = 0; g < view.getUint32(o + 12); g++) {
        const at = o + 16 + 12 * g;
        if (cp >= view.getUint32(at) && cp <= view.getUint32(at + 4))
          return view.getUint32(at + 8) + cp - view.getUint32(at);
      }
      return 0;
    }
    const segs = view.getUint16(o + 6) / 2;
    const ends = o + 14;
    const starts = ends + 2 * segs + 2;
    const deltas = starts + 2 * segs;
    const ranges = deltas + 2 * segs;
    for (let s = 0; s < segs; s++) {
      if (
        cp > view.getUint16(ends + 2 * s) ||
        cp < view.getUint16(starts + 2 * s)
      )
        continue;
      const range = view.getUint16(ranges + 2 * s);
      const delta = view.getUint16(deltas + 2 * s);
      if (range === 0) return (cp + delta) & 0xffff;
      const gid = view.getUint16(
        ranges + 2 * s + range + 2 * (cp - view.getUint16(starts + 2 * s)),
      );
      return gid === 0 ? 0 : (gid + delta) & 0xffff;
    }
    return 0;
  };

  return {
    unitsPerEm: view.getUint16(head + 18),
    ascent: view.getInt16(hhea + 4),
    descent: -view.getInt16(hhea + 6),
    advance: (cp) => {
      const gid = glyph(cp);
      return gid === 0 ? undefined : advanceOf(gid);
    },
    notdef: advanceOf(0),
  };
}

export const ROOT = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);
export const FONTS = join(ROOT, "src", "node", "fonts");

/** The code points inter-metrics.ts holds: ASCII, Latin-1 and ten punctuation marks. */
export const TABLE_CODEPOINTS = [
  ...Array.from({ length: 95 }, (_, i) => 32 + i),
  ...Array.from({ length: 96 }, (_, i) => 160 + i),
  0x2013,
  0x2014,
  0x2018,
  0x2019,
  0x201a,
  0x201c,
  0x201d,
  0x201e,
  0x2022,
  0x2026,
];

interface GeneratedMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  advances: ReadonlyMap<number, number>;
  fallback: number;
}

/** `metrics` holds the font's own numbers: header values, then one advance per table code point. */
export function expectMatchesFont(
  metrics: GeneratedMetrics,
  path: string,
): void {
  const ttf = readTtf(path);
  expect(metrics.unitsPerEm).toBe(ttf.unitsPerEm);
  expect(metrics.ascent).toBe(ttf.ascent);
  expect(metrics.descent).toBe(ttf.descent);
  expect(metrics.fallback).toBe(ttf.notdef);
  expect(metrics.advances.size).toBe(TABLE_CODEPOINTS.length);
  // .notdef where the font has no glyph for the code point.
  for (const cp of TABLE_CODEPOINTS)
    expect(metrics.advances.get(cp), `U+${cp.toString(16)}`).toBe(
      ttf.advance(cp) ?? ttf.notdef,
    );
}
