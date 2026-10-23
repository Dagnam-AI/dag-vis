import { INTER, advance } from "../brand/inter-metrics.js";
import { VisError } from "../core/errors.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  integerIn,
  orDefault,
} from "../core/validate.js";

export type Weight = "regular" | "bold";

/** The `font-family` every scene text uses; the PNG pipeline bundles Inter, so it resolves there. */
export const FONT_FAMILY = "Inter, system-ui, sans-serif";

/** Longest text (UTF-16 units) measured or wrapped: keeps a 10 MB string away from the loops. */
export const MAX_TEXT_LENGTH = 10_000;
/** Most lines `wrapText` returns. */
export const MAX_LINES = 100;

const MIN_SIZE = 0.01;
const ELLIPSIS = "…";
const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Draw nothing (soft hyphen, zero-width space, word joiner, BOM), are not XML
 * characters (lone surrogates, U+FFFE/F), or reorder the text around them
 * (bidi embeddings/overrides U+202A-202E and isolates U+2066-2069: an
 * unterminated RLO would reverse the rest of the line).
 */
const INVISIBLE =
  /[\u{ad}\u{200b}\u{2060}\u{feff}\u{fffe}\u{ffff}\u{202a}-\u{202e}\u{2066}-\u{2069}\ud800-\udfff]/gu;
/** Take no space: variation selectors, ZWJ/ZWNJ, fillers, ... (Unicode Default_Ignorable_Code_Point). */
export const ZERO_WIDTH = /\p{Default_Ignorable_Code_Point}/u;
/**
 * Em-wide in any CJK font and in emoji fonts: ideographs, kana, hangul,
 * pictographs, CJK symbols and full-width forms.
 */
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u{3000}-\u{303f}\u{ff00}-\u{ffef}]/u;
/** Whitespace, control characters and line/paragraph separators all collapse to one space. */
const BREAKING = /[\s\p{Cc}\p{Zl}\p{Zp}]+/gu;

/**
 * The text an SVG renderer draws: invisible characters removed, every run of
 * whitespace or control characters (newlines included) one space, trimmed.
 * Validates `v` as a string of at most `MAX_TEXT_LENGTH` characters.
 */
export function cleanText(name: string, v: unknown): string {
  if (typeof v !== "string")
    throw new VisError(`${name} must be a string, got ${describeValue(v)}`);
  if (v.length > MAX_TEXT_LENGTH)
    throw new VisError(
      `${name} must be at most ${MAX_TEXT_LENGTH} characters, got ${v.length}`,
    );
  return v.replace(INVISIBLE, "").replace(BREAKING, " ").trim();
}

/** `v` as clean text, or undefined when it is undefined or blank once cleaned. */
export function optionalText(name: string, v: unknown): string | undefined {
  if (v === undefined) return undefined;
  const t = cleanText(name, v);
  return t === "" ? undefined : t;
}

interface Font {
  size: number;
  weight: Weight;
  spacing: number;
}

function parseFont(opts: unknown): Font {
  if (typeof opts !== "object" || opts === null)
    throw new VisError(`options must be an object, got ${describeValue(opts)}`);
  const o = opts as Record<string, unknown>;
  const size = bounded("size", o.size, MIN_SIZE, MAX_DIMENSION);
  const weight = orDefault(o.weight, "regular");
  if (weight !== "regular" && weight !== "bold")
    throw new VisError(
      `weight must be "regular" or "bold", got ${describeValue(weight)}`,
    );
  const spacing = bounded(
    "letterSpacing",
    orDefault(o.letterSpacing, 0),
    0,
    size,
  );
  return { size, weight, spacing };
}

/** A run of text as exact integers, so sums are exact and every width comes from one formula. */
interface Run {
  /** Inter font units. */
  u: number;
  /** Code points. */
  n: number;
}

interface Span extends Run {
  text: string;
}

const EMPTY: Span = { text: "", u: 0, n: 0 };

function span(text: string, weight: Weight): Span {
  let u = 0;
  let n = 0;
  for (const ch of text) {
    u += glyphUnits(ch, weight);
    n += 1;
  }
  return { text, u, n };
}

/**
 * Advance of one code point in Inter font units: zero for default-ignorable
 * characters, the table's value for anything it holds, a full em for CJK and
 * emoji, and for every other code point Inter lacks the width of its .notdef
 * box (the table's U+00AD entry), or the mean advance if that is larger.
 */
