import { describe, expect, it } from "vitest";

import { advance } from "../../src/brand/inter-metrics.js";
import { VisError } from "../../src/core/errors.js";
import {
  FONT_FAMILY,
  MAX_LINES,
  MAX_TEXT_LENGTH,
  cleanText,
  measureText,
  wrapText,
} from "../../src/scene/text.js";

const wrap = (text: string, maxWidth: number, extra = {}): string[] =>
  wrapText(text, { maxWidth, maxLines: MAX_LINES, size: 20, ...extra });

describe("cleanText", () => {
  it("collapses every kind of whitespace and control character to one space", () => {
    expect(
      cleanText(
        "t",
        "  a \t b\r\nc\u0000d\u0007e\u0085f\u{2028}g\u{2029}h\u{a0}i\u{3000}j ",
      ),
    ).toBe("a b c d e f g h i j");
    expect(cleanText("t", "")).toBe("");
    expect(cleanText("t", " \n\t ")).toBe("");
  });

  it("removes characters that draw nothing or break XML", () => {
    expect(
      cleanText("t", "a\u{ad}b\u{200b}c\u{2060}d\u{feff}e\u{fffe}f\u{ffff}g"),
    ).toBe("abcdefg");
    expect(cleanText("t", "a\ud800b\udfffc")).toBe("abc");
    // Paired surrogates (an emoji) and joiners survive.
    expect(cleanText("t", "😀\u{200d}👍")).toBe("😀\u{200d}👍");
  });

  it("rejects non-strings and over-long text, naming the parameter", () => {
    for (const bad of [null, undefined, 5, {}, ["a"]]) {
      expect(() => cleanText("title", bad)).toThrow(VisError);
      expect(() => cleanText("title", bad)).toThrow("title must be a string");
    }
    expect(cleanText("t", "a".repeat(MAX_TEXT_LENGTH))).toHaveLength(
      MAX_TEXT_LENGTH,
    );
    expect(() => cleanText("title", "a".repeat(MAX_TEXT_LENGTH + 1))).toThrow(
      `title must be at most ${String(MAX_TEXT_LENGTH)} characters, got ${String(MAX_TEXT_LENGTH + 1)}`,
    );
  });
});

describe("measureText", () => {
  it("sums Inter advances scaled to the font size", () => {
    // "A" regular = 1413/2048 em
    expect(measureText("A", { size: 2048 })).toBe(1413);
    expect(measureText("A", { size: 2048, weight: "bold" })).toBe(1529);
    expect(measureText("AA", { size: 100 })).toBeCloseTo(
      (2 * 1413 * 100) / 2048,
      6,
    );
    expect(measureText("", { size: 10 })).toBe(0);
    expect(measureText("a b", { size: 2048 })).toBe(
      advance(97, "regular") + advance(32, "regular") + advance(98, "regular"),
    );
  });

  it("measures what an SVG renderer draws: whitespace collapsed and trimmed", () => {
    const ab = measureText("a b", { size: 40 });
    expect(measureText("  a \n\t b  ", { size: 40 })).toBe(ab);
    expect(measureText("a\u0000b", { size: 40 })).toBe(ab);
    expect(measureText(" \n ", { size: 40 })).toBe(0);
  });

  it("gives U+00AD and other invisible characters zero width", () => {
    expect(advance(0xad, "regular")).toBeGreaterThan(0); // the table holds .notdef for it
    expect(measureText("co\u{ad}op", { size: 40 })).toBe(
      measureText("coop", { size: 40 }),
    );
    expect(measureText("\u{ad}", { size: 40, weight: "bold" })).toBe(0);
    expect(measureText("a\u{200b}b\u{2060}c\u{feff}", { size: 40 })).toBe(
      measureText("abc", { size: 40 }),
    );
  });

  it("uses one mean-advance fallback per code point outside the table, without throwing", () => {
    expect(measureText("中", { size: 2048 })).toBeGreaterThan(1000);
    expect(measureText("中", { size: 2048 })).toBe(advance(0x4e2d, "regular"));
    // An emoji is one code point, not two surrogate halves.
    expect(measureText("😀", { size: 2048 })).toBe(advance(0x1f600, "regular"));
    expect(measureText("😀中", { size: 2048 })).toBe(
      2 * advance(0x4e2d, "regular"),
    );
  });

  it("adds letterSpacing after every code point", () => {
    expect(measureText("AB", { size: 2048, letterSpacing: 3 })).toBe(
      1413 + advance(66, "regular") + 6,
    );
    expect(measureText("A😀", { size: 2048, letterSpacing: 1 })).toBe(
      1413 + advance(0x1f600, "regular") + 2,
    );
  });

  it("validates the options, naming the parameter", () => {
    const t = (o: unknown): number => measureText("x", o as { size: number });
    for (const size of [
      0,
      -1,
      Number.NaN,
      Infinity,
      1e9,
      "12",
      null,
      undefined,
    ]) {
      expect(() => t({ size })).toThrow(VisError);
      expect(() => t({ size })).toThrow(
        /^size must be a number in 0\.01\.\.16384/,
      );
    }
    for (const weight of ["heavy", "", null, 700]) {
      expect(() => t({ size: 10, weight })).toThrow(VisError);
      expect(() => t({ size: 10, weight })).toThrow(
        /^weight must be "regular" or "bold"/,
      );
    }
    for (const letterSpacing of [-1, Number.NaN, Infinity, 11, "1", null]) {
      expect(() => t({ size: 10, letterSpacing })).toThrow(
        /^letterSpacing must be a number in 0\.\.10/,
      );
    }
    for (const opts of [null, undefined, 5, "x"]) {
      expect(() => t(opts)).toThrow(VisError);
      expect(() => t(opts)).toThrow(/^options must be an object/);
    }
    expect(() => measureText(5 as never, { size: 10 })).toThrow(
      "text must be a string",
    );
    expect(() =>
      measureText("a".repeat(MAX_TEXT_LENGTH + 1), { size: 10 }),
    ).toThrow(VisError);
  });
});

