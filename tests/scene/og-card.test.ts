import { describe, expect, it } from "vitest";

import { MOONHOUSE } from "../../src/brand/moonhouse-metrics.js";
import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import { VisError } from "../../src/core/errors.js";
import { ogCard } from "../../src/scene/og-card.js";
import { fontWidth } from "../../src/scene/text-fonts.js";
import { MAX_TEXT_LENGTH } from "../../src/scene/text.js";
import { expectGolden } from "../helpers/golden.js";
import { rasterize } from "../helpers/render.js";

const opts = {
  title: "Build AI Systems Visually",
  subtitle: "A simpler way to design and orchestrate modern AI workflows.",
  footer: "Visual • Modular • Production-ready",
};

interface Line {
  x: number;
  y: number;
  size: number;
  /** The face the line names in font-family: the display face is Moonhouse, the rest Unbounded. */
  family: string;
  letterSpacing: number;
  text: string;
}

/** Every <text> with an x/y/font-size, in document order (the wordmark included). */
function textLines(svg: string): Line[] {
  const out: Line[] = [];
  for (const m of svg.matchAll(
    /<text x="([-\d.]+)" y="([-\d.]+)"([^>]*?font-size="([\d.]+)"[^>]*)>(.*?)<\/text>/g,
  )) {
    const attrs = m[3] ?? "";
    out.push({
      x: Number(m[1]),
      y: Number(m[2]),
      size: Number(m[4]),
      family: /font-family="([^"]*)"/.exec(attrs)?.[1] ?? "",
      letterSpacing: Number(/letter-spacing="([\d.]+)"/.exec(attrs)?.[1] ?? 0),
      text: (m[5] ?? "").replace(/<[^>]+>/g, ""),
    });
  }
  return out;
}

/** Right edge in px by the advances of the font the line is set in. */
const rightEdge = (l: Line): number =>
  l.x +
  fontWidth(
    l.family.startsWith("moonhouse") ? MOONHOUSE : UNBOUNDED,
    l.text,
    l.size,
  ) +
  l.letterSpacing * Array.from(l.text).length;

