import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  FONT_FILES,
  MAX_FONT_FILES,
  MAX_OUTPUT_PIXELS,
  MAX_SVG_LENGTH,
  renderPng,
} from "../../src/node/render-png.js";
import { ogCard } from "../../src/scene/og-card.js";
import { measureText } from "../../src/scene/text.js";
import { rasterize } from "../helpers/render.js";
import type { Raster } from "../helpers/render.js";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dims = (png: Buffer): [number, number] => [
  png.readUInt32BE(16),
  png.readUInt32BE(20),
];
const sized = (w: number, h: number, body = ""): string =>
  `<svg ${NS} width="${w}" height="${h}">${body}</svg>`;

/** Decode a PNG back to premultiplied RGBA by drawing it, unscaled, through resvg. */
function decode(png: Buffer): Raster {
  const [w, h] = dims(png);
  return rasterize(
    sized(
      w,
      h,
      `<image width="${w}" height="${h}" href="data:image/png;base64,${png.toString("base64")}"/>`,
    ),
  );
}
const pixel = (r: Raster, x: number, y: number): number[] =>
  Array.from(
    r.pixels.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
  );

/** Width in px between the leftmost and rightmost non-transparent columns. */
function inkWidth(r: Raster): number {
  let lo = r.width;
  let hi = -1;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      if (pixel(r, x, y)[3] !== 0) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
  return hi - lo + 1;
}

const textSvg = (
  text: string,
  size: number,
  weight: number,
  family = "Inter",
  width = Math.ceil(
    measureText(text, { size, weight: weight === 700 ? "bold" : "regular" }),
  ) + 60,
): string =>
  sized(
    width,
    Math.ceil(size * 1.6),
    `<text x="20" y="${size * 1.2}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="#fff">${text}</text>`,
  );