describe("wrapText", () => {
  it("keeps a short line whole", () => {
    expect(
      wrapText("Build AI", { maxWidth: 1000, maxLines: 3, size: 20 }),
    ).toEqual(["Build AI"]);
  });

  it("wraps greedily at spaces", () => {
    const lines = wrapText("Build AI Systems Visually", {
      maxWidth: 160,
      maxLines: 3,
      size: 20,
      weight: "bold",
    });
    expect(lines).toEqual(["Build AI", "Systems", "Visually"]);
    for (const l of lines) {
      expect(measureText(l, { size: 20, weight: "bold" })).toBeLessThanOrEqual(
        160,
      );
    }
    // Greedy: the next word would not have fit on the line before it.
    expect(
      measureText("Build AI Systems", { size: 20, weight: "bold" }),
    ).toBeGreaterThan(160);
  });

  it("fits a line exactly as wide as maxWidth", () => {
    const w = measureText("ab cd", { size: 20 });
    expect(wrap("ab cd", w)).toEqual(["ab cd"]);
    expect(wrap("ab cd", w - 0.001)).toEqual(["ab", "cd"]);
  });

  it("truncates with an ellipsis when maxLines is exceeded", () => {
    const lines = wrapText("one two three four five six", {
      maxWidth: 90,
      maxLines: 2,
      size: 20,
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith("…")).toBe(true);
    expect(measureText(lines[1] ?? "", { size: 20 })).toBeLessThanOrEqual(90);
    // A text that fits maxLines exactly gets no ellipsis.
    const three = measureText("three", { size: 20 }) + 1;
    expect(wrap("one two three", three, { maxLines: 3 })).toEqual([
      "one",
      "two",
      "three",
    ]);
    // "two…" is wider than "three", so the cut keeps what fits.
    expect(wrap("one two three", three, { maxLines: 2 })).toEqual([
      "one",
      "tw…",
    ]);
  });

  it("does not leave a space before the ellipsis, and keeps the longest prefix that fits", () => {
    const maxWidth = measureText("aaaa…", { size: 20 }) + 0.5;
    expect(measureText("aaaa b…", { size: 20 })).toBeGreaterThan(maxWidth);
    expect(
      wrapText("aaaa bbbb cccc", { maxWidth, maxLines: 1, size: 20 }),
    ).toEqual(["aaaa…"]);
    // The cut lands after the space: the space is trimmed, not kept.
    const wider = measureText("aaaa …", { size: 20 }) + 0.5;
    expect(
      wrapText("aaaa bbbb cccc", { maxWidth: wider, maxLines: 1, size: 20 }),
    ).toEqual(["aaaa…"]);
  });

  it("trims the ellipsised line with the weight it is drawn in", () => {
    for (const weight of ["regular", "bold"] as const) {
      const font = { size: 20, weight };
      const text = "aaaa iiiiiii cccc";
      // The first line, "aaaa iiiiiii", fits; only "…" does not. Room for
      // "aaaa iiii…" and not a hair more, so a wrong glyph width shows.
      const maxWidth = measureText("aaaa iiii…", font) + 0.05;
      expect(measureText("aaaa iiiiiii", font)).toBeLessThanOrEqual(maxWidth);
      expect(measureText("aaaa iiiiiii cccc", font)).toBeGreaterThan(maxWidth);
      expect(measureText("aaaa iiiii…", font)).toBeGreaterThan(maxWidth);
      expect(wrapText(text, { maxWidth, maxLines: 1, ...font })).toEqual([
        "aaaa iiii…",
      ]);
    }
  });

  it("returns a lone ellipsis when not even that fits, and never throws", () => {
    expect(wrapText("abc def", { maxWidth: 1, maxLines: 1, size: 20 })).toEqual(
      ["…"],
    );
  });

  it("breaks a single over-long word by characters", () => {
    const lines = wrap("Supercalifragilistic", 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("Supercalifragilistic");
    for (const l of lines)
      expect(measureText(l, { size: 20 })).toBeLessThanOrEqual(60);
  });

  it("continues after a broken word on its last chunk", () => {
    const lines = wrap("Supercalifragilistic ok", 120);
    expect(lines.join(" ")).toContain("ok");
    expect(lines.at(-1)).toMatch(/(^| )ok$/);
  });

  it("puts one character per line when maxWidth is narrower than any glyph", () => {
    expect(wrap("abc", 0.01)).toEqual(["a", "b", "c"]);
  });

  it("never splits a grapheme cluster", () => {
    const family = "👨\u{200d}👩\u{200d}👧";
    const lines = wrap(family.repeat(6), 40);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length % family.length).toBe(0);
    const accented = wrap("é".repeat(20), 20);
    for (const l of accented) expect(l.startsWith("́")).toBe(false);
    expect(accented.join("")).toBe("é".repeat(20));
  });

  it("wraps CJK and emoji text without throwing", () => {
    const cjk = wrap("日本語のタイトルがとても長い場合の折り返し", 100);
    expect(cjk.length).toBeGreaterThan(1);
    expect(cjk.join("")).toBe("日本語のタイトルがとても長い場合の折り返し");
    expect(wrap("🎉🎉🎉 party 🎉🎉🎉", 80).length).toBeGreaterThan(0);
  });

  it("collapses whitespace, treats newlines as spaces and drops soft hyphens", () => {
    expect(wrap("  a   b  ", 1000)).toEqual(["a b"]);
    expect(wrap("line one\nline\ttwo\r\nthree", 1000)).toEqual([
      "line one line two three",
    ]);
    expect(wrap("co\u{ad}operate", 1000)).toEqual(["cooperate"]);
    expect(wrap("", 100)).toEqual([]);
    expect(wrap(" \n\t ", 100)).toEqual([]);
  });

  it("counts letterSpacing when fitting", () => {
    const tight = wrap("abcdef", measureText("abcdef", { size: 20 }));
    expect(tight).toEqual(["abcdef"]);
    const spaced = wrap("abcdef", measureText("abcdef", { size: 20 }), {
      letterSpacing: 2,
    });
    expect(spaced.length).toBeGreaterThan(1);
    for (const l of spaced) {
      expect(
        measureText(l, { size: 20, letterSpacing: 2 }),
      ).toBeLessThanOrEqual(measureText("abcdef", { size: 20 }));
    }
  });

  it("stays fast on the longest allowed input", () => {
    const words = "word ".repeat(MAX_TEXT_LENGTH / 5);
    const started = performance.now();
    expect(
      wrapText(words, { maxWidth: 400, maxLines: 3, size: 20 }),
    ).toHaveLength(3);
    expect(wrap("x".repeat(MAX_TEXT_LENGTH), 40)).toHaveLength(MAX_LINES);
    expect(
      wrapText("日".repeat(MAX_TEXT_LENGTH), {
        maxWidth: 400,
        maxLines: MAX_LINES,
        size: 20,
      }),
    ).toHaveLength(MAX_LINES);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("validates the options, naming the parameter", () => {
    const t = (o: object): string[] =>
      wrapText("x", { maxWidth: 10, maxLines: 1, size: 10, ...o });
    for (const maxWidth of [
      0,
      -1,
      Number.NaN,
      Infinity,
      1e9,
      "10",
      null,
      undefined,
    ]) {
      expect(() => t({ maxWidth })).toThrow(VisError);
      expect(() => t({ maxWidth })).toThrow(
        /^maxWidth must be a number in 0\.01\.\.16384/,
      );
    }
    for (const maxLines of [
      0,
      -1,
      1.5,
      Number.NaN,
      MAX_LINES + 1,
      "3",
      null,
      undefined,
    ]) {
      expect(() => t({ maxLines })).toThrow(VisError);
      expect(() => t({ maxLines })).toThrow(
        /^maxLines must be an integer in 1\.\.100/,
      );
    }
    for (const size of [0, Number.NaN, null])
      expect(() => t({ size })).toThrow(/^size must be/);
    expect(() => t({ weight: "heavy" })).toThrow(/^weight must be/);
    expect(() => t({ letterSpacing: -1 })).toThrow(/^letterSpacing must be/);
    for (const bad of [null, undefined, 5]) {
      expect(() => wrapText("x", bad as never)).toThrow(
        /^options must be an object/,
      );
    }
    expect(() =>
      wrapText(null as never, { maxWidth: 10, maxLines: 1, size: 10 }),
    ).toThrow("text must be a string");
    expect(() =>
      wrapText("a".repeat(MAX_TEXT_LENGTH + 1), {
        maxWidth: 10,
        maxLines: 1,
        size: 10,
      }),
    ).toThrow(VisError);
  });

  it("exposes the font stack the PNG pipeline resolves", () => {
    expect(FONT_FAMILY).toBe("Inter, system-ui, sans-serif");
  });
});