describe("ogCard", () => {
  it("renders 1200×630 by default with the logo, wordmark, wrapped title, rule, subtitle and footer", () => {
    const svg = ogCard(opts);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('fill="url(#vis1-band)"'); // brand background underneath
    expect(svg).toContain('<path d="M615.026245'); // logo mark
    expect(svg).toContain(">DAGNAM<"); // Moonhouse wordmark with a red .AI
    expect(svg).toContain('fill="#ef4444">.AI</tspan>');
    const lines = textLines(svg);
    expect(lines.map((l) => l.text)).toEqual([
      "DAGNAM.AI",
      "Build AI Systems",
      "Visually",
      "A simpler way to design and",
      "orchestrate modern AI workflows.",
      "Visual • Modular • Production-ready",
    ]);
    expect(svg).toContain('<rect x="90"'); // accent rule at the left margin
    // The footer's bullets are the brand red.
    expect(svg.match(/<tspan fill="#ef4444">•<\/tspan>/g)).toHaveLength(2);
  });

  it("sets all text in the site's fonts: Unbounded 400 for title, subtitle, eyebrow and footer, Moonhouse for the wordmark", () => {
    const svg = ogCard({ ...opts, eyebrow: "Docs" });
    const lines = textLines(svg);
    expect(lines).toHaveLength(7);
    for (const l of lines)
      expect(l.family, l.text).toBe(
        l.text === "DAGNAM.AI"
          ? "moonhouse, sans-serif"
          : "Unbounded, sans-serif",
      );
    // every Unbounded line is weight 400 (the only weight bundled); nothing is bold or Inter
    expect(svg.match(/font-weight="400"/g)).toHaveLength(6);
    expect(svg).not.toContain('font-weight="700"');
    expect(svg).not.toContain("Inter");
  });

  it("wraps the brand copy to even lines in Unbounded's wide metrics, clear of the art", () => {
    const lines = textLines(ogCard(opts));
    const sub = lines.filter((l) => l.size === 25.2);
    // 60 characters of subtitle at 25.2 px are 949 px in Unbounded: two lines, balanced.
    expect(sub.map((l) => l.text)).toEqual([
      "A simpler way to design and",
      "orchestrate modern AI workflows.",
    ]);
    for (const l of lines) {
      expect(rightEdge(l), l.text).toBeLessThanOrEqual(0.6 * 1200 + 90);
      expect(l.x).toBeGreaterThanOrEqual(90);
    }
    // the second subtitle line is the longer one, but by less than 25% (an even pair)
    expect(
      fontWidth(UNBOUNDED, sub[1]?.text ?? "", 25.2) /
        fontWidth(UNBOUNDED, sub[0]?.text ?? "", 25.2),
    ).toBeLessThan(1.25);
  });

  it("never splits a long word to balance the title", () => {
    for (const [title, expected] of [
      ["Hyperparameter optimization", ["Hyperparameter", "optimization"]],
      ["Backpropagation explained", ["Backpropagation", "explained"]],
      [
        "Internationalization done right",
        ["Internationalization", "done right"],
      ],
      [
        "Reinforcement learning fundamentals",
        ["Reinforcement", "learning", "fundamentals"],
      ],
    ] as const)
      for (const [width, height] of [
        [1200, 630],
        [1080, 1080],
      ] as const)
        expect(
          textLines(ogCard({ title, width, height }))
            .filter((l) => l.size > 40)
            .map((l) => l.text),
          `${title} ${width}x${height}`,
        ).toEqual(expected);
  });

  it("shows an eyebrow, light theme colours, and escapes text", () => {
    const svg = ogCard({
      ...opts,
      eyebrow: "Blog",
      theme: "light",
      title: 'A <b> & "c"',
    });
    expect(svg).toContain(">BLOG<");
    expect(svg).toContain('fill="#ffffff"'); // light base
    // `fill="#0a0a0a">` cannot be matched: fill is not the last attribute of a
    // <text>. Assert it on the text elements instead.
    expect(svg).toMatch(/<text [^>]*fill="#0a0a0a"/); // dark text
    expect(svg).not.toContain('fill="#fafafa"');
    expect(svg).toContain('A &lt;b&gt; &amp; "c"');
  });

  it("caps the title at three lines, or two when a subtitle follows, ending in an ellipsis", () => {
    const long = "word ".repeat(40).trim();
    const alone = textLines(ogCard({ title: long })).filter(
      (l) => l.size === 56.7,
    );
    expect(alone).toHaveLength(3);
    expect(alone[2]?.text.endsWith("…")).toBe(true);
    const withSub = textLines(ogCard({ title: long, subtitle: "sub" })).filter(
      (l) => l.size === 56.7,
    );
    expect(withSub).toHaveLength(2);
    expect(withSub[1]?.text.endsWith("…")).toBe(true);
  });

  it("truncates a long eyebrow, subtitle and footer instead of overflowing", () => {
    const long = "word ".repeat(200);
    const lines = textLines(
      ogCard({ title: "T", eyebrow: long, subtitle: long, footer: long }),
    );
    const byText = (end: string): Line[] =>
      lines.filter((l) => l.text.endsWith(end));
    expect(byText("…")).toHaveLength(3); // eyebrow, last subtitle line, footer
    for (const l of lines)
      expect(rightEdge(l), l.text).toBeLessThanOrEqual(1200);
  });

  it("passes background overrides through; the card owns size, seed and id", () => {
    const svg = ogCard({
      title: "x",
      background: {
        focus: [0.5, 0.5],
        hairlines: 0,
        edge: 0,
        width: 5,
        height: 5,
        seed: 9,
        idPrefix: "zz",
      } as never,
      seed: 3,
      idPrefix: "card",
    });
    expect(svg).not.toContain("-hair");
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain("url(#card-band)");
    expect(svg).not.toContain("zz");
  });

  it("lays out the same at other aspect ratios without colliding", () => {
    const content = {
      eyebrow: "Release notes",
      title: "word ".repeat(40).trim(),
      subtitle: "sub ".repeat(80).trim(),
      footer: "footer ".repeat(80).trim(),
    };
    for (const [width, height] of [
      [1200, 630],
      [1080, 1080],
      [1080, 1920],
      [1500, 500],
      [400, 210],
      [16, 16],
    ] as const) {
      for (const c of [content, { title: content.title }, { title: "Hi" }]) {
        const lines = textLines(ogCard({ ...c, width, height }));
        const [word, ...rest] = lines;
        expect(word?.text).toBe("DAGNAM.AI");
        // Baselines run top to bottom, strictly increasing, all inside the canvas.
        const ys = rest.map((l) => l.y);
        expect(ys).toEqual([...ys].sort((a, b) => a - b));
        for (const l of lines) {
          expect(l.y).toBeGreaterThan(0);
          expect(l.y).toBeLessThan(height);
          expect(l.x).toBeGreaterThanOrEqual(0);
          expect(rightEdge(l), l.text).toBeLessThanOrEqual(width);
        }
        // Consecutive lines never overlap: each baseline clears the previous one by its cap height.
        rest.slice(1).forEach((l, i) => {
          expect(l.y - (rest[i]?.y ?? 0)).toBeGreaterThan(0.72 * l.size);
        });
      }
    }
  });

  it("is well-formed XML for hostile text, and escapes every text slot", () => {
    const hostile =
      ']]></text><script>alert(1)</script> & "q" \' <b> é 日本 😀';
    const svg = ogCard({
      title: hostile,
      subtitle: hostile,
      eyebrow: hostile,
      footer: hostile,
    });
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<b>");
    expect(svg).not.toContain("]]>");
    expect(svg.match(/<text /g)).toHaveLength(
      svg.match(/<\/text>/g)?.length ?? -1,
    );
    expect(svg).toContain("&lt;script&gt;");
    expect(() => rasterize(svg)).not.toThrow();
  });

  it("collapses newlines and control characters, and drops soft hyphens, in every text slot", () => {
    const messy =
      "Line one\nLine\ttwo\u0000\u0007\u{2028}three co\u{ad}op \ud800 \u{fffe}";
    const svg = ogCard({
      title: messy,
      subtitle: messy,
      eyebrow: messy,
      footer: messy,
    });
    expect(svg).not.toMatch(/[\p{Cc}\p{Cs}\u{ad}\u{fffe}]/u);
    expect(svg).not.toContain("\n");
    expect(svg).toContain("Line one Line two three coop");
    expect(svg).toContain("LINE ONE LINE TWO THREE COOP"); // eyebrow
    expect(() => rasterize(svg)).not.toThrow();
  });

  it("omits blank optional text and treats the title as required", () => {
    const blank = ogCard({
      title: "T",
      subtitle: " \n ",
      eyebrow: "\u{ad}",
      footer: "",
    });
    expect(textLines(blank).map((l) => l.text)).toEqual(["DAGNAM.AI", "T"]);
    expect(blank).toBe(ogCard({ title: "T" }));
  });

  it("accepts the longest allowed title and the smallest and largest canvas", () => {
    expect(() =>
      ogCard({ title: "x ".repeat(MAX_TEXT_LENGTH / 2) }),
    ).not.toThrow();
    expect(ogCard({ title: "x", width: 16, height: 16 })).toContain(
      'width="16" height="16"',
    );
    expect(ogCard({ title: "x", width: 16384, height: 16 })).toContain(
      'width="16384"',
    );
  });

  it("validates every option at the boundary, naming the parameter", () => {
    const bad = (o: unknown, re: RegExp): void => {
      expect(() => ogCard(o as never), JSON.stringify(o)).toThrow(VisError);
      expect(() => ogCard(o as never)).toThrow(re);
    };
    for (const options of [null, undefined, 5, "title"])
      bad(options, /^options must be an object/);
    for (const title of [
      undefined,
      null,
      5,
      {},
      ["t"],
      "",
      "  ",
      "\n\u0000",
      "\u{ad}",
    ]) {
      bad(
        { title },
        title === "" || typeof title === "string"
          ? /^title must not be empty/
          : /^title must be a string/,
      );
    }
    bad(
      { title: "a".repeat(MAX_TEXT_LENGTH + 1) },
      /^title must be at most 10000 characters/,
    );
    for (const key of ["subtitle", "eyebrow", "footer"]) {
      for (const v of [null, 5, {}])
        bad({ title: "t", [key]: v }, new RegExp(`^${key} must be a string`));
      bad(
        { title: "t", [key]: "a".repeat(MAX_TEXT_LENGTH + 1) },
        new RegExp(`^${key} must be at most`),
      );
    }
    for (const key of ["width", "height"]) {
      for (const v of [0, 15, -1, Number.NaN, Infinity, 16385, "1200", null]) {
        bad(
          { title: "t", [key]: v },
          new RegExp(`^${key} must be a number in 16\\.\\.16384`),
        );
      }
    }
    for (const theme of ["sepia", "", null, 1])
      bad({ title: "t", theme }, /^theme must be "dark" or "light"/);
    for (const seed of [1.5, Number.NaN, 2 ** 53, "1", null])
      bad({ title: "t", seed }, /^seed must be a safe integer/);
    for (const idPrefix of [
      'a"b',
      "1a",
      "a b",
      "",
      `a${"b".repeat(60)}`,
      5,
      null,
    ]) {
      bad({ title: "t", idPrefix }, /^idPrefix must be a valid id/);
    }
    expect(ogCard({ title: "t", idPrefix: `a${"b".repeat(59)}` })).toContain(
      "url(#",
    );
    for (const background of [null, 5, "red", []])
      bad({ title: "t", background }, /^background must be an object/);
    bad(
      { title: "t", background: { focus: [2, 0] } },
      /^background: focus\[0\] must be a number in 0\.\.1/,
    );
    bad(
      { title: "t", background: { palette: [] } },
      /^background: palette must hold 1\.\.64 colours/,
    );
  });

  it("is deterministic and matches goldens for both themes and a square canvas", () => {
    expect(ogCard(opts)).toBe(ogCard(opts));
    expectGolden("scene/og-card-dark.svg", ogCard(opts));
    expectGolden(
      "scene/og-card-light.svg",
      ogCard({ ...opts, theme: "light", eyebrow: "Docs" }),
    );
    expectGolden(
      "scene/og-card-1080x1080.svg",
      ogCard({ ...opts, eyebrow: "Release notes", width: 1080, height: 1080 }),
    );
  });
});
