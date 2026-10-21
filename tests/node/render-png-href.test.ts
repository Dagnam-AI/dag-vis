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

import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { renderPng } from "../../src/node/render-png.js";
import {
  NS,
  XL,
  dataPng,
  decode,
  dims,
  feImage,
  image,
  pixel,
  redPng,
  scratch,
  sized,
} from "./png-helpers.js";

describe("renderPng href rules are element-aware and deny by default", () => {
  // The hrefs resvg reads as relative paths although they look like `#id` or `data:` URLs.
  const fileHrefs = [
    "#red.png",
    "data:red.png",
    "#/../../res/red.png",
    "data:/../../res/red.png",
  ];
  const readers: [string, string][] = [
    ["image", "href"],
    ["image", "xlink:href"],
    ["feImage", "href"],
    ["feImage", "xlink:href"],
  ];
  const reading = (tag: string, attr: string, href: string): string =>
    tag === "image" ? image(href, "image", attr) : feImage(href, attr);

  // A file or directory called `data:` cannot exist on Windows, so this proof needs POSIX.
  it.skipIf(process.platform === "win32")(
    "proves the bypasses are real: a bare resvg run from a directory holding the named files renders them, for every guarded element and href form",
    () => {
      // base/res/red.png, and base/cwd holding `#red.png`, `data:red.png` and dirs `#`, `data:`.
      const base = mkdtempSync(join(scratch, "base-"));
      mkdirSync(join(base, "res"));
      writeFileSync(join(base, "res", "red.png"), redPng);
      const cwd = join(base, "cwd");
      mkdirSync(cwd);
      writeFileSync(join(cwd, "#red.png"), redPng);
      writeFileSync(join(cwd, "data:red.png"), redPng);
      mkdirSync(join(cwd, "#"));
      mkdirSync(join(cwd, "data:"));
      const probe = `
        const { Resvg } = require(process.argv[1]);
        const svgs = JSON.parse(process.argv[2]);
        console.log(JSON.stringify(svgs.map((svg) => {
          const px = new Resvg(svg).render().pixels;
          const at = (5 * 10 + 5) * 4;
          return px[at] > 200 && px[at + 1] < 60 && px[at + 3] > 200;
        })));`;
      const svgs = readers.flatMap(([tag, attr]) =>
        fileHrefs.map((href) => reading(tag, attr, href)),
      );
      const out = execFileSync(
        process.execPath,
        [
          "-e",
          probe,
          createRequire(import.meta.url).resolve("@resvg/resvg-js"),
          JSON.stringify(svgs),
        ],
        { cwd, encoding: "utf8" },
      );
      expect(JSON.parse(out)).toEqual(svgs.map(() => true));
    },
  );

  const bypasses: Record<string, string> = {
    ...Object.fromEntries(
      readers.flatMap(([tag, attr]) =>
        fileHrefs.map((href) => [
          `${tag} ${attr}=${href}`,
          reading(tag, attr, href),
        ]),
      ),
    ),
    "image href=#id even when that id exists": sized(
      10,
      10,
      '<rect id="a" width="1" height="1"/><image href="#a" width="10" height="10"/>',
    ),
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
