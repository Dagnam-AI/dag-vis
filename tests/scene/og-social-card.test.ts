import { describe, expect, it } from "vitest";

import { MOONHOUSE } from "../../src/brand/moonhouse-metrics.js";
import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import { VisError } from "../../src/core/errors.js";
import { coverSpec } from "../../src/scene/cover.js";
import { ogCard } from "../../src/scene/og-card.js";
import {
  fontWidth,
  middleBaseline,
  topBaseline,
  wrapGreedy,
} from "../../src/scene/text-fonts.js";
import { MAX_TEXT_LENGTH } from "../../src/scene/text.js";
import { expectGolden } from "../helpers/golden.js";
import { rasterize } from "../helpers/render.js";

const cover = coverSpec({
  family: "tag:ai",
  item: "building-a-reasoning-model",
  theme: "dark",
  variant: "banner",
});
const input = {
  title: "Building a reasoning model",
  excerpt:
    "A walk through data, architecture and training, with every step run on one GPU.",
  cover,
};

interface Text {
  x: number;
  y: number;
  family: string;
  size: number;
  attrs: string;
  /** Inner markup (a wordmark has a tspan). */
  inner: string;
  text: string;
}

/** Every <text>, in document order. */
function texts(svg: string): Text[] {
  return [
    ...svg.matchAll(
      /<text x="([-\d.]+)" y="([-\d.]+)" font-family="([^"]+)" font-size="([\d.]+)"([^>]*)>(.*?)<\/text>/g,
    ),
  ].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    family: m[3] ?? "",
    size: Number(m[4]),
    attrs: m[5] ?? "",
    inner: m[6] ?? "",
    text: (m[6] ?? "").replace(/<[^>]+>/g, ""),
  }));
}
const titleLines = (svg: string): Text[] =>
  texts(svg).filter((t) => t.family.startsWith("moonhouse") && t.size > 52 - 1);
const sizeOf = (title: string): number =>
  titleLines(ogCard({ title, cover }))[0]?.size ?? 0;
const words = (word: string, n: number): string =>
  Array(n).fill(word).join(" ");

