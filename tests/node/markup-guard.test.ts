import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradientSvg } from "../../src/gradient/index.js";
import { MAX_CLIP_MASKS, checkMarkup } from "../../src/node/markup-guard.js";
import { renderPng } from "../../src/node/render-png.js";
import { bareLeaks, bluePngUri, canaryWorld } from "./guard-child.js";
import { NS, XL, feImage, image, sized } from "./png-helpers.js";

const EXTERNAL = /external reference/;
const UNCLASSIFIED = /cannot classify/;

const rejects = (svg: string, message: RegExp = EXTERNAL): void => {
  expect(() => {
    checkMarkup(svg);
  }).toThrow(VisError);
  expect(() => {
    checkMarkup(svg);
  }).toThrow(message);
};
const accepts = (svg: string): void => {
  expect(() => {
    checkMarkup(svg);
  }).not.toThrow();
};

describe.skipIf(process.platform === "win32")(
  "markup guard regressions found by the differential fuzz",
  () => {
    const world = canaryWorld();
    const run = (svg: string): boolean[] => bareLeaks([svg], world.cwd);

    // F1: a quote opened inside a comment, CDATA section or processing
    // instruction used to be swallowed into the next tag's match, hiding it.
    const hiding = (before: string): string =>
      `<svg ${NS} width="8" height="8">${before}<image width="8" href="canary.png"/></svg>`;

    it.each([
      ["a comment with a double quote", '<!--<b "-->'],
      ["a comment with a single quote", "<!--<b '-->"],
      ["a CDATA section", '<![CDATA[<b "]]>'],
      ["CDATA inside style", '<style><![CDATA[<b "]]></style>'],
      ["a processing instruction", "<?pi <b '?>"],
    ])(
      "rejects a canary image after %s (bare resvg reads the file)",
      async (_name, before) => {
        const svg = hiding(before);
        expect(run(svg)).toEqual([true]);
        rejects(svg);
        await expect(renderPng(svg)).rejects.toThrow(EXTERNAL);
      },
    );

    it("rejects the same through feImage and xlink:href", () => {
      for (const svg of [
        feImage("canary.png").replace("<filter", '<!--<b "--><filter'),
        image("canary.png", "image", "xlink:href").replace(
          "<image",
          "<![CDATA[<b ']]><image",
        ),
      ])
        rejects(svg);
    });

    // F2: resvg draws a data: URL that holds an SVG, and a nested <feImage>
    // there reads files again.
    const nested = sized(
      8,
      8,
      `<filter id="f"><feImage href="${world.abs}"/></filter><rect width="8" height="8" filter="url(#f)"/>`,
    );
    const nestedUris = [
      `data:image/svg+xml;base64,${Buffer.from(nested).toString("base64")}`,
      `data:image/svg+xml,${encodeURIComponent(nested)}`,
      `data:text/plain;base64,${Buffer.from(nested).toString("base64")}`,
      `data:;base64,${Buffer.from(nested).toString("base64")}`,
    ];

    it.each(nestedUris.map((uri) => [uri.slice(0, 26), uri] as const))(
      "refuses a nested SVG in a data: URL (%s...) on image",
      async (_name, uri) => {
        expect(run(image(uri))).toEqual([true]);
        rejects(image(uri));
        await expect(renderPng(image(uri))).rejects.toThrow(EXTERNAL);
      },
    );

    it("refuses a nested SVG that arrives through a gradient overlay", async () => {
      const svg = gradientSvg({
        kind: "linear",
        stops: ["#ffffff", "#ffffff"],
        size: { width: 16, height: 16 },
        overlay: { image: nestedUris[0] ?? "", opacity: 1 },
      });
      expect(run(svg)).toEqual([true]);
      await expect(renderPng(svg)).rejects.toThrow(EXTERNAL);
    });

    it("survives an accepted raster data: URL whose payload does not decode", async () => {
      const out = await renderPng(feImage("data:image/png;base64,AAAA"));
      expect(out.length).toBeGreaterThan(0);
    });

    // F3: a comma-bearing data: URL that is no image makes resvg panic inside
    // <feImage>, and the panic aborts the whole process.
    it("rejects data: URLs that abort resvg inside feImage instead of letting it kill the process", async () => {
      const abort = feImage("data:,");
      const probe = spawnSync(
        process.execPath,
        [
          "-e",
          "new (require(process.argv[1]).Resvg)(process.argv[2]).render(); console.log('rendered')",
          createRequire(import.meta.url).resolve("@resvg/resvg-js"),
          abort,
        ],
        { encoding: "utf8", timeout: 20_000 },
      );
      expect(probe.stdout).not.toContain("rendered");
      expect(probe.status === 0).toBe(false);
      for (const href of [
        "data:,",
        "data:x,y",
        "data:;base64,",
        "data:text/plain,hello",
      ])
        for (const svg of [feImage(href), image(href)]) {
          rejects(svg);
          await expect(renderPng(svg)).rejects.toThrow(EXTERNAL);
        }
    });
  },
);

