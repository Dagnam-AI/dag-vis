import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  FONT_FILES,
  MAX_FONT_FILES,
  MAX_SVG_LENGTH,
  renderPng,
  renderRgba,
} from "../../src/node/render-png.js";
import { ogCard } from "../../src/scene/og-card.js";
import { measureText } from "../../src/scene/text.js";
import {
  NS,
  PNG_SIG,
  decode,
  dims,
  fake,
  fresh,
  inkWidth,
  pixel,
  scratch,
  seen,
  sized,
  textSvg,
} from "./png-helpers.js";

describe("FONT_FILES", () => {
  it("point at the bundled Inter Regular and Bold (first), Unbounded 400, 500 and 700 and Moonhouse next to the module, Inter under the OFL", () => {
    expect(FONT_FILES.map((p) => p.split("/").pop())).toEqual([
      "Inter-Regular.ttf",
      "Inter-Bold.ttf",
      "Unbounded-Regular.ttf",
      "Unbounded-Medium.ttf",
      "Unbounded-Bold.ttf",
      "moonhouse.ttf",
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
    const mismatched = `<svg ${NS} width="8" height="8"><g></svg>`;
    await expect(renderPng(mismatched)).rejects.toThrow(VisError);
    await expect(renderPng(mismatched)).rejects.toThrow(
      /SVG could not be parsed: /,
    );
    await expect(renderPng("")).rejects.toThrow(VisError);
    // Markup the href check cannot classify is refused before the parser sees it.
    await expect(renderPng("<svg")).rejects.toThrow(/cannot classify/);
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
    // The title lines: Unbounded 400 at 0.09 of the card height (56.7 px), 2 lines beside a subtitle.
    const lines = [
      ...svg.matchAll(
        /<text x="([\d.]+)" y="[\d.]+" font-family="Unbounded, sans-serif" font-size="56\.7" font-weight="400" fill="#[0-9a-f]+">([^<]*)<\/text>/g,
      ),
    ];
    expect(lines.length).toBe(2);
    for (const [, x, line] of lines) {
      // Draw this exact line alone, in the same face, and look at the ink.
      const ink = inkWidth(
        decode(
          await renderPng(textSvg(line ?? "", 56.7, 400, "Unbounded", 1200)),
        ),
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

  /**
   * A module whose `Resvg` export throws `error` as is. (Throwing from the mock
   * factory itself is no use: vitest wraps that error, hiding its code.)
   */
  const failing = (error: unknown): Record<string, unknown> => ({
    get Resvg(): never {
      throw error;
    },
  });

  /** What Node throws for a package that is not installed. */
  const notFound = (name: string, code = "ERR_MODULE_NOT_FOUND"): Error =>
    Object.assign(
      new Error(`Cannot find package '${name}' imported from /app/x.js`),
      { code },
    );

  it.each([
    ["an ES import", notFound("@resvg/resvg-js")],
    ["a require", notFound("@resvg/resvg-js", "MODULE_NOT_FOUND")],
    [
      "double quotes",
      Object.assign(new Error('Cannot find module "@resvg/resvg-js"'), {
        code: "MODULE_NOT_FOUND",
      }),
    ],
  ])(
    "throws a VisError that tells the user how to install it when the package is absent (%s)",
    async (_name, error) => {
      const { renderPng: render } = await fresh(() => failing(error));
      // A fresh module registry has its own VisError class, so match by name.
      await expect(render("<svg/>")).rejects.toMatchObject({
        name: "VisError",
      });
      await expect(render("<svg/>")).rejects.toThrow(
        "renderPng needs @resvg/resvg-js: run `npm i -D @resvg/resvg-js`",
      );
    },
  );

  it.each([
    [
      "the platform binary is missing",
      notFound("@resvg/resvg-js-darwin-arm64", "MODULE_NOT_FOUND"),
      /could not be loaded: Cannot find package '@resvg\/resvg-js-darwin-arm64'/,
    ],
    [
      "dlopen fails",
      new Error("dlopen(/x/resvg.node): code signature invalid"),
      /could not be loaded: dlopen\(\/x\/resvg\.node\): code signature invalid/,
    ],
    [
      "the error has another code",
      Object.assign(new Error("EACCES: permission denied, '@resvg/resvg-js'"), {
        code: "EACCES",
      }),
      /could not be loaded: EACCES/,
    ],
    [
      "a module not found error names something else",
      notFound("some-other-package"),
      /could not be loaded: Cannot find package 'some-other-package'/,
    ],
    [
      "the right code but a message that does not quote the package",
      Object.assign(
        new Error(
          "Cannot find package @resvg/resvg-js imported from /app/x.js",
        ),
        { code: "ERR_MODULE_NOT_FOUND" },
      ),
      /could not be loaded: Cannot find package @resvg\/resvg-js imported from/,
    ],
    ["a string is thrown", "boom", /could not be loaded: boom/],
    ["null is thrown", null, /could not be loaded: null/],
  ])(
    "keeps the original message and cause when the package is installed but fails to load (%s)",
    async (_name, error, message) => {
      const { renderPng: render } = await fresh(() => failing(error));
      const failure: unknown = await render("<svg/>").catch((e: unknown) => e);
      expect(failure).toMatchObject({ name: "VisError" });
      expect((failure as Error).message).toMatch(message);
      expect((failure as Error).message).not.toContain("npm i -D");
      expect((failure as Error).cause).toBe(error);
    },
  );

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

describe("renderRgba", () => {
  it("returns top-down RGBA at the requested width", async () => {
    const svg = sized(
      2,
      2,
      '<rect width="2" height="1" fill="#ff0000"/><rect y="1" width="2" height="1" fill="#0000ff"/>',
    );
    const { data, width, height } = await renderRgba(svg, { width: 4 });
    expect([width, height]).toEqual([4, 4]);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(4 * 4 * 4);
    expect(Array.from(data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(data.subarray(data.length - 4))).toEqual([
      0, 0, 255, 255,
    ]);
  });

  it("returns STRAIGHT alpha: a half-transparent red pixel keeps full red, and clear pixels are zero", async () => {
    const svg = sized(
      3,
      1,
      '<rect width="1" height="1" fill="#ff0000" fill-opacity="0.5"/><rect x="1" width="1" height="1" fill="#10c0ff" fill-opacity="0.25"/>',
    );
    const { data } = await renderRgba(svg);
    // resvg itself holds premultiplied bytes (128, 0, 0, 128); the PNG and ffmpeg both mean straight.
    expect(Array.from(data.subarray(0, 4))).toEqual([255, 0, 0, 128]);
    const [r, g, b, a] = Array.from(data.subarray(4, 8)) as [
      number,
      number,
      number,
      number,
    ];
    expect(a).toBe(64);
    expect(Math.abs(r - 0x10)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 0xc0)).toBeLessThanOrEqual(2);
    expect(b).toBe(255);
    expect(Array.from(data.subarray(8, 12))).toEqual([0, 0, 0, 0]);
    // The PNG encoder agrees: drawn back (premultiplied), each pixel is the straight bytes scaled by alpha.
    const drawn = decode(await renderPng(svg));
    for (const x of [0, 1, 2]) {
      const straight = Array.from(data.subarray(x * 4, x * 4 + 4));
      const back = pixel(drawn, x, 0);
      expect(back[3]).toBe(straight[3]);
      for (const c of [0, 1, 2])
        expect(
          Math.abs(
            (back[c] ?? NaN) -
              ((straight[c] ?? NaN) * (straight[3] ?? NaN)) / 255,
          ),
        ).toBeLessThanOrEqual(2);
    }
  });

  it("composites onto the background: every pixel opaque and exact", async () => {
    const svg = sized(
      1,
      1,
      '<rect width="1" height="1" fill="#ff0000" fill-opacity="0.5"/>',
    );
    const { data } = await renderRgba(svg, { background: "#0000ff" });
    const [r, g, b, a] = Array.from(data) as [number, number, number, number];
    expect([g, a]).toEqual([0, 255]);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(1);
  });

  it("applies the same checks as renderPng", async () => {
    await expect(renderRgba(sized(1, 1), { width: 0 })).rejects.toThrow(
      VisError,
    );
    await expect(renderRgba(sized(1, 1), { width: 1.5 })).rejects.toThrow(
      /width/,
    );
    await expect(renderRgba(42 as never)).rejects.toThrow(
      /svg must be a string/,
    );
    await expect(renderRgba("<not svg", {})).rejects.toThrow(VisError);
  });
});