describe("ogCard social layout", () => {
  it("is selected by `cover`: 1200×630 with the cover's art underneath", () => {
    const svg = ogCard(input);
    expect(svg).toContain('width="1200" height="630" viewBox="0 0 1200 630"');
    expect(svg).toContain('fill="#0a0a0a"'); // the cover's base
    expect(svg.indexOf("<defs>")).toBeLessThan(svg.indexOf("<text "));
    expect(svg).toContain("vis1-g"); // glows ids, default idPrefix "vis" + seed
    expect(svg).not.toContain('font-family="Inter'); // no brand-card text
    expect(svg).not.toContain("Dagnam<"); // no logo wordmark of the brand card
  });

  it("draws the title uppercase in Moonhouse, white, at x 80 from the top margin", () => {
    const lines = titleLines(ogCard(input));
    const [first, ...rest] = lines;
    expect(first).toMatchObject({
      x: 80,
      family: "moonhouse, sans-serif",
      size: 92,
    });
    expect(first?.attrs).toBe(' fill="#ffffff"');
    expect(first?.text).toBe("BUILDING A");
    expect(lines.map((l) => l.text).join(" ")).toBe(input.title.toUpperCase());
    // SVG's baseline is the top of the em box (80) plus the canvas offset.
    expect(first?.y).toBeCloseTo(80 + topBaseline(MOONHOUSE, 92), 2);
    rest.forEach((l, i) => {
      expect(l.y).toBeCloseTo(
        80 + (i + 1) * 92 * 1.02 + topBaseline(MOONHOUSE, 92),
        2,
      );
      expect(l.x).toBe(80);
    });
  });

  it("steps the title size down 92, 84, 76, 68, 60, 52 until it fits three lines in 1040 px", () => {
    expect(sizeOf("Hello")).toBe(92);
    expect(sizeOf(words("WORD", 6))).toBe(92); // three lines at 92
    expect(sizeOf(words("WORD", 7))).toBe(76);
    expect(sizeOf(words("WORD", 10))).toBe(60);
    expect(sizeOf(words("WORD", 13))).toBe(52);
    expect(sizeOf(words("AB", 19))).toBe(68);
    const seen = new Set<number>();
    for (const word of ["I", "AB", "WORD", "MOONLIGHT"]) {
      let last = 92;
      for (let n = 1; n <= 60; n++) {
        const size = sizeOf(words(word, n));
        expect(size).toBeLessThanOrEqual(last); // longer never grows
        last = size;
        seen.add(size);
        const lines = titleLines(ogCard({ title: words(word, n), cover }));
        expect(lines.length).toBeLessThanOrEqual(3);
        for (const l of lines)
          expect(fontWidth(MOONHOUSE, l.text, l.size)).toBeLessThanOrEqual(
            1040,
          );
        // Not a size too small: one step up would not have fitted three lines.
        if (size < 92)
          expect(
            wrapGreedy(
              (t) => fontWidth(MOONHOUSE, t, size + 8),
              words(word, n),
              1040,
              3,
              "...",
            ).join(" "),
          ).not.toBe(words(word, n));
      }
    }
    expect([...seen].sort((a, b) => b - a)).toEqual([92, 84, 76, 68, 60, 52]);
  });

  it("caps the title at three lines at 52 px, the last ending in an ellipsis that fits", () => {
    const lines = titleLines(ogCard({ title: words("AB", 60), cover }));
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.size === 52)).toBe(true);
    expect(lines[2]?.text.endsWith("...")).toBe(true); // Moonhouse has no "…"
    expect(lines[0]?.text.endsWith(".")).toBe(false);
    for (const l of lines)
      expect(fontWidth(MOONHOUSE, l.text, 52)).toBeLessThanOrEqual(1040);
  });

  it("sets typographic punctuation in the title as ASCII, which Moonhouse has, but leaves the excerpt alone", () => {
    const svg = ogCard({
      title: "Don\u2019t \u201cstop\u201d \u2014 now\u2026",
      excerpt: "It\u2019s fine\u2026",
      cover,
    });
    expect(
      titleLines(svg)
        .map((t) => t.text)
        .join(" "),
    ).toBe('DON\'T "STOP" - NOW...');
    expect(texts(svg).find((t) => t.size === 30)?.text).toBe(
      "It\u2019s fine\u2026",
    );
  });

  it("keeps a word wider than the line on its own line", () => {
    const lines = titleLines(
      ogCard({ title: "a antidisestablishmentarianism b", cover }),
    );
    expect(lines.map((l) => l.text)).toContain("ANTIDISESTABLISHMENTARIANISM");
  });

  it("collapses whitespace and invisible characters in the title and excerpt", () => {
    const svg = ogCard({
      title: "  one\n\ntwo\t\u{ad}three  ",
      excerpt: " a\u{200b}b \n c ",
      cover,
    });
    expect(texts(svg).map((t) => t.text)).toContain("ONE TWO THREE");
    expect(texts(svg).map((t) => t.text)).toContain("ab c");
  });

  it("draws the excerpt in Unbounded 400 at 30 px, white at 0.72, 24 px under the title block, 44 px apart", () => {
    const svg = ogCard(input);
    const title = titleLines(svg);
    const excerpt = texts(svg).filter((t) => t.size === 30);
    expect(excerpt.length).toBe(2);
    expect(excerpt[0]).toMatchObject({
      x: 80,
      family: "Unbounded, sans-serif",
    });
    expect(excerpt[0]?.attrs).toBe(
      ' font-weight="400" fill="#ffffff" fill-opacity="0.72"',
    );
    const top = 80 + title.length * 92 * 1.02 + 24;
    expect(excerpt[0]?.y).toBeCloseTo(top + topBaseline(UNBOUNDED, 30), 2);
    expect(excerpt[1]?.y).toBeCloseTo(top + 44 + topBaseline(UNBOUNDED, 30), 2);
    for (const l of excerpt)
      expect(fontWidth(UNBOUNDED, l.text, 30)).toBeLessThanOrEqual(1040);
    expect(excerpt.map((l) => l.text).join(" ")).toBe(input.excerpt);
  });

  it("starts the excerpt below a title of any height, scaled by the title's size", () => {
    const svg = ogCard({ title: "Hi", excerpt: "x", cover });
    const excerpt = texts(svg).find((t) => t.size === 30);
    expect(excerpt?.y).toBeCloseTo(
      80 + 92 * 1.02 + 24 + topBaseline(UNBOUNDED, 30),
      2,
    );
  });

  it("cuts an excerpt of more than two lines at two, ending in an ellipsis that fits", () => {
    const svg = ogCard({ title: "T", excerpt: words("lorem", 80), cover });
    const excerpt = texts(svg).filter((t) => t.size === 30);
    expect(excerpt).toHaveLength(2);
    expect(excerpt[1]?.text.endsWith("…")).toBe(true);
    for (const l of excerpt)
      expect(fontWidth(UNBOUNDED, l.text, 30)).toBeLessThanOrEqual(1040);
  });

  it("omits the excerpt when absent or blank", () => {
    const without = ogCard({ title: "T", cover });
    expect(texts(without).filter((t) => t.size === 30)).toEqual([]);
    expect(ogCard({ title: "T", excerpt: " \n\u{ad}", cover })).toBe(without);
  });

  it("draws the bar: a 1 px rule 104 px from the bottom, the wordmark and the address", () => {
    const svg = ogCard(input);
    expect(svg).toContain(
      '<rect x="80" y="526" width="1040" height="1" fill="#ffffff" fill-opacity="0.14"/>',
    );
    const [wordmark, address] = texts(svg).slice(-2);
    expect(wordmark).toMatchObject({
      x: 80,
      size: 34,
      family: "moonhouse, sans-serif",
      text: "DAGNAM.AI",
    });
    expect(wordmark?.attrs).toBe(' fill="#ffffff"');
    expect(wordmark?.inner).toBe('DAGNAM<tspan fill="#ef4444">.AI</tspan>');
    // Vertically centred in the bar: its middle is 526 + 52.
    expect(wordmark?.y).toBeCloseTo(578 + middleBaseline(MOONHOUSE, 34), 2);
    expect(address).toMatchObject({
      x: 1120,
      size: 22,
      family: "Unbounded, sans-serif",
      text: "dagnam.ai/blog",
    });
    expect(address?.attrs).toBe(
      ' text-anchor="end" font-weight="400" fill="#ffffff" fill-opacity="0.6"',
    );
    expect(address?.y).toBeCloseTo(578 + middleBaseline(UNBOUNDED, 22), 2);
  });

  it("applies seed and idPrefix to the cover's ids", () => {
    const svg = ogCard({ ...input, seed: 7, idPrefix: "post" });
    expect(svg).toContain("post-g");
    expect(svg).not.toContain("vis7");
    expect(ogCard({ ...input, seed: 7 })).toContain("vis7-g");
  });

  it("lets the card's seed and idPrefix override a seed and idPrefix inside the cover spec", () => {
    const own = { ...cover, seed: 42, idPrefix: "mine" };
    expect(ogCard({ ...input, cover: own })).toBe(ogCard(input));
    expect(ogCard({ ...input, cover: own, seed: 7 })).toContain("vis7-g");
  });

  it("escapes hostile text and stays well-formed", () => {
    const hostile = ']]></text><script>alert(1)</script> & "q" <b> é 日本 😀';
    const svg = ogCard({ title: hostile, excerpt: hostile, cover });
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<b>");
    expect(svg.match(/<text /g)).toHaveLength(
      svg.match(/<\/text>/g)?.length ?? -1,
    );
    expect(() => rasterize(svg)).not.toThrow();
  });

  it("renders the longest allowed title and excerpt", () => {
    const long = "x ".repeat(MAX_TEXT_LENGTH / 2);
    expect(() => ogCard({ title: long, excerpt: long, cover })).not.toThrow();
  });

  it("is deterministic and matches the golden", () => {
    expect(ogCard(input)).toBe(ogCard(input));
    expectGolden("scene/og-card-social.svg", ogCard(input));
  });

  it("accepts its own size and the dark theme when they are passed explicitly", () => {
    expect(ogCard({ ...input, width: 1200, height: 630, theme: "dark" })).toBe(
      ogCard(input),
    );
  });
});

