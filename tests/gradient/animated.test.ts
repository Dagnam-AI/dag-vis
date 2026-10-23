import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { animatedGradientCss } from "../../src/gradient/animated.js";
import type { GradientSpec } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";

const conic = {
  kind: "conic",
  stops: ["#ef4444", "#10abba", "#ef4444"],
} as const;

describe("animatedGradientCss", () => {
  it("rotates a conic via a registered --angle property", () => {
    const { css, keyframes } = animatedGradientCss(conic, {
      kind: "rotate",
      duration: 8,
    });
    expect(keyframes).toContain("@property --vis-angle");
    expect(keyframes).toContain('syntax: "<angle>"');
    expect(keyframes).toContain("@keyframes vis-rotate");
    expect(keyframes).toContain("to { --vis-angle: 360deg; }");
    expect(css).toContain(
      ".vis-gradient { background: conic-gradient(from var(--vis-angle) at 50% 50%, #ef4444 0%, #10abba 50%, #ef4444 100%); animation: vis-rotate 8s linear infinite; }",
    );
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce) { .vis-gradient { animation: none; } }",
    );
  });

  it("keeps a conic's own start angle, centre and repeat while rotating", () => {
    const { css } = animatedGradientCss(
      {
        kind: "conic",
        from: 30,
        at: [0.25, 0.75],
        repeat: true,
        reverse: true,
        stops: [
          { color: "#000", at: 0 },
          { color: "#fff", at: 0.5 },
        ],
      },
      { kind: "rotate" },
    );
    expect(css).toContain(
      "background: repeating-conic-gradient(from calc(30deg + var(--vis-angle)) at 25% 75%, #ffffff 50%, #000000 100%);",
    );
  });

  it("rotates a linear gradient too, offset by its angle", () => {
    const { css } = animatedGradientCss(
      { kind: "linear", angle: 45, stops: ["#000", "#fff"] },
      { kind: "rotate" },
    );
    expect(css).toContain(
      "linear-gradient(calc(45deg + var(--vis-angle)), #000000 0%, #ffffff 100%)",
    );
    expect(css).toContain("animation: vis-rotate 10s linear infinite");
    expect(
      animatedGradientCss(
        { kind: "linear", repeat: true, stops: ["#000", "#fff"] },
        { kind: "rotate" },
      ).css,
    ).toContain("repeating-linear-gradient(calc(180deg + var(--vis-angle)),");
  });

  it("shifts any gradient with an oversized background", () => {
    const { css, keyframes } = animatedGradientCss(
      { kind: "linear", stops: ["#000", "#fff"] },
      { kind: "shift", selector: "#hero", name: "hero" },
    );
    expect(css).toContain(
      "#hero { background: linear-gradient(180deg, #000000 0%, #ffffff 100%); background-size: 200% 200%; animation: hero-shift 10s ease-in-out infinite alternate; }",
    );
    expect(keyframes).toContain(
      "@keyframes hero-shift { from { background-position: 0% 0%; } to { background-position: 100% 100%; } }",
    );
  });

  it("hue-rotates via filter", () => {
    const { css, keyframes } = animatedGradientCss(conic, { kind: "hue" });
    expect(css).toContain("animation: vis-hue 10s linear infinite");
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce) { .vis-gradient { animation: none; } }",
    );
    expect(keyframes).toContain("to { filter: hue-rotate(360deg); }");
  });

  it("keeps blend modes when shifting or hue-rotating a blended stack", () => {
    const layered: GradientSpec = {
      kind: "layers",
      blend: "multiply",
      layers: [
        { kind: "linear", stops: ["#000", "#fff"] },
        { kind: "linear", angle: 90, stops: ["#f00", "#00f"] },
      ],
    };
    expect(animatedGradientCss(layered, { kind: "shift" }).css).toContain(
      "background-blend-mode: multiply, normal;",
    );
  });

  it("rejects options that are not an object", () => {
    for (const opts of [null, 5, "rotate"])
      expect(() => animatedGradientCss(conic, opts as never)).toThrow(
        /options must be an object/,
      );
  });

  it("never lets null default, and bounds the duration to 0.001..86400 seconds", () => {
    for (const opts of [
      { duration: null },
      { selector: null },
      { name: null },
      { selector: 5 },
      { name: 5 },
      { selector: {} },
      { duration: "5" },
      { duration: 1e308 },
      { duration: 86401 },
      { duration: 0.0004 },
    ])
      expect(() =>
        animatedGradientCss(conic, { kind: "hue", ...opts } as never),
      ).toThrow(VisError);
    expect(() =>
      animatedGradientCss(conic, { kind: "hue", duration: 1e308 }),
    ).toThrow(/duration must be a number in 0\.001\.\.86400/);
    expect(
      animatedGradientCss(conic, { kind: "hue", duration: 86400 }).css,
    ).toContain("86400s");
    expect(
      animatedGradientCss(conic, { kind: "hue", duration: 0.001 }).css,
    ).toContain("0.001s");
    expect(() =>
      animatedGradientCss(conic, { kind: "hue", name: null } as never),
    ).toThrow(/name must be a CSS identifier/);
  });

  it("rejects rotate on kinds without an angle and bad durations", () => {
    expect(() =>
      animatedGradientCss(
        { kind: "radial", stops: ["#000", "#fff"] },
        { kind: "rotate" },
      ),
    ).toThrow(VisError);
    expect(() =>
      animatedGradientCss(
        { kind: "radial", stops: ["#000", "#fff"] },
        { kind: "rotate" },
      ),
    ).toThrow("radial");
    for (const duration of [0, -1, Number.NaN, Infinity]) {
      expect(() =>
        animatedGradientCss(conic, { kind: "rotate", duration }),
      ).toThrow(VisError);
      expect(() =>
        animatedGradientCss(conic, { kind: "rotate", duration }),
      ).toThrow("duration");
    }
    expect(() =>
      animatedGradientCss(conic, { kind: "bounce" as never }),
    ).toThrow(VisError);
    expect(() =>
      animatedGradientCss(conic, { kind: "bounce" as never }),
    ).toThrow("bounce");
  });

  it("validates the spec it rotates, naming the value", () => {
    const rotate = { kind: "rotate" } as const;
    expect(() =>
      animatedGradientCss(
        { kind: "linear", angle: Number.NaN, stops: ["#000", "#fff"] },
        rotate,
      ),
    ).toThrow("angle");
    expect(() =>
      animatedGradientCss({ ...conic, from: Infinity }, rotate),
    ).toThrow("from");
    expect(() => animatedGradientCss({ ...conic, at: [2, 0] }, rotate)).toThrow(
      "`at`",
    );
    expect(() =>
      animatedGradientCss({ kind: "conic", stops: ["#000"] }, rotate),
    ).toThrow(VisError);
    expect(() =>
      animatedGradientCss(
        {
          kind: "conic",
          repeat: true,
          stops: [
            { color: "#000", at: 0.5 },
            { color: "#fff", at: 0.5 },
          ],
        },
        rotate,
      ),
    ).toThrow(VisError);
    expect(() =>
      animatedGradientCss(
        { kind: "linear", stops: ["#000", "#fff"], repeat: true },
        { kind: "shift" },
      ),
    ).not.toThrow();
  });

  it("only lets a selector or name that cannot break out of the rule", () => {
    const hue = { kind: "hue" } as const;
    for (const selector of [
      "",
      "   ",
      "a { color: red",
      "a } b",
      "a}",
      "a;b",
      "a;",
      "</style><script>",
      "a /* x */ b",
      "a/*",
      "a[",
      "a]",
      ":is(a",
      "a)",
      "a[x=(]",
      "a(])",
      'a[x="',
      "a[x='y']",
      "a'",
      'a"',
      "a\\",
      "a\\3b b",
      "a\\{",
      "@x",
      "@media print",
      "a\nb",
      "a\rb",
      "a\tb",
      "\u00e9l",
      "a\u2028b",
      "a\u007b",
      "a!important",
    ]) {
      expect(() => animatedGradientCss(conic, { ...hue, selector })).toThrow(
        VisError,
      );
      expect(() => animatedGradientCss(conic, { ...hue, selector })).toThrow(
        "selector",
      );
    }
    for (const selector of [
      ".hero",
      "#bg > .layer:nth-child(2)",
      "[data-x=y]",
      ".a, .b",
      "a:not(.b) + c ~ d",
      "li:nth-child(2n+1)",
      "[lang|=en]",
      "[href^=http]:hover",
      "*",
      "div:is(.a, .b)::before",
    ]) {
      const { css } = animatedGradientCss(conic, { ...hue, selector });
      expect(css.startsWith(`${selector} {`)).toBe(true);
      expect(css).toContain(`{ ${selector} { animation: none; } }`);
    }
    for (const name of ["", "a b", "a}", "1abc", "a;b", "--x"]) {
      expect(() => animatedGradientCss(conic, { ...hue, name })).toThrow(
        VisError,
      );
      expect(() => animatedGradientCss(conic, { ...hue, name })).toThrow(
        "name",
      );
    }
    expect(
      animatedGradientCss(conic, { ...hue, name: "my_grad-1" }).keyframes,
    ).toContain("@keyframes my_grad-1-hue");
  });

  it("is byte-identical for the same input", () => {
    expect(animatedGradientCss(conic, { kind: "rotate" })).toEqual(
      animatedGradientCss(conic, { kind: "rotate" }),
    );
  });

  it("matches its golden", () => {
    const r = animatedGradientCss(conic, { kind: "rotate" });
    expectGolden("gradient/animated-rotate.css", `${r.keyframes}\n${r.css}\n`);
  });
});