function glyphUnits(ch: string, weight: Weight): number {
  if (ZERO_WIDTH.test(ch)) return 0;
  const known = INTER[weight].get(orDefault(ch.codePointAt(0), 0));
  if (known !== undefined) return known;
  if (WIDE.test(ch)) return INTER.unitsPerEm;
  return Math.max(INTER.fallback[weight], advance(0xad, weight));
}

const join = (a: Span, b: Span): Span => ({
  text: a.text + b.text,
  u: a.u + b.u,
  n: a.n + b.n,
});

const px = (s: Run, f: Font): number =>
  (s.u / INTER.unitsPerEm) * f.size + f.spacing * s.n;

/**
 * Width in px of `text` as drawn: Inter advances (so it is machine
 * independent), plus `letterSpacing` after every code point. Whitespace is
 * collapsed and trimmed and invisible characters (U+00AD, zero-width space,
 * ...) count nothing (see `cleanText`), as do variation selectors and joiners.
 * CJK, kana, hangul and emoji count a full em (their width in a CJK or emoji
 * font); any other code point Inter lacks counts its .notdef box, which is
 * what a renderer with only Inter draws. Inter has no CJK or emoji glyphs, so
 * supplying a font that does is the integrator's concern (the PNG pipeline's
 * fallback is decided with the node entry point). No kerning: it narrows most
 * text, but a pair like "WW" can render about 3% wider than the plain advance
 * sum, and nothing here adds a safety margin, so leave slack beside the box.
 */
export function measureText(
  text: string,
  opts: { size: number; weight?: Weight; letterSpacing?: number },
): number {
  const font = parseFont(opts);
  return px(span(cleanText("text", text), font.weight), font);
}

/** `s` split into grapheme clusters. */
export function graphemes(s: string): string[] {
  return Array.from(SEGMENTER.segment(s), (g) => g.segment);
}

/**
 * Greedy word wrap into lines no wider than `maxWidth` px. A word wider than
 * the line breaks between grapheme clusters; text past `maxLines` ends the last
 * line in "…". Whitespace and newlines collapse to single spaces, so the result
 * has no hard line breaks. A single glyph wider than `maxWidth`, or an "…" that
 * does not fit, still gets its own line (nothing narrower exists). Empty text
 * gives `[]`.
 */
export function wrapText(
  text: string,
  opts: {
    maxWidth: number;
    maxLines: number;
    size: number;
    weight?: Weight;
    letterSpacing?: number;
  },
): string[] {
  const font = parseFont(opts);
  const maxWidth = bounded("maxWidth", opts.maxWidth, MIN_SIZE, MAX_DIMENSION);
  const maxLines = integerIn("maxLines", opts.maxLines, 1, MAX_LINES);
  const clean = cleanText("text", text);
  if (clean === "") return [];
  const fits = (s: Run): boolean => px(s, font) <= maxWidth;
  const measure = (s: string): Span => span(s, font.weight);
  const space = measure(" ");

  const lines: Span[] = [];
  let cur = EMPTY;
  for (const word of clean.split(" ")) {
    const w = measure(word);
    const candidate = cur.text === "" ? w : join(join(cur, space), w);
    if (fits(candidate)) {
      cur = candidate;
      continue;
    }
    if (cur.text !== "") lines.push(cur);
    if (fits(w)) {
      cur = w;
      continue;
    }
    // A single word wider than the line: break it between grapheme clusters.
    cur = EMPTY;
    for (const g of graphemes(word)) {
      const next = join(cur, measure(g));
      if (!fits(next) && cur.text !== "") {
        lines.push(cur);
        cur = measure(g);
      } else cur = next;
    }
  }
  lines.push(cur);

  if (lines.length <= maxLines) return lines.map((l) => l.text);
  const head = lines.slice(0, maxLines - 1).map((l) => l.text);
  const last = orDefault(lines[maxLines - 1], EMPTY);
  return [...head, ellipsize(last, font.weight, fits)];
}

/** `line` cut to the longest prefix that leaves room for "…", then "…". */
function ellipsize(
  line: Span,
  weight: Weight,
  fits: (s: Run) => boolean,
): string {
  const mark = span(ELLIPSIS, weight);
  const parts = graphemes(line.text);
  const total = { u: line.u + mark.u, n: line.n + mark.n };
  let keep = parts.length;
  while (keep > 0 && !fits(total)) {
    keep -= 1;
    const dropped = span(orDefault(parts[keep], ""), weight);
    total.u -= dropped.u;
    total.n -= dropped.n;
  }
  return parts.slice(0, keep).join("").trimEnd() + ELLIPSIS;
}