describe("ogCard social layout options", () => {
  const bad = (o: unknown, re: RegExp): void => {
    expect(() => ogCard(o as never), JSON.stringify(o)).toThrow(VisError);
    expect(() => ogCard(o as never)).toThrow(re);
  };

  it("rejects the brand card's own options, naming each", () => {
    for (const key of ["subtitle", "eyebrow", "footer", "background"])
      bad(
        { ...input, [key]: key === "background" ? {} : "x" },
        new RegExp(`^${key} is not supported with cover`),
      );
    bad({ ...input, subtitle: null }, /^subtitle is not supported with cover/);
  });

  it("rejects a light theme and any other size: the layout is defined for 1200×630", () => {
    bad(
      { ...input, theme: "light" },
      /^theme must be "dark" with cover, got "light"/,
    );
    bad({ ...input, theme: 1 }, /^theme must be "dark" with cover/);
    bad({ ...input, width: 1080 }, /^width must be 1200 with cover, got 1080/);
    bad({ ...input, height: 1080 }, /^height must be 630 with cover, got 1080/);
    bad({ ...input, width: null }, /^width must be 1200 with cover, got null/);
  });

  it("validates title, excerpt, cover, seed and idPrefix, naming the parameter", () => {
    for (const title of [undefined, null, 5, {}])
      bad({ ...input, title }, /^title must be a string/);
    for (const title of ["", " \n ", "\u{ad}"])
      bad({ ...input, title }, /^title must not be empty/);
    bad(
      { ...input, title: "a".repeat(MAX_TEXT_LENGTH + 1) },
      /^title must be at most/,
    );
    for (const excerpt of [null, 5, {}])
      bad({ ...input, excerpt }, /^excerpt must be a string/);
    bad(
      { ...input, excerpt: "a".repeat(MAX_TEXT_LENGTH + 1) },
      /^excerpt must be at most/,
    );
    for (const c of [null, 5, "glows", ["glows"]])
      bad({ ...input, cover: c }, /^cover must be a gradient spec object/);
    bad({ ...input, cover: {} }, /^cover: unknown gradient kind/);
    bad(
      { ...input, cover: { kind: "glows", base: "#000", glows: [] } },
      /^cover: glows needs at least one glow/,
    );
    bad({ ...input, seed: 1.5 }, /^seed must be a safe integer/);
    bad({ ...input, idPrefix: "1a" }, /^idPrefix must be a valid id/);
    for (const options of [null, 5, "x"])
      bad(options, /^options must be an object/);
  });

  it("rejects `excerpt` without `cover`: it belongs to the social layout", () => {
    bad({ title: "T", excerpt: "x" }, /^excerpt is only supported with cover/);
    bad({ title: "T", excerpt: null }, /^excerpt is only supported with cover/);
  });

  it("leaves the brand card as it was without cover: it still matches the brand card's committed golden (og-card.test.ts's options)", () => {
    const base = {
      title: "Build AI Systems Visually",
      subtitle: "A simpler way to design and orchestrate modern AI workflows.",
      footer: "Visual • Modular • Production-ready",
    };
    // The golden predates the social layout and is only ever read here (it exists, so nothing is written).
    expectGolden("scene/og-card-dark.svg", ogCard(base));
    expectGolden(
      "scene/og-card-dark.svg",
      ogCard({ ...base, cover: undefined } as never),
    );
  });
});