describe("data: URLs on image and feImage are raster images only", () => {
  const good = [
    "data:image/png;base64,AAAA",
    "data:image/png,%89PNG",
    "data:image/jpeg;base64,AAAA",
    "data:image/jpg;base64,AAAA",
    "data:image/gif;base64,AAAA",
    "data:image/webp;base64,AAAA",
    "data:image/png;charset=utf-8;base64,AAAA",
    bluePngUri,
  ];
  const bad = [
    "data:image/svg+xml;base64,AAAA",
    "data:image/svg+xml,%3Csvg/%3E",
    "data:image/svg,x",
    "data:image/pngx,x",
    "data:image/png;base64",
    "data:image/png",
    "data:text/plain,hello",
    "data:text/html,hello",
    "data:application/octet-stream;base64,AAAA",
    "data:;base64,AAAA",
    "data:,",
    "data:",
    "data:image/,x",
    "data:image,x",
    "Data:image/png;base64,AAAA",
    "DATA:image/png;base64,AAAA",
    "data:IMAGE/PNG;base64,AAAA",
    " data:image/png;base64,AAAA",
  ];

  it.each(good)("accepts %s", (href) => {
    accepts(image(href));
    accepts(feImage(href));
    accepts(image(href, "image", "xlink:href"));
  });

  it.each(bad)("rejects %s", (href) => {
    rejects(image(href));
    rejects(feImage(href));
    rejects(image(href, "svg:image", "xlink:href"));
  });
});

describe("markup the guard cannot classify is refused", () => {
  const wrap = (inside: string): string =>
    `<svg ${NS} ${XL} width="8" height="8">${inside}</svg>`;

  it.each([
    ["an unterminated comment", wrap("<!-- no end")],
    ["an unterminated CDATA section", wrap("<![CDATA[ no end")],
    ["an unterminated processing instruction", wrap("<?pi no end")],
    ["an unterminated tag", `<svg ${NS}`],
    ["a tag that runs into another", wrap('<g x="1" <rect/>')],
    ["a quoted value holding a <", wrap('<g x="a<b"/>')],
    ["an unclosed quote", wrap('<g x="a/>')],
    ["a stray <", wrap("a < b")],
    ["a < at the very end", `<svg ${NS}/><`],
    ["a lone < before a space", wrap("< g/>")],
    ["a malformed end tag", wrap("<g></g x>")],
    ["an end tag with no name", wrap("<g></>")],
    ["an unterminated end tag", wrap("<g></g")],
    ["an unknown <! section", wrap("<!FOO bar>")],
    [
      "a DOCTYPE with an internal subset",
      `<!DOCTYPE svg [<!ELEMENT a ANY>]>${wrap("")}`,
    ],
    ["a DOCTYPE with no end", `<!DOCTYPE svg ${wrap("")}`],
    ["a DOCTYPE with an unclosed quote", `<!DOCTYPE svg "x>${wrap("")}`],
    ["a DOCTYPE holding a <", `<!DOCTYPE <svg>${wrap("")}`],
    ["a DOCTYPE with a bracket", `<!DOCTYPE svg ]>${wrap("")}`],
    ["a lower-case doctype", `<!doctype svg>${wrap("")}`],
  ])("%s", (_name, svg) => {
    rejects(svg, UNCLASSIFIED);
  });

  it("still names DTD entity declarations first", () => {
    rejects(
      `<!DOCTYPE svg [<!ENTITY e "x">]>${wrap("&e;")}`,
      /entity declarations/,
    );
  });
});

