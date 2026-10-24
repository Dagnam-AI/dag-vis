import { describe, expect, it } from "vitest";

import { MOONHOUSE } from "../../src/brand/moonhouse-metrics.js";
import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import {
  asciiPunctuation,
  fontWidth,
  middleBaseline,
  topBaseline,
  DISPLAY_FAMILY,
  SANS_FAMILY,
  wrapFont,
  wrapGreedy,
} from "../../src/scene/text-fonts.js";
import type { FontMetrics } from "../../src/scene/text-fonts.js";

/** Every character 10 px wide: lines of N characters fit a width of 10 * N. */
const tenPx = (t: string): number => 10 * Array.from(t).length;

describe("fontWidth", () => {
  it("sums the font's advances scaled by size / unitsPerEm", () => {
    expect(fontWidth(MOONHOUSE, "A", 100)).toBe(83.5);
    expect(fontWidth(MOONHOUSE, "AA A", 10)).toBe((835 * 3 + 500) / 100);
    const units = Array.from("dagnam").reduce(
      (sum, c) => sum + Number(UNBOUNDED.advances.get(c.codePointAt(0) ?? 0)),
      0,
    );
    expect(units).toBeGreaterThan(0);
    expect(fontWidth(UNBOUNDED, "dagnam", 30)).toBe((units * 30) / 1000);
    expect(fontWidth(MOONHOUSE, "", 50)).toBe(0);
  });

  it("measures a code point the table lacks as the font's .notdef, and astral code points once", () => {
    expect(fontWidth(MOONHOUSE, "\u{4e2d}", 100)).toBe(50);
    expect(fontWidth(MOONHOUSE, "\u{1f600}", 100)).toBe(50);
  });

  it("counts default-ignorable code points (variation selectors, joiners) as nothing", () => {
    expect(fontWidth(UNBOUNDED, "A\u{fe0f}\u{200d}", 100)).toBe(
      fontWidth(UNBOUNDED, "A", 100),
    );
  });
});

describe("baselines", () => {
  // Measured in headless Chromium at 100px (canvas textBaseline "top" / "middle", ink of "H"):
  // Moonhouse top 75, middle 25; Unbounded top 80, middle 30 (to the pixel).
  it("topBaseline is the em-box-normalised hhea ascent below the top, as a canvas puts it", () => {
    expect(topBaseline(MOONHOUSE, 100)).toBe(75);
    expect(topBaseline(UNBOUNDED, 100)).toBeCloseTo(80.24, 2); // 995 / (995 + 245)
  });

  it("middleBaseline is half the normalised ascent minus descent below the centre", () => {
    expect(middleBaseline(MOONHOUSE, 100)).toBe(25);
    expect(middleBaseline(UNBOUNDED, 100)).toBeCloseTo(30.24, 2); // (995 - 245) / 2 / 1240
  });

  it("scales with the size", () => {
    expect(topBaseline(MOONHOUSE, 34)).toBe(25.5);
    expect(middleBaseline(MOONHOUSE, 34)).toBe(8.5);
  });
});

