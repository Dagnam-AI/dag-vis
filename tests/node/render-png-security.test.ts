import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradientSvg } from "../../src/gradient/index.js";
import {
  FONT_FILES,
  MAX_CLIP_MASKS,
  MAX_OUTPUT_PIXELS,
  renderPng,
} from "../../src/node/render-png.js";
import { rasterize } from "../helpers/render.js";
import {
  NS,
  XL,
  dataPng,
  decode,
  dims,
  fake,
  fresh,
  image,
  pixel,
  redPng,
  scratch,
  seen,
  sized,
  textSvg,
} from "./png-helpers.js";

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
  writeFileSync(join(dir, "red.png"), redPng);
  writeFileSync(
    join(dir, "red.svg"),
    sized(10, 10, '<rect id="x" width="10" height="10" fill="#f00"/>'),
  );
  writeFileSync(join(dir, "red.css"), "rect{fill:#f00}");

  it("the guard is load-bearing: a bare resvg reads local files named by an image href", () => {
    expect(pixel(rasterize(image(join(dir, "red.png"))), 0, 0)).toEqual([
      255, 0, 0, 255,
    ]);
  });

  const hostile = (): Record<string, string> => ({
    "absolute path": image(join(dir, "red.png")),
    "xlink:href": image(join(dir, "red.png"), "image", "xlink:href"),
    "custom prefix on the xlink namespace": image(
      join(dir, "red.png"),
      "image",
      "q:href",
    ).replace(XL, 'xmlns:q="http://www.w3.org/1999/xlink"'),
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
      await expect(renderPng(svg)).rejects.toThrow(/external reference/);
    },
  );

  it("renders data: URIs and #fragment references", async () => {
    const png = decode(await renderPng(image(dataPng)));
    expect(pixel(png, 5, 5)).toEqual([255, 0, 0, 255]);
    const use = sized(
      10,
      10,
      '<defs><rect id="a" width="10" height="10" fill="#00f"/></defs><use href="#a"/>',
    );
    expect(pixel(decode(await renderPng(use)), 5, 5)).toEqual([0, 0, 255, 255]);
    const xlink = use
      .replace('href="#a"', 'xlink:href="#a"')
      .replace(NS, `${NS} ${XL}`);
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
    expect(pixel(decode(await renderPng(pi)), 5, 5)).toEqual(black);
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
    // An SVG nested as a data: URI is refused outright (see render-png-guard.test.ts).
    const nested = sized(10, 10, `<image href="${join(dir, "red.png")}"/>`);
    const outer = image(
      `data:image/svg+xml;base64,${Buffer.from(nested).toString("base64")}`,
    );
    await expect(renderPng(outer)).rejects.toThrow(/external reference/);
  });
});

describe("renderPng canvas cap with a stand-in resvg", () => {
  afterEach(() => {
    vi.doUnmock("@resvg/resvg-js");
    vi.resetModules();
    seen.length = 0;
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
});

describe("renderPng clipPath and mask count cap", () => {
  const many = (tag: string, n: number): string =>
    sized(10, 10, `<${tag} id="c"/>`.repeat(n));
  const reed = {
    kind: "fluted",
    reeds: 256,
    source: { kind: "linear", stops: ["#ef4444", "#10abba"] },
  } as const;
  /** A `layers` spec of `n` fluted-256 layers: the generators emit one <clipPath> per reed. */
  const fluted = (n: number, size = { width: 300, height: 150 }): string =>
    gradientSvg({ kind: "layers", layers: Array(n).fill(reed), size });
  const clipPaths = (svg: string): number =>
    (svg.match(/<clipPath[ >]/g) ?? []).length;

  it("rejects more than MAX_CLIP_MASKS clipPath or mask elements, counted together, with or without a prefix, naming the count and the limit", async () => {
    expect(MAX_CLIP_MASKS).toBe(5000);
    await expect(
      renderPng(many("clipPath", MAX_CLIP_MASKS + 1)),
    ).rejects.toThrow(
      "svg must have at most 5000 <clipPath> and <mask> elements, got 5001",
    );
    await expect(renderPng(many("mask", MAX_CLIP_MASKS + 1))).rejects.toThrow(
      /<clipPath> and <mask> elements, got 5001/,
    );
    await expect(
      renderPng(many("svg:mask", MAX_CLIP_MASKS + 1)),
    ).rejects.toThrow(/got 5001/);
    const half = MAX_CLIP_MASKS / 2;
    await expect(
      renderPng(
        sized(
          10,
          10,
          '<clipPath id="a"/>'.repeat(half) + '<mask id="b"/>'.repeat(half + 1),
        ),
      ),
    ).rejects.toThrow(/got 5001/);
  });

  it("renders exactly MAX_CLIP_MASKS of them", async () => {
    expect(dims(await renderPng(many("clipPath", MAX_CLIP_MASKS)))).toEqual([
      10, 10,
    ]);
  });

  it("does not reject realistic layered specs: 8 fluted-256 layers (2048 sibling clipPaths) render", async () => {
    const svg = fluted(8);
    expect(clipPaths(svg)).toBe(2048); // over the 2000 this cap used to be
    expect(dims(await renderPng(svg))).toEqual([300, 150]);
  });

  it("rejects a generated SVG with 5001 or more clipPaths: 20 fluted-256 layers is 5120", async () => {
    // 19 layers (4864) is still under the cap, 20 is over: "more than about 19 fluted-256 layers".
    expect(clipPaths(fluted(19))).toBe(4864);
    const svg = fluted(20);
    expect(clipPaths(svg)).toBe(5120);
    await expect(renderPng(svg)).rejects.toThrow(
      "svg must have at most 5000 <clipPath> and <mask> elements, got 5120",
    );
  });
});

describe("gradient overlay images", () => {
  const overlay = (image: string): string =>
    gradientSvg({
      kind: "linear",
      stops: ["#000000", "#000000"],
      overlay: { image },
      size: { width: 10, height: 10 },
    });

  it("must be data: URIs with a comma to render to PNG; the generator writes them as an <image href>", async () => {
    expect(overlay(dataPng)).toContain("<image href=");
    expect(pixel(decode(await renderPng(overlay(dataPng))), 5, 5)).toEqual([
      255, 0, 0, 255,
    ]);
    for (const url of [
      "https://example.com/a.png",
      "/etc/a.png",
      "a.png",
      "data:a.png",
    ])
      await expect(renderPng(overlay(url))).rejects.toThrow(
        /external reference/,
      );
  });
});