describe("markup the guard understands is accepted", () => {
  const wrap = (inside: string): string =>
    `<svg ${NS} ${XL} width="8" height="8">${inside}</svg>`;

  it.each([
    [
      "apostrophes and quotes in text",
      wrap(`<text>it's "q" &amp; a > b</text>`),
    ],
    ["a comment with quotes", wrap("<!-- it's \"x -->")],
    ["a comment with a harmless tag", wrap('<!-- <g id="a"/> -->')],
    ["CDATA with CSS", wrap('<style><![CDATA[a > b { c: "d" }]]></style>')],
    [
      "processing instructions",
      `<?xml version="1.0"?><?xml-stylesheet href="/x.css"?>${wrap("")}`,
    ],
    [
      "a plain DOCTYPE with ids that hold >",
      `<!DOCTYPE svg PUBLIC "-//W3C//DTD>" 'a>b'>${wrap("")}`,
    ],
    ["a DOCTYPE with no ids", `<!DOCTYPE svg>${wrap("")}`],
    ["end tags with spaces", wrap("<g></g  >")],
    ["a > inside a quoted value", wrap('<g title="a>b"/>')],
    ["an attribute with no value", wrap("<g hidden/>")],
    ["an unquoted attribute", wrap("<g x=1 />")],
    [
      "same-document references",
      wrap('<use href="#a"/><use xlink:href="#b"/>'),
    ],
    ["a tab and newline between name and attributes", wrap('<g\n\tid="a"/>')],
  ])("%s", (_name, svg) => {
    accepts(svg);
  });

  it("counts clipPath and mask elements, also in prefixed and inert text", () => {
    const many = (n: number, tag: string): string =>
      wrap(`<${tag}/>`.repeat(n));
    accepts(many(MAX_CLIP_MASKS, "mask"));
    rejects(many(MAX_CLIP_MASKS + 1, "mask"), /at most 5000/);
    rejects(wrap(`<!--${"<clipPath/>".repeat(MAX_CLIP_MASKS + 1)}-->`), /5000/);
  });
});

describe("the guard is linear in the input size", () => {
  const MB = 1_000_000;
  const timed = (svg: string): number => {
    const start = performance.now();
    try {
      checkMarkup(svg);
    } catch (error) {
      expect(error).toBeInstanceOf(VisError);
    }
    return performance.now() - start;
  };
  const hostile: Record<string, (size: number) => string> = {
    "a long run in one tag": (n) => `<svg ${NS}><a ${"x".repeat(n)}/></svg>`,
    "many tags with key-less runs": (n) =>
      `<svg ${NS}>${"<a xxxx".repeat(n / 7)}`,
    "many closed tags with key-less runs": (n) =>
      `<svg ${NS}>${"<a xxxx/>".repeat(n / 9)}</svg>`,
    "a long run of spaces and equals": (n) =>
      `<svg ${NS}><a x${" ".repeat(n)}=${" ".repeat(n)}y/></svg>`,
    "a long run of quotes in a tag": (n) =>
      `<svg ${NS}><a ${'"'.repeat(n)}/></svg>`,
    "a long run of single quotes in text": (n) =>
      `<svg ${NS}>${"'".repeat(n)}</svg>`,
    "an unterminated quoted value": (n) =>
      `<svg ${NS}><a title="${"x ".repeat(n / 2)}`,
    "an unterminated comment": (n) => `<svg ${NS}><!--${'<b "'.repeat(n / 4)}`,
    "a comment full of unclosed tags": (n) =>
      `<svg ${NS}><!--${'<b "'.repeat(n / 4)}--></svg>`,
    "a comment full of closed tags": (n) =>
      `<svg ${NS}><!--${"<b x='y'/>".repeat(n / 10)}--></svg>`,
    "many comments": (n) => `<svg ${NS}>${"<!---->".repeat(n / 7)}</svg>`,
    "many CDATA sections": (n) =>
      `<svg ${NS}>${"<![CDATA[<]]>".repeat(n / 13)}</svg>`,
    "a long DOCTYPE": (n) => `<!DOCTYPE svg "${"x".repeat(n)}">${sized(1, 1)}`,
    "a long unterminated DOCTYPE": (n) => `<!DOCTYPE svg ${"x".repeat(n)}`,
    "a long end tag": (n) => `<svg ${NS}></${"x".repeat(n)}`,
    "many nested-looking tags": (n) => `<svg ${NS}>${"<g>".repeat(n / 3)}`,
  };

  it.each(Object.keys(hostile))(
    "answers 1 MB of %s well inside two seconds, and 4x the input costs about 4x, not 16x",
    (name) => {
      const make = hostile[name] ?? ((): string => "");
      const small = make(MB / 4);
      const large = make(MB);
      // Best of three: one scheduling hiccup under load must not decide it.
      const best = (svg: string): number =>
        Math.min(timed(svg), timed(svg), timed(svg));
      const tSmall = Math.max(best(small), 1);
      const tLarge = best(large);
      expect(tLarge).toBeLessThan(2000);
      // Quadratic would be 16x; the margin absorbs timer noise and machine load.
      expect(tLarge).toBeLessThan(tSmall * 12 + 100);
    },
    30_000,
  );

  it("is deterministic on the worst cases: the same verdict twice", () => {
    for (const make of Object.values(hostile)) {
      const svg = make(10_000);
      const verdict = (): string => {
        try {
          checkMarkup(svg);
          return "accepted";
        } catch (error) {
          return error instanceof Error ? error.message : "?";
        }
      };
      expect(verdict()).toBe(verdict());
    }
  });
});