describe("wrapGreedy", () => {
  it("returns the text on one line when it fits, and nothing for no text", () => {
    expect(wrapGreedy(tenPx, "ab cd", 100, 3, "…")).toEqual(["ab cd"]);
    expect(wrapGreedy(tenPx, "", 100, 3, "…")).toEqual([]);
  });

  it("breaks before the word that does not fit, and a width reached exactly fits", () => {
    expect(wrapGreedy(tenPx, "aaa bbb ccc", 70, 3, "…")).toEqual([
      "aaa bbb",
      "ccc",
    ]);
    expect(wrapGreedy(tenPx, "aaa bbb ccc", 60, 3, "…")).toEqual([
      "aaa",
      "bbb",
      "ccc",
    ]);
  });

  it("keeps a word wider than the line on a line of its own", () => {
    expect(wrapGreedy(tenPx, "a toolongword b", 50, 3, "…")).toEqual([
      "a",
      "toolongword",
      "b",
    ]);
    expect(wrapGreedy(tenPx, "toolongword", 50, 3, "…")).toEqual([
      "toolongword",
    ]);
  });

  it("collapses runs of whitespace like the reference did", () => {
    expect(wrapGreedy(tenPx, " a \n b\t\tc ", 100, 3, "…")).toEqual(["a b c"]);
  });

  it("ends the last line in an ellipsis that fits when the text runs past max lines", () => {
    const lines = wrapGreedy(tenPx, "aaa bbb ccc ddd", 40, 2, "…");
    expect(lines).toEqual(["aaa", "bbb…"]);
    for (const l of lines) expect(tenPx(l)).toBeLessThanOrEqual(40);
  });

  it("drops trailing letters and spaces from the last kept line until the ellipsis fits", () => {
    // "aaa bbb" + "…" is 80 wide: one letter goes, "aaa bb…" is 70.
    expect(wrapGreedy(tenPx, "aaa bbb ccc", 70, 1, "…")).toEqual(["aaa bb…"]);
    // "aa b…" does not fit 40: "aa " is cut to, and its space is trimmed before the ellipsis.
    expect(wrapGreedy(tenPx, "aa b cc dd", 40, 1, "…")).toEqual(["aa…"]);
    expect(wrapGreedy(tenPx, "ab cd efgh ij", 55, 2, "…")).toEqual([
      "ab cd",
      "efgh…",
    ]);
  });

  it("falls back to a bare ellipsis when not even one letter fits with it", () => {
    expect(wrapGreedy(tenPx, "a b", 5, 1, "…")).toEqual(["…"]);
  });

  it("cuts between grapheme clusters, never inside an emoji or a combining sequence", () => {
    const clusters = (t: string): number =>
      10 * [...new Intl.Segmenter().segment(t)].length;
    const family = "\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}";
    expect(
      wrapGreedy(clusters, `${family}${family}${family} z`, 30, 1, "…"),
    ).toEqual([`${family}${family}…`]);
    expect(wrapGreedy(clusters, "ae\u{301}e\u{301} z", 20, 1, "…")).toEqual([
      "a…",
    ]);
  });

  it("is a pure function of its inputs", () => {
    const run = (): string[] =>
      wrapGreedy(
        (t) => fontWidth(MOONHOUSE, t, 60),
        "A QUITE LONG TITLE HERE",
        400,
        3,
        "...",
      );
    expect(run()).toEqual(run());
  });

  it("ends with whatever ellipsis it is given, measured with it", () => {
    // "aaa bbb" + "..." is 100 wide: it gives up letters until 70 fit, "aaa" + "..." = 60.
    expect(wrapGreedy(tenPx, "aaa bbb ccc", 70, 1, "...")).toEqual(["aaa..."]);
    expect(wrapGreedy(tenPx, "aaa bbb ccc", 70, 1, "")).toEqual(["aaa bbb"]);
  });
});

describe("asciiPunctuation", () => {
  it("swaps the punctuation Moonhouse lacks for ASCII, and leaves everything else", () => {
    expect(
      asciiPunctuation(
        "Don\u2019t \u201cstop\u201d \u2014 or \u2018go\u2019\u2026",
      ),
    ).toBe("Don't \"stop\" - or 'go'...");
    expect(asciiPunctuation("1\u20132 \u2022 \u201aa\u201e")).toBe(
      "1-2 * 'a\"",
    );
    expect(asciiPunctuation("plain, ASCII: ok! \u00e9")).toBe(
      "plain, ASCII: ok! \u00e9",
    );
  });

  it("only uses code points Moonhouse has a glyph for", () => {
    for (const ch of asciiPunctuation(
      "\u2018\u2019\u201a\u201c\u201d\u201e\u2013\u2014\u2022\u2026",
    ))
      expect(MOONHOUSE.advances.has(ch.codePointAt(0) ?? 0)).toBe(true);
  });
});

describe("the brand font families", () => {
  it("name the faces exactly as the bundled files name themselves", () => {
    // resvg matches family names case-sensitively: the display face is lowercase.
    expect(DISPLAY_FAMILY).toBe("moonhouse, sans-serif");
    expect(SANS_FAMILY).toBe("Unbounded, sans-serif");
  });
});

