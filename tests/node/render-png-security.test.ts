import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  FONT_FILES,
  MAX_CLIP_MASKS,
  MAX_OUTPUT_PIXELS,
  renderPng,
} from "../../src/node/render-png.js";
import { rasterize } from "../helpers/render.js";
import {
  NS,
  decode,
  dims,
  fake,
  fresh,
  pixel,
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
      await expect(renderPng(svg)).rejects.toThrow(/external reference/);
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
    // An SVG nested as a data: URI cannot load files either.
    const nested = sized(10, 10, `<image href="${join(dir, "red.png")}"/>`);
    const outer = image(
      `data:image/svg+xml;base64,${Buffer.from(nested).toString("base64")}`,
    );
    expect(pixel(decode(await renderPng(outer)), 5, 5)).toEqual([0, 0, 0, 0]);
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

describe("renderPng href rules are element-aware and deny by default", () => {
  const XL = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
  const red = Buffer.from(
    new Resvg(sized(10, 10, '<rect width="10" height="10" fill="#f00"/>'))
      .render()
      .asPng(),
  );
  const dataPng = `data:image/png;base64,${red.toString("base64")}`;
  const image = (href: string, tag = "image", attr = "href"): string =>
    `<svg ${NS} ${XL} width="10" height="10"><${tag} ${attr}="${href}" width="10" height="10"/></svg>`;
  const feImage = (href: string, attr = "href"): string =>
    sized(
      10,
      10,
      `<filter id="f"><feImage ${attr}="${href}"/></filter><rect width="10" height="10" filter="url(#f)"/>`,
    ).replace(NS, `${NS} ${XL}`);

  it("proves the bypasses are real: a bare resvg run from a directory holding the named file renders it", () => {
    // `#red.png`, `data:red.png` (no comma) and dirs named `#` / `data:` are plain relative paths to resvg.
    const cwd = mkdtempSync(join(scratch, "cwd-"));
    writeFileSync(join(cwd, "red.png"), red);
    writeFileSync(join(cwd, "#red.png"), red);
    writeFileSync(join(cwd, "data:red.png"), red);
    mkdirSync(join(cwd, "#"));
    mkdirSync(join(cwd, "data:"));
    const probe = `
      const { Resvg } = require(process.argv[1]);
      const NS = 'xmlns="http://www.w3.org/2000/svg"';
      const hrefs = ["#red.png", "data:red.png", "#/../red.png", "data:/../red.png"];
      for (const href of hrefs) {
        const px = new Resvg('<svg ' + NS + ' width="4" height="4"><image href="' + href + '" width="4" height="4"/></svg>').render().pixels;
        console.log(px[0] > 200 && px[3] > 200);
      }`;
    const resvg = createRequire(import.meta.url).resolve("@resvg/resvg-js");
    const out = execFileSync(process.execPath, ["-e", probe, resvg], {
      cwd,
      encoding: "utf8",
    });
    expect(out.trim().split("\n")).toEqual(["true", "true", "true", "true"]);
  });

  const bypasses: Record<string, string> = {
    "image href=#red.png": image("#red.png"),
    "image href=data:red.png (no comma)": image("data:red.png"),
    "image href=#/../../res/red.png": image("#/../../res/red.png"),
    "image href=data:/../../res/red.png (no comma)": image(
      "data:/../../res/red.png",
    ),
    "image href=#id even when that id exists": sized(
      10,
      10,
      '<rect id="a" width="1" height="1"/><image href="#a" width="10" height="10"/>',
    ),
    "image xlink:href=#red.png": image("#red.png", "image", "xlink:href"),
    "image xlink:href=data:red.png": image(
      "data:red.png",
      "image",
      "xlink:href",
    ),
    "feImage href=#red.png (no such element)": feImage("#red.png"),
    "feImage href=data:red.png (no comma)": feImage("data:red.png"),
    "feImage href=#/../../res/red.png": feImage("#/../../res/red.png"),
    "feImage href=data:/../../res/red.png": feImage("data:/../../res/red.png"),
    "feImage xlink:href=#red.png": feImage("#red.png", "xlink:href"),
    "prefixed svg:image": `<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="10" height="10"><svg:image href="#red.png" width="10" height="10"/></svg:svg>`,
    "upper-case IMAGE element": image("#red.png", "IMAGE"),
    "upper-case HREF attribute": image("data:red.png", "image", "HREF"),
    "newline between element name and href": `<svg ${NS} width="10" height="10"><image\nhref="data:red.png"/></svg>`,
    "tab and newline around the equals sign": `<svg ${NS} width="10" height="10"><image\thref\n=\t'data:red.png'/></svg>`,
    "a > inside an earlier attribute value": `<svg ${NS} width="10" height="10"><image title="a>b" href="data:red.png"/></svg>`,
    "a quote of the other kind inside an earlier value": `<svg ${NS} width="10" height="10"><image title='"' href="data:red.png"/></svg>`,
    "href after many attributes": `<svg ${NS} width="10" height="10"><image x="0" y="0" width="10" height="10" opacity="1" href="#red.png"/></svg>`,
    "a tag hidden in a comment is checked as if live": sized(
      10,
      10,
      '<!-- <image href="data:red.png"/> -->',
    ),
    "a tag hidden in CDATA is checked as if live": sized(
      10,
      10,
      '<style><![CDATA[<image href="data:red.png"/>]]></style>',
    ),
  };

  it.each(Object.keys(bypasses))("rejects %s", async (name) => {
    const svg = bypasses[name] ?? "";
    await expect(renderPng(svg)).rejects.toThrow(VisError);
    await expect(renderPng(svg)).rejects.toThrow(/external reference/);
  });

  const notNames: Record<string, string> = {
    "a dot": "#a.b",
    "a slash": "#a/b",
    "a colon": "#a:b",
    "a leading dot": "#.hidden",
    "a path-like value": "#../res/red.png",
    "no name at all": "#",
    "a leading digit": "#1a",
    "a space": "#a b",
    "a fragment after a path": "other.svg#a",
    "an http url": "https://example.com/#a",
  };

  it.each(Object.keys(notNames))(
    "rejects a non-image href whose value is not a bare #NCName: %s",
    async (name) => {
      const href = notNames[name] ?? "";
      for (const svg of [
        sized(10, 10, `<use href="${href}"/>`),
        sized(10, 10, `<use xlink:href="${href}"/>`).replace(NS, `${NS} ${XL}`),
        sized(10, 10, `<pattern id="p" href="${href}"/>`),
        sized(10, 10, `<linearGradient id="g" href="${href}"/>`),
        sized(10, 10, `<a href="${href}"><rect width="1" height="1"/></a>`),
      ])
        await expect(renderPng(svg)).rejects.toThrow(/external reference/);
    },
  );

  it("requires a comma in an image or feImage data: URI, with the exact lower-case scheme", async () => {
    for (const make of [image, (h: string) => feImage(h)]) {
      for (const href of [
        "data:",
        "data:image/png;base64",
        "data:image/png",
        "DATA:,x",
        "Data:image/png;base64,AAAA",
        " data:,x",
      ])
        await expect(renderPng(make(href))).rejects.toThrow(
          /external reference/,
        );
    }
  });

  it("renders data: URIs with a comma on image and feImage", async () => {
    expect(pixel(decode(await renderPng(image(dataPng))), 5, 5)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(
      pixel(
        decode(await renderPng(image(dataPng, "image", "xlink:href"))),
        5,
        5,
      ),
    ).toEqual([255, 0, 0, 255]);
    expect(pixel(decode(await renderPng(feImage(dataPng))), 5, 5)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(dims(await renderPng(image("data:,")))).toEqual([10, 10]);
  });

  it("renders same-document references on use, pattern, gradients and filters", async () => {
    const svg = sized(
      10,
      10,
      `<defs>
        <symbol id="sym"><rect width="10" height="10" fill="#00f"/></symbol>
        <linearGradient id="base"><stop offset="0" stop-color="#00f"/><stop offset="1" stop-color="#00f"/></linearGradient>
        <linearGradient id="g_1-b" href="#base"/>
        <pattern id="pat" href="#pat0" width="10" height="10" patternUnits="userSpaceOnUse"/>
        <pattern id="pat0" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#g_1-b)"/></pattern>
      </defs>
      <use href="#sym"/>
      <rect width="10" height="10" fill="url(#pat)"/>`,
    );
    expect(pixel(decode(await renderPng(svg)), 5, 5)).toEqual([0, 0, 255, 255]);
    const xlink = sized(
      10,
      10,
      '<symbol id="y"/><use xlink:href="#y"/>',
    ).replace(NS, `${NS} ${XL}`);
    expect(dims(await renderPng(xlink))).toEqual([10, 10]);
  });

  it("no longer rejects href text that is not an attribute of a tag", async () => {
    for (const svg of [
      sized(10, 10, '<text y="8">href="https://example.com"</text>'),
      sized(10, 10, '<!-- href="https://example.com" -->'),
      sized(10, 10, '<style><![CDATA[ /* href="x" */ ]]></style>'),
      sized(10, 10, '<rect width="1" height="1" data-note="see href=\'/x\'"/>'),
      `<?xml-stylesheet href="/x.css" type="text/css"?>${sized(10, 10)}`,
    ])
      expect(dims(await renderPng(svg))).toEqual([10, 10]);
  });

  it("rejects DTD entity declarations, which can smuggle markup past any text scan", async () => {
    const P = join(scratch, "red.png");
    const decl = (body: string): string =>
      `<?xml version="1.0"?><!DOCTYPE svg [${body}]><svg ${NS} width="10" height="10">&e;</svg>`;
    for (const svg of [
      decl(`<!ENTITY e "<image href='${P}' width='10' height='10'/>">`),
      decl(`<!ENTITY e "<image hre&#102;='${P}'/>">`),
      decl(`<!ENTITY a "<image hr"><!ENTITY e "ef='${P}'/>">`),
      decl(
        `<!ENTITY % pe "<!ENTITY e '<image hr&#101;f=&#34;${P}&#34;/>'>"> %pe;`,
      ),
      decl(`<!ENTITY e SYSTEM "file:///etc/hosts">`),
    ])
      await expect(renderPng(svg)).rejects.toThrow(/entity declarations/);
  });

  it("keeps rendering a DOCTYPE without entities", async () => {
    const svg = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${sized(10, 10)}`;
    expect(dims(await renderPng(svg))).toEqual([10, 10]);
  });

  const goldens = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return goldens(path);
      return path.endsWith(".svg") ? [path] : [];
    });
  const goldenDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "goldens",
  );

  it("renders every golden SVG the package generates", async () => {
    const files = goldens(goldenDir);
    expect(files.length).toBeGreaterThanOrEqual(28);
    for (const file of files) {
      const png = await renderPng(readFileSync(file, "utf8"));
      expect(dims(png)[0], file).toBeGreaterThan(0);
    }
  });
});

describe("renderPng clipPath and mask count cap", () => {
  const many = (tag: string, n: number): string =>
    sized(10, 10, `<${tag} id="c"/>`.repeat(n));

  it("rejects more than MAX_CLIP_MASKS clipPath or mask elements, counted together, with or without a prefix", async () => {
    expect(MAX_CLIP_MASKS).toBe(2000);
    await expect(
      renderPng(many("clipPath", MAX_CLIP_MASKS + 1)),
    ).rejects.toThrow(/at most 2000 <clipPath> and <mask> elements/);
    await expect(renderPng(many("mask", MAX_CLIP_MASKS + 1))).rejects.toThrow(
      /<clipPath> and <mask>/,
    );
    await expect(
      renderPng(many("svg:mask", MAX_CLIP_MASKS + 1)),
    ).rejects.toThrow(/<clipPath> and <mask>/);
    const half = MAX_CLIP_MASKS / 2;
    await expect(
      renderPng(
        sized(
          10,
          10,
          '<clipPath id="a"/>'.repeat(half) + '<mask id="b"/>'.repeat(half + 1),
        ),
      ),
    ).rejects.toThrow(/<clipPath> and <mask>/);
  });

  it("renders exactly MAX_CLIP_MASKS of them", async () => {
    expect(dims(await renderPng(many("clipPath", MAX_CLIP_MASKS)))).toEqual([
      10, 10,
    ]);
  });
});
