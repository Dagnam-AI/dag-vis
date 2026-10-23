#!/usr/bin/env node
// Generates src/brand/moonhouse-metrics.ts and src/brand/unbounded-metrics.ts
// from the SHIPPED font files in src/node/fonts/, so wrapping in the social
// card agrees with the glyphs resvg draws. No dependencies: it reads the
// tables it needs (head, hhea, hmtx, cmap formats 4 and 12) straight from the
// TTF. Inter's table (src/brand/inter-metrics.ts) is older and not produced here.
//
//   node scripts/gen-font-metrics.mjs          write both files
//   node scripts/gen-font-metrics.mjs --check  exit 1 if either file is stale
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);

// The code points inter-metrics.ts holds: ASCII 32-126, Latin-1 160-255, then
// the ten punctuation marks. Kept in the same order so the tables line up.
const CODEPOINTS = [
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

const FONTS = [
  {
    name: "MOONHOUSE",
    label: "Moonhouse",
    ttf: "src/node/fonts/moonhouse/moonhouse.ttf",
    out: "src/brand/moonhouse-metrics.ts",
    source:
      "NimaVisual free font, (c) 2013 Andres Moreno W.; bundled unmodified at the package owner's instruction,\n * terms in src/node/fonts/moonhouse/LICENSE-NOTE.txt (written permission needed to redistribute).",
  },
  {
    name: "UNBOUNDED",
    label: "Unbounded (static wght 400)",
    ttf: "src/node/fonts/Unbounded-Regular.ttf",
    out: "src/brand/unbounded-metrics.ts",
    source:
      "https://github.com/googlefonts/unbounded (SIL OFL 1.1, src/node/fonts/OFL-Unbounded.txt).",
  },
];

/** The tables of a TTF as { tag: DataView over the table }. */
function tables(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const found = {};
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + 16 * i;
    const tag = String.fromCharCode(...buf.subarray(at, at + 4));
    found[tag] = new DataView(
      buf.buffer,
      buf.byteOffset + view.getUint32(at + 8),
      view.getUint32(at + 12),
    );
  }
  return found;
}

/** code point -> glyph id from the best Unicode subtable (format 12, else format 4). */
function cmap(table) {
  const subtables = [];
  for (let i = 0; i < table.getUint16(2); i++) {
    const at = 4 + 8 * i;
    const platform = table.getUint16(at);
    const encoding = table.getUint16(at + 2);
    const unicode =
      platform === 0 || (platform === 3 && [1, 10].includes(encoding));
    const offset = table.getUint32(at + 4);
    if (unicode) subtables.push({ offset, format: table.getUint16(offset) });
  }
  const chosen =
    subtables.find((s) => s.format === 12) ??
    subtables.find((s) => s.format === 4);
  if (chosen === undefined)
    throw new Error("no Unicode cmap subtable (format 4 or 12)");
  const glyphs = new Map();
  const o = chosen.offset;
  if (chosen.format === 12) {
    for (let g = 0; g < table.getUint32(o + 12); g++) {
      const at = o + 16 + 12 * g;
      const start = table.getUint32(at);
      for (let cp = start; cp <= table.getUint32(at + 4); cp++)
        glyphs.set(cp, table.getUint32(at + 8) + cp - start);
    }
    return glyphs;
  }
  const segments = table.getUint16(o + 6) / 2;
  const ends = o + 14;
  const starts = ends + 2 * segments + 2;
  const deltas = starts + 2 * segments;
  const ranges = deltas + 2 * segments;
  for (let s = 0; s < segments; s++) {
    const start = table.getUint16(starts + 2 * s);
    const end = table.getUint16(ends + 2 * s);
    const delta = table.getUint16(deltas + 2 * s);
    const range = table.getUint16(ranges + 2 * s);
    for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
      if (range === 0) glyphs.set(cp, (cp + delta) & 0xffff);
      else {
        const gid = table.getUint16(ranges + 2 * s + range + 2 * (cp - start));
        if (gid !== 0) glyphs.set(cp, (gid + delta) & 0xffff);
      }
    }
  }
  return glyphs;
}

function metrics(path) {
  const t = tables(readFileSync(new URL(path, ROOT)));
  const glyphs = cmap(t.cmap);
  const count = t.hhea.getUint16(34);
  const advanceOf = (gid) => t.hmtx.getUint16(4 * Math.min(gid, count - 1));
  const missing = CODEPOINTS.filter((cp) => !glyphs.has(cp));
  return {
    unitsPerEm: t.head.getUint16(18),
    ascent: t.hhea.getInt16(4),
    descent: -t.hhea.getInt16(6),
    notdef: advanceOf(0),
    missing,
    advances: CODEPOINTS.map((cp) => advanceOf(glyphs.get(cp) ?? 0)),
  };
}

/** Numbers as prettier prints an array of them: filled to 80 columns, 2-space indent. */
function fill(values) {
  const lines = [];
  let line = "  ";
  for (const [i, v] of values.entries()) {
    const word = `${v},`;
    if (line.length + word.length > 80) {
      lines.push(line.trimEnd());
      line = "  ";
    }
    line += `${word}${i === values.length - 1 ? "" : " "}`;
  }
  lines.push(line.trimEnd());
  return lines.join("\n");
}

function render(font) {
  const m = metrics(font.ttf);
  const notdefs =
    m.missing.length === 0
      ? "The font has every one of them."
      : `Code points the font lacks hold its .notdef advance: ${m.missing.map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`).join(" ")}.`;
  return `/**
 * ${font.label} horizontal advances (font units, ${m.unitsPerEm}/em) for the code points
 * the social card wraps on: ASCII 32–126, Latin-1 160–255, then – — ‘ ’ ‚ “ ” „ • …
 * ${notdefs}
 * GENERATED by scripts/gen-font-metrics.mjs from the shipped TTF — do not edit by hand.
 * Source: ${font.source}
 */
const CODEPOINTS: readonly number[] = [
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

const ADVANCES: readonly number[] = [
${fill(m.advances)}
];

export const ${font.name} = {
  unitsPerEm: ${m.unitsPerEm},
  /** hhea ascender and (positive) descender, font units. */
  ascent: ${m.ascent},
  descent: ${m.descent},
  advances: new Map(CODEPOINTS.map((cp, i) => [cp, Number(ADVANCES[i])])),
  /** The .notdef advance, used for code points outside the table. */
  fallback: ${m.notdef},
} as const;
`;
}

const check = process.argv.includes("--check");
let stale = false;
for (const font of FONTS) {
  const next = render(font);
  const path = new URL(font.out, ROOT);
  if (!check) writeFileSync(path, next);
  else if (readFileSync(path, "utf8") !== next) {
    console.error(
      `${font.out} is stale: run node scripts/gen-font-metrics.mjs`,
    );
    stale = true;
  }
}
process.exitCode = stale ? 1 : 0;
