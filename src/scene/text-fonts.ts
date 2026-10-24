import { orDefault } from "../core/validate.js";
import { ZERO_WIDTH, graphemes } from "./text.js";

/**
 * The `font-family` of the brand display face and of the brand text face, as the font
 * files name themselves, lowercase and capitalised: resvg matches family names
 * case-sensitively (a browser does not), and "Moonhouse" would fall back to Inter.
 */
export const DISPLAY_FAMILY = "moonhouse, sans-serif";
export const SANS_FAMILY = "Unbounded, sans-serif";

/** What the social card needs of a font: hhea ascent/descent and advances, in font units. */
export interface FontMetrics {
  unitsPerEm: number;
  /** hhea ascender and (positive) descender. */
  ascent: number;
  descent: number;
  advances: ReadonlyMap<number, number>;
  /** Advance of a code point the table lacks: the font's .notdef. */
  fallback: number;
}

/**
 * Width in px of `text` at `size`: the sum of the font's advances, no kerning,
 * so it is machine independent. Default-ignorable code points (variation
 * selectors, joiners) count nothing; a code point the table lacks counts the
 * font's .notdef advance, whichever font a renderer substitutes for it.
 */
export function fontWidth(
  font: FontMetrics,
  text: string,
  size: number,
): number {
  let units = 0;
  for (const ch of text) {
    if (ZERO_WIDTH.test(ch)) continue;
    units +=
      font.advances.get(orDefault(ch.codePointAt(0), 0)) ?? font.fallback;
  }
  return (units * size) / font.unitsPerEm;
}

/**
 * A browser canvas draws text with `textBaseline = "top"` at the top of the
 * em box and `"middle"` at its centre, where the em box is the font's
 * ascent + descent normalised to one em (hhea; measured in headless Chromium
 * for both fonts to the pixel). SVG wants the alphabetic baseline, so these
 * are its offsets from that top (add to the top) and from that centre (add to
 * the centre), for text of `size` px.
 */
export function topBaseline(font: FontMetrics, size: number): number {
  return (size * font.ascent) / (font.ascent + font.descent);
}

export function middleBaseline(font: FontMetrics, size: number): number {
  return (
    (size * (font.ascent - font.descent)) / (2 * (font.ascent + font.descent))
  );
}

/**
 * Greedy word wrap of `text` (whitespace runs count as one space) into lines
 * whose `measure` is at most `width`, at most `max` of them. A word wider than
 * the line stays alone on its own line. When the text needs more lines the
 * last kept one loses trailing grapheme clusters (and the spaces they leave)
 * until it plus `ellipsis` fits, then gets the `ellipsis`. This is the behaviour
 * of the blog app's canvas card; nothing narrower than a bare `ellipsis` exists,
 * so that can stand alone.
 */
export function wrapGreedy(
  measure: (text: string) => number,
  text: string,
  width: number,
  max: number,
  ellipsis: string,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next) <= width) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  let last = orDefault(lines[max - 1], "");
  while (last && measure(last + ellipsis) > width)
    last = graphemes(last).slice(0, -1).join("").trimEnd();
  return [...lines.slice(0, max - 1), last + ellipsis];
}

/**
 * `text` with the typographic punctuation a display face may lack (curly
 * quotes, en and em dashes, the bullet, the ellipsis) as its ASCII stand-ins.
 * resvg draws a whole text element in a fallback face when one character of it
 * is missing from the first font, so a title with a single ’ would leave
 * Moonhouse for that line altogether.
 */
export function asciiPunctuation(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "*")
    .replace(/\u2026/g, "...");
}

export interface WrapFontOptions {
  /** Px. */
  size: number;
  /** Widest line, px. */
  maxWidth: number;
  /** Lines kept; more text ends the last one in "…". */
  maxLines: number;
  /** Px added after every code point. Default 0. */
  letterSpacing?: number;
  /** Narrow the lines to the least width that keeps the line count (no short last line). Default false. */
  balance?: boolean;
}

/**
 * Word wrap of already-clean `text` (single spaces) into lines whose width in
 * `font` is at most `maxWidth`, at most `maxLines` of them. A word wider than
 * the line breaks between grapheme clusters; text past `maxLines` ends the last
 * line in "…". With `balance` the lines are re-wrapped at the narrowest width
 * that gives the same number of lines, so a short last line borrows words from
 * the one above ("Build AI Systems / Visually" stays, but "A simpler way to
 * design and orchestrate modern / AI workflows." becomes two even lines). Machine
 * independent: advances only, no kerning. Empty text gives `[]`.
 */
export function wrapFont(
  font: FontMetrics,
  text: string,
  opts: WrapFontOptions,
): string[] {
  const { size, maxLines, letterSpacing = 0 } = opts;
  const width = (s: string): number =>
    fontWidth(font, s, size) + letterSpacing * Array.from(s).length;
  const layout = (limit: number): string[] => {
    const lines: string[] = [];
    let cur = "";
    for (const word of text.split(" ").filter(Boolean)) {
      const next = cur === "" ? word : `${cur} ${word}`;
      if (width(next) <= limit) {
        cur = next;
        continue;
      }
      if (cur !== "") lines.push(cur);
      if (width(word) <= limit) {
        cur = word;
        continue;
      }
      // A single word wider than the line: break it between grapheme clusters.
      cur = "";
      for (const g of graphemes(word)) {
        if (width(cur + g) > limit && cur !== "") {
          lines.push(cur);
          cur = g;
        } else cur += g;
      }
    }
    if (cur !== "") lines.push(cur);
    return lines;
  };

  const lines = layout(opts.maxWidth);
  if (lines.length > maxLines) {
    let last = lines.slice(maxLines - 1, maxLines).join("");
    while (last && width(`${last}…`) > opts.maxWidth)
      last = graphemes(last).slice(0, -1).join("").trimEnd();
    return [...lines.slice(0, maxLines - 1), `${last}…`];
  }
  if (!opts.balance || lines.length < 2) return lines;
  // Bisect the width: layout(w) has the same number of lines for every w from the
  // answer up to maxWidth, and more below it. Never go below the widest word: a
  // narrower line breaks it between grapheme clusters, and the tail can still join
  // the next words, keeping the line count (and so fooling the search). 24 steps
  // resolve the rest far below a pixel.
  let lo = Math.min(
    opts.maxWidth,
    Math.max(...text.split(" ").map((word) => width(word))),
  );
  let hi = opts.maxWidth;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (layout(mid).length === lines.length) hi = mid;
    else lo = mid;
  }
  return layout(hi);
}