const scratch = mkdtempSync(join(tmpdir(), "dag-vis-render-png-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("FONT_FILES", () => {
  it("point at the bundled Inter Regular and Bold next to the module, under the OFL", () => {
    expect(FONT_FILES.map((p) => p.split("/").pop())).toEqual([
      "Inter-Regular.ttf",
      "Inter-Bold.ttf",
    ]);
    for (const p of FONT_FILES) expect(existsSync(p)).toBe(true);
    const ofl = readFileSync(
      FONT_FILES[0]?.replace("Inter-Regular.ttf", "OFL.txt") ?? "",
      "utf8",
    );
    expect(ofl).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});

describe("renderPng output", () => {
  it("renders an SVG at its own size, transparent by default", async () => {
    const png = await renderPng(
      sized(20, 10, '<rect width="10" height="10" fill="#f00"/>'),
    );
    expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    expect(dims(png)).toEqual([20, 10]);
    const px = decode(png);
    expect(pixel(px, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(px, 15, 5)).toEqual([0, 0, 0, 0]);
  });

  it("scales to `width` and the height follows the aspect ratio", async () => {
    const svg = sized(20, 10, '<circle cx="10" cy="5" r="2"/>');
    expect(dims(await renderPng(svg, { width: 200 }))).toEqual([200, 100]);
    expect(dims(await renderPng(svg, { width: 1 }))).toEqual([1, 1]);
    expect(
      dims(await renderPng(`<svg ${NS} viewBox="0 0 40 30"/>`, { width: 100 })),
    ).toEqual([100, 75]);
  });

  it("fills transparent areas with `background`, opaque or translucent", async () => {
    const svg = sized(4, 4, '<rect width="2" height="4" fill="#f00"/>');
    const opaque = decode(await renderPng(svg, { background: "#0a0a0a" }));
    expect(pixel(opaque, 3, 0)).toEqual([10, 10, 10, 255]);
    expect(pixel(opaque, 0, 0)).toEqual([255, 0, 0, 255]);
    const half = decode(
      await renderPng(svg, { background: "rgba(10, 10, 10, 0.5)" }),
    );
    expect(pixel(half, 3, 0)[3]).toBe(128);
  });

  it("is byte-identical across runs and draws text from the bundled fonts only", async () => {
    const card = ogCard({
      title: "Build AI Systems Visually",
      subtitle: "Deterministic text.",
    });
    const a = await renderPng(card);
    const b = await renderPng(card);
    expect(a.equals(b)).toBe(true);
    expect(dims(a)).toEqual([1200, 630]);
    // A family nobody installed falls back to the default family, which is the bundled Inter.
    const viaBundled = decode(
      await renderPng(textSvg("Dagnam", 40, 700, "Inter", 300)),
    );
    const viaFallback = decode(
      await renderPng(textSvg("Dagnam", 40, 700, "No Such Family", 300)),
    );
    expect(inkWidth(viaBundled)).toBeGreaterThan(50);
    expect(viaFallback.pixels).toEqual(viaBundled.pixels);
  });

  it("rejects malformed SVG with a VisError naming the parser error", async () => {
    await expect(renderPng("<svg")).rejects.toThrow(VisError);
    await expect(renderPng("<svg")).rejects.toThrow(
      /SVG could not be parsed: /,
    );
    await expect(renderPng("")).rejects.toThrow(VisError);
  });
});

describe("renderPng validation", () => {
  const ok = sized(8, 8);

  it.each([null, undefined, 5, {}, ["<svg/>"], Buffer.from(ok)])(
    "rejects an svg that is not a string: %s",
    async (svg) => {
      await expect(renderPng(svg as never)).rejects.toThrow(VisError);
      await expect(renderPng(svg as never)).rejects.toThrow(
        /svg must be a string/,
      );
    },
  );

  it("caps the SVG text at MAX_SVG_LENGTH without parsing it", async () => {
    await expect(renderPng("x".repeat(MAX_SVG_LENGTH + 1))).rejects.toThrow(
      /svg must be at most .* characters, got/,
    );
    const pad = MAX_SVG_LENGTH - sized(8, 8, "<!---->").length;
    const atCap = sized(8, 8, `<!--${"x".repeat(pad)}-->`);
    expect(atCap.length).toBe(MAX_SVG_LENGTH);
    expect(dims(await renderPng(atCap))).toEqual([8, 8]);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, 16385, "200", null, 2 ** 53])(
    "rejects width %s",
    async (width) => {
      await expect(renderPng(ok, { width } as never)).rejects.toThrow(VisError);
      await expect(renderPng(ok, { width } as never)).rejects.toThrow(
        /width must be an integer in 1\.\.16384/,
      );
    },
  );

  it("accepts width 1 and 16384, and defaults only on undefined", async () => {
    expect(dims(await renderPng(ok, { width: 1 }))).toEqual([1, 1]);
    expect(dims(await renderPng(sized(16384, 1), { width: 16384 }))).toEqual([
      16384, 1,
    ]);
    expect(dims(await renderPng(ok, { width: undefined } as never))).toEqual([
      8, 8,
    ]);
  });

  it.each(["nope", "", 5, null, {}, `#${"0".repeat(200)}`])(
    "rejects background %s",
    async (background) => {
      await expect(renderPng(ok, { background } as never)).rejects.toThrow(
        VisError,
      );
      await expect(renderPng(ok, { background } as never)).rejects.toThrow(
        /background/,
      );
    },
  );

  it.each([null, 5, "x", true])(
    "rejects options that are not an object: %s",
    async (opts) => {
      await expect(renderPng(ok, opts as never)).rejects.toThrow(
        /options must be an object/,
      );
    },
  );

  it("treats undefined options as defaults", async () => {
    expect(dims(await renderPng(ok, undefined))).toEqual([8, 8]);
  });
});

describe("renderPng output bounds", () => {
  it("rejects an SVG whose own size is too large, before rendering (resvg aborts the process on these)", async () => {
    await expect(
      renderPng(sized(1_000_000_000, 1_000_000_000)),
    ).rejects.toThrow(/too large/);
    await expect(renderPng(sized(20_000, 10))).rejects.toThrow(/too large/);
    await expect(renderPng(sized(10, 20_000))).rejects.toThrow(/too large/);
  });

  it("rejects an output over MAX_OUTPUT_PIXELS even when each side is within 16384", async () => {
    expect(MAX_OUTPUT_PIXELS).toBe(64_000_000);
    await expect(renderPng(sized(8001, 8000))).rejects.toThrow(
      /at most 64000000 pixels/,
    );
    await expect(
      renderPng(sized(1000, 1000), { width: 16384 }),
    ).rejects.toThrow(/too large/);
  });

  it("applies the aspect ratio of a tall SVG to `width`", async () => {
    await expect(
      renderPng(sized(1, 10_000_000), { width: 16384 }),
    ).rejects.toThrow(/too large/);
    await expect(renderPng(sized(1, 5), { width: 16384 })).rejects.toThrow(
      /too large/,
    );
    expect(dims(await renderPng(sized(1, 5), { width: 100 }))).toEqual([
      100, 500,
    ]);
  });
});

describe("renderPng external resources", () => {
  const dir = mkdtempSync(join(scratch, "res-"));
  const redPng = Buffer.from(
    new Resvg(sized(10, 10, '<rect width="10" height="10" fill="#f00"/>'))
      .render()
      .asPng(),
  );
  writeFileSync(join(dir, "red.png"), redPng);
  writeFileSync(
    join(dir, "red.svg"),
    sized(10, 10, '<rect id="x" width="10" height="10" fill="#f00"/>'),
  );
  writeFileSync(join(dir, "red.css"), "rect{fill:#f00}");

  const image = (href: string, attr = "href"): string =>
    sized(10, 10, `<image ${attr}="${href}" width="10" height="10"/>`);

  it("the guard is load-bearing: a bare resvg reads local files named by an image href", () => {
    expect(pixel(rasterize(image(join(dir, "red.png"))), 0, 0)).toEqual([
      255, 0, 0, 255,
    ]);
  });

  const hostile = (): Record<string, string> => ({
    "absolute path": image(join(dir, "red.png")),
    "xlink:href": image(join(dir, "red.png"), "xlink:href").replace(
      NS,
      `${NS} xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ),
    "custom prefix on the xlink namespace": image(
      join(dir, "red.png"),
      "q:href",
    ).replace(NS, `${NS} xmlns:q="http://www.w3.org/1999/xlink"`),
    "file:// url": image(`file://${join(dir, "red.png")}`),
    "relative path": image("red.png"),
    "parent path": image("../red.png"),
    "https url": image("https://example.com/a.png"),
    "http url": image("http://127.0.0.1:9/a.png"),
    "XML character reference hides the slash": image(
      `&#47;${join(dir, "red.png").slice(1)}`,
    ),
    "leading space": image(` ${join(dir, "red.png")}`),
    "upper-case DATA scheme": image("DATA:image/png;base64,AAAA"),
    "single quotes": sized(10, 10, `<image href='${join(dir, "red.png")}'/>`),
    "spaces around =": sized(
      10,
      10,
      `<image href \n = \t "${join(dir, "red.png")}"/>`,
    ),
    "external svg through use": sized(
      10,
      10,
      `<use href="${join(dir, "red.svg")}#x"/>`,
    ),
    "relative svg through use": sized(10, 10, '<use href="other.svg#x"/>'),
    feImage: sized(
      10,
      10,
      `<filter id="f"><feImage href="${join(dir, "red.png")}"/></filter><rect width="10" height="10" filter="url(#f)"/>`,
    ),
    "pattern image": sized(
      10,
      10,
      `<pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><image href="${join(dir, "red.png")}"/></pattern><rect width="10" height="10" fill="url(#p)"/>`,
    ),
    "empty href": image(""),
  });

  it.each(Object.keys(hostile()))(
    "rejects a non-data href: %s",
    async (name) => {
      const svg = hostile()[name] ?? "";
      await expect(renderPng(svg)).rejects.toThrow(VisError);
      await expect(renderPng(svg)).rejects.toThrow(
        /external reference .* only #fragment and data: URIs/,
      );
    },
  );

  it("renders data: URIs and #fragment references", async () => {
    const png = decode(
      await renderPng(
        image(`data:image/png;base64,${redPng.toString("base64")}`),
      ),
    );
    expect(pixel(png, 5, 5)).toEqual([255, 0, 0, 255]);
    const use = sized(
      10,
      10,
      '<defs><rect id="a" width="10" height="10" fill="#00f"/></defs><use href="#a"/>',
    );
    expect(pixel(decode(await renderPng(use)), 5, 5)).toEqual([0, 0, 255, 255]);
    const xlink = use
      .replace('href="#a"', 'xlink:href="#a"')
      .replace(NS, `${NS} xmlns:xlink="http://www.w3.org/1999/xlink"`);
    expect(pixel(decode(await renderPng(xlink)), 5, 5)).toEqual([
      0, 0, 255, 255,
    ]);
  });

  it("does not fetch stylesheets, fonts or nested files (probed on resvg-js 2.6.2; this fails if a resvg upgrade starts to)", async () => {
    const black = [0, 0, 0, 255];
    for (const style of [
      `@import url("file://${join(dir, "red.css")}");`,
      `@import "${join(dir, "red.css")}";`,
      `@import "https://example.com/a.css";`,
    ]) {
      const svg = sized(
        10,
        10,
        `<style>${style}</style><rect width="10" height="10"/>`,
      );
      expect(pixel(decode(await renderPng(svg)), 5, 5)).toEqual(black);
    }
    const pi = `<?xml-stylesheet href="${join(dir, "red.css")}" type="text/css"?>${sized(10, 10, '<rect width="10" height="10"/>')}`;
    // Its href is caught by the guard, as is any other href-looking text.
    await expect(renderPng(pi)).rejects.toThrow(/external reference/);
    const piBare = pi.replace(/ href="[^"]*"/, "");
    expect(pixel(decode(await renderPng(piBare)), 5, 5)).toEqual(black);
    // An @font-face pointing at the bold file must not change how an unknown family falls back.
    const face = `<style>@font-face{font-family:Foo;src:url(${FONT_FILES[1] ?? ""})}</style>`;
    const withFace = textSvg("Hamburg", 40, 400, "Foo", 300).replace(
      ">",
      `>${face}`,
    );
    const without = textSvg("Hamburg", 40, 400, "Foo", 300);
    expect(decode(await renderPng(withFace)).pixels).toEqual(
      decode(await renderPng(without)).pixels,
    );
    // An SVG nested as a data: URI cannot load files either.
    const nested = sized(10, 10, `<image href="${join(dir, "red.png")}"/>`);
    const outer = image(
      `data:image/svg+xml;base64,${Buffer.from(nested).toString("base64")}`,
    );
    expect(pixel(decode(await renderPng(outer)), 5, 5)).toEqual([0, 0, 0, 0]);
  });
});

describe("renderPng fontFiles", () => {
  /** Inter Bold under another family name ("Xnter"), so only a font the caller adds can supply it. */
  function writeXnter(name = "Xnter.ttf"): string {
    let bytes = readFileSync(FONT_FILES[1] ?? "");
    for (const [from, to] of [
      [Buffer.from("Inter", "latin1"), Buffer.from("Xnter", "latin1")],
      [
        Buffer.from("Inter", "utf16le").swap16(),
        Buffer.from("Xnter", "utf16le").swap16(),
      ],
    ] as const) {
      for (
        let at = bytes.indexOf(from);
        at >= 0;
        at = bytes.indexOf(from, at + from.length)
      )
        to.copy(bytes, at);
    }
    bytes = Buffer.from(bytes);
    const file = join(scratch, name);
    writeFileSync(file, bytes);
    return file;
  }

  it("appends the caller's font to the bundled ones", async () => {
    const xnter = writeXnter();
    const sample = textSvg("Hamburg", 60, 400, "Xnter", 500);
    const withoutIt = decode(await renderPng(sample));
    const withIt = decode(await renderPng(sample, { fontFiles: [xnter] }));
    const boldInter = decode(
      await renderPng(textSvg("Hamburg", 60, 700, "Inter", 500)),
    );
    expect(withIt.pixels).not.toEqual(withoutIt.pixels);
    expect(withIt.pixels).toEqual(boldInter.pixels);
  });

  it("accepts an empty list and upper-case extensions", async () => {
    const upper = join(scratch, "Upper.OTF");
    writeFileSync(upper, readFileSync(FONT_FILES[0] ?? ""));
    expect(dims(await renderPng(sized(8, 8), { fontFiles: [] }))).toEqual([
      8, 8,
    ]);
    expect(dims(await renderPng(sized(8, 8), { fontFiles: [upper] }))).toEqual([
      8, 8,
    ]);
  });

  it.each([
    ["not an array", "/a/b.ttf"],
    ["null", null],
    ["a string entry that is not absolute", ["fonts/a.ttf"]],
    ["a non-string entry", [5]],
    ["a null entry", [null]],
    ["a path with a NUL byte", [join(tmpdir(), "a\0.ttf")]],
    ["a wrong extension", [join(tmpdir(), "a.woff2")]],
    ["a missing file", [join(tmpdir(), "dag-vis-no-such-font.ttf")]],
  ])("rejects fontFiles that is %s", async (_name, fontFiles) => {
    await expect(
      renderPng(sized(8, 8), { fontFiles } as never),
    ).rejects.toThrow(VisError);
    await expect(
      renderPng(sized(8, 8), { fontFiles } as never),
    ).rejects.toThrow(/fontFiles/);
  });

  it("rejects a directory with a font extension and more than MAX_FONT_FILES entries", async () => {
    const dirLikeFont = join(scratch, "dir.ttf");
    mkdirSync(dirLikeFont);
    await expect(
      renderPng(sized(8, 8), { fontFiles: [dirLikeFont] }),
    ).rejects.toThrow(/fontFiles\[0\] must be an existing file/);
    const many = Array.from(
      { length: MAX_FONT_FILES + 1 },
      () => FONT_FILES[0] ?? "",
    );
    await expect(renderPng(sized(8, 8), { fontFiles: many })).rejects.toThrow(
      /fontFiles must have at most/,
    );
  });
});

describe("text measured against the bundled-Inter render", () => {
  const strings = [
    "Build AI Systems Visually",
    "A simpler way to design and orchestrate modern AI workflows.",
    "Visual • Modular • Production-ready",
    "The quick brown fox jumps over the lazy dog",
    "Dagnam.AI",
    "Ünïcödé façade déjà vu",
  ];

  it.each([
    ["regular", 400],
    ["bold", 700],
  ] as const)(
    "measureText agrees with the %s render: ink is never over 1%% wider, and at most 5%% narrower (side bearings)",
    async (weight, cssWeight) => {
      for (const s of strings) {
        const ink = inkWidth(
          decode(await renderPng(textSvg(s, 100, cssWeight))),
        );
        const measured = measureText(s, { size: 100, weight });
        expect(ink / measured, s).toBeGreaterThan(0.95);
        expect(ink / measured, s).toBeLessThan(1.01);
      }
    },
  );

  it("an ogCard title wraps inside its column in the real render", async () => {
    const title =
      "Build, train and deploy AI systems visually without writing boilerplate";
    const svg = ogCard({
      title,
      subtitle: "A simpler way to design and orchestrate modern AI workflows.",
    });
    const png = await renderPng(svg);
    expect(dims(png)).toEqual([1200, 630]);
    const lines = [
      ...svg.matchAll(
        /<text x="([\d.]+)" y="[\d.]+" font-family="[^"]*" font-size="([\d.]+)" fill="#[0-9a-f]+" font-weight="700">([^<]*)<\/text>/g,
      ),
    ];
    expect(lines.length).toBeGreaterThan(1);
    for (const [, x, size, line] of lines) {
      // Draw this exact line alone, with the card's font settings, and look at the ink.
      const ink = inkWidth(
        decode(await renderPng(textSvg(line ?? "", Number(size), 700))),
      );
      expect(Number(x) + ink, line).toBeLessThanOrEqual(0.6 * 1200 + Number(x));
    }
  });
});

describe("renderPng without or with a replaced @resvg/resvg-js", () => {
  afterEach(() => {
    vi.doUnmock("@resvg/resvg-js");
    vi.resetModules();
    seen.length = 0;
  });

  /** Constructor arguments of every fake Resvg built. */
  const seen: unknown[] = [];

  const fresh = async (factory: () => Record<string, unknown>) => {
    vi.resetModules();
    vi.doMock("@resvg/resvg-js", factory);
    return import("../../src/node/render-png.js");
  };

  const fake = (
    width: number,
    height: number,
    render: () => { asPng: () => Buffer } = () => ({
      asPng: () => Buffer.from("png"),
    }),
  ) =>
    class {
      width = width;
      height = height;
      constructor(...args: unknown[]) {
        seen.push(args);
      }
      render = render;
    };

  it("throws a VisError that tells the user how to install it", async () => {
    const { renderPng: render } = await fresh(() => {
      throw new Error("Cannot find module '@resvg/resvg-js'");
    });
    // A fresh module registry has its own VisError class, so match by name.
    await expect(render("<svg/>")).rejects.toMatchObject({ name: "VisError" });
    await expect(render("<svg/>")).rejects.toThrow("npm i -D @resvg/resvg-js");
  });

  it("validates before it tries to load the package", async () => {
    const { renderPng: render } = await fresh(() => {
      throw new Error("must not be loaded");
    });
    await expect(render(5 as never)).rejects.toThrow(/svg must be a string/);
  });

  it("loads the package once and reuses it for every call", async () => {
    const factory = vi.fn(() => ({ Resvg: fake(10, 10) }));
    const { renderPng: render } = await fresh(factory);
    await render(sized(10, 10));
    await render(sized(10, 10));
    await render(sized(10, 10));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("hands resvg the bundled fonts only, plus the caller's, and no system fonts", async () => {
    const Resvg = fake(10, 10);
    const { renderPng: render, FONT_FILES: files } = await fresh(() => ({
      Resvg,
    }));
    const extra = join(scratch, "extra.ttf");
    writeFileSync(extra, readFileSync(FONT_FILES[0] ?? ""));
    await render(sized(10, 10), {
      width: 50,
      background: "#0a0a0a",
      fontFiles: [extra],
    });
    expect(seen).toEqual([
      [
        sized(10, 10),
        {
          fitTo: { mode: "width", value: 50 },
          background: "#0a0a0a",
          font: {
            loadSystemFonts: false,
            fontFiles: [...files, extra],
            defaultFontFamily: "Inter",
          },
        },
      ],
    ]);
    await render(sized(10, 10));
    expect(seen[1]).toEqual([
      sized(10, 10),
      {
        fitTo: { mode: "original" },
        font: {
          loadSystemFonts: false,
          fontFiles: [...files],
          defaultFontFamily: "Inter",
        },
      },
    ]);
  });

  it("accepts exactly the pixel cap and rejects one pixel row more", async () => {
    const { renderPng: render } = await fresh(() => ({
      Resvg: fake(8000, 8000),
    }));
    expect((await render(sized(8000, 8000))).toString()).toBe("png");
    const over = await fresh(() => ({ Resvg: fake(8000, 8001) }));
    await expect(over.renderPng(sized(8000, 8001))).rejects.toThrow(/pixels/);
  });

  it("rejects a size resvg reports as zero or not a number instead of rendering it", async () => {
    const { renderPng: render } = await fresh(() => ({ Resvg: fake(0, 0) }));
    await expect(render(sized(1, 1), { width: 100 })).rejects.toThrow(
      /too large/,
    );
  });

  it("wraps a non-Error thrown by resvg, at parse time and at render time", async () => {
    const parse = await fresh(() => ({
      Resvg: class {
        width = 1;
        constructor() {
          const reason: unknown = "boom";
          throw reason;
        }
      },
    }));
    await expect(parse.renderPng("<svg/>")).rejects.toThrow(
      "SVG could not be parsed: boom",
    );
    const draw = await fresh(() => ({
      Resvg: fake(10, 10, () => {
        throw new Error("oom");
      }),
    }));
    await expect(draw.renderPng(sized(10, 10))).rejects.toThrow(
      "SVG could not be rendered: oom",
    );
  });
});