describe("wrapFont", () => {
  /** Every glyph 1 em wide: at size 10, a line of N characters is 10 N px. */
  const SQUARE: FontMetrics = {
    unitsPerEm: 1000,
    ascent: 800,
    descent: 200,
    advances: new Map(),
    fallback: 1000,
  };
  const wrap = (
    text: string,
    maxWidth: number,
    extra: Partial<Parameters<typeof wrapFont>[2]> = {},
  ): string[] =>
    wrapFont(SQUARE, text, { size: 10, maxWidth, maxLines: 9, ...extra });

  it("keeps text that fits on one line and gives nothing for no text", () => {
    expect(wrap("hello world", 110)).toEqual(["hello world"]);
    expect(wrap("", 110)).toEqual([]);
    expect(wrap("a", 110, { balance: true })).toEqual(["a"]);
  });

  it("wraps greedily: a word that fits the width exactly stays, the next goes down", () => {
    expect(wrap("aaaa bb cc dd", 100)).toEqual(["aaaa bb cc", "dd"]);
    expect(wrap("aaaa bb cc dd", 99)).toEqual(["aaaa bb", "cc dd"]);
  });

  it("balances: the same number of lines at the narrowest width", () => {
    expect(wrap("aaaa bb cc dd", 100, { balance: true })).toEqual([
      "aaaa bb",
      "cc dd",
    ]);
    const lines = wrap("one two three four five six seven", 200, {
      balance: true,
    });
    expect(lines.length).toBe(
      wrap("one two three four five six seven", 200).length,
    );
    expect(lines.join(" ")).toBe("one two three four five six seven");
    for (const line of lines) expect(line.length * 10).toBeLessThanOrEqual(200);
    // already even: unchanged
    expect(wrap("aa bb", 50, { balance: true })).toEqual(["aa bb"]);
    expect(wrap("aaaa bbbb", 45, { balance: true })).toEqual(["aaaa", "bbbb"]);
  });

  it("never gives balance a reason to add a line, break a word, or exceed maxWidth", () => {
    for (const text of [
      "a bb ccc dddd eeeee ffffff",
      "x ".repeat(40).trim(),
      "ab cd ef gh ij kl",
    ])
      for (const maxWidth of [30, 55, 80, 140, 400]) {
        const plain = wrap(text, maxWidth);
        const even = wrap(text, maxWidth, { balance: true });
        expect(even.length, `${text} @${maxWidth}`).toBe(plain.length);
        expect(even.join(" ")).toBe(plain.join(" "));
        for (const line of even)
          expect(line.length * 10).toBeLessThanOrEqual(maxWidth);
      }
  });

  it("breaks a word wider than the line between grapheme clusters", () => {
    expect(wrap("abcdefghij", 40)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrap("ab abcdefghij", 40)).toEqual(["ab", "abcd", "efgh", "ij"]);
    // an emoji with a variation selector is one cluster, never split
    expect(wrap("a\u{2764}\u{fe0f}b", 20)).toEqual(["a\u{2764}\u{fe0f}", "b"]);
    // a glyph wider than the line still gets a line of its own
    expect(wrap("abc", 5)).toEqual(["a", "b", "c"]);
  });

  it("ends the last line in an ellipsis that fits when the text runs past maxLines", () => {
    const lines = wrap("aaaa bbbb cccc dddd", 50, { maxLines: 2 });
    expect(lines).toEqual(["aaaa", "bbbb…"]);
    expect(wrap("aaaa bbbb", 5, { maxLines: 1 })).toEqual(["…"]);
    expect(wrap("aaaa bbbb", 45, { maxLines: 1 })).toEqual(["aaa…"]);
    for (const line of lines) expect(line.length * 10).toBeLessThanOrEqual(50);
    // balance does not apply to a truncated text
    expect(
      wrap("aaaa bbbb cccc dddd", 50, { maxLines: 2, balance: true }),
    ).toEqual(lines);
  });

  it("counts letter spacing after every code point", () => {
    // 5 characters at 10 px + 2 px spacing each = 60 px
    expect(wrap("abcde", 59, { letterSpacing: 2 })).toEqual(["abcd", "e"]);
    expect(wrap("abcde", 60, { letterSpacing: 2 })).toEqual(["abcde"]);
  });

  it("measures with the real font: the brand card copy wraps to even lines", () => {
    const at = (text: string, size: number, maxWidth: number) =>
      wrapFont(UNBOUNDED, text, { size, maxWidth, maxLines: 3, balance: true });
    expect(at("Build AI Systems Visually", 56.7, 720)).toEqual([
      "Build AI Systems",
      "Visually",
    ]);
    expect(
      at(
        "A simpler way to design and orchestrate modern AI workflows.",
        25.2,
        660,
      ),
    ).toEqual([
      "A simpler way to design and",
      "orchestrate modern AI workflows.",
    ]);
  });
});
