import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOONHOUSE } from "../../src/brand/moonhouse-metrics.js";
import { UNBOUNDED } from "../../src/brand/unbounded-metrics.js";
import { FONT_FILES, renderPng } from "../../src/node/render-png.js";
import { coverSpec } from "../../src/scene/cover.js";
import { ogCard } from "../../src/scene/og-card.js";
import { fontWidth } from "../../src/scene/text-fonts.js";
import type { Raster } from "../helpers/render.js";
import { textContent } from "../helpers/svg-text.js";
import { ROOT } from "../helpers/ttf.js";
import { decode, dims, inkWidth, pixel, sized } from "./png-helpers.js";

/** Near-white: the card's text, never the red-on-dark art. */
const bright = (r: Raster, x: number, y: number): boolean =>
  pixel(r, x, y)
    .slice(0, 3)
    .every((v) => v > 230);
const FONTS = dirname(FONT_FILES[0] ?? "");
const read = (...path: string[]): string =>
  readFileSync(join(FONTS, ...path), "utf8");

describe("the bundled display fonts", () => {
  it("ship Unbounded under its OFL, with the project's copyright", () => {
    const ofl = read("OFL-Unbounded.txt");
    expect(ofl).toContain("Copyright 2022 The Unbounded Project Authors");
    expect(ofl).toContain("https://github.com/googlefonts/unbounded");
    expect(ofl).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it.each([
    ["Regular", 400],
    ["Medium", 500],
    ["Bold", 700],
  ] as const)(
    "ship Unbounded %s as a static instance: no variation tables, usWeightClass %i, family Unbounded",
    (face, weight) => {
      const buf = readFileSync(join(FONTS, `Unbounded-${face}.ttf`));
      const tags = Array.from({ length: buf.readUInt16BE(4) }, (_, i) =>
        buf.toString("latin1", 12 + 16 * i, 16 + 16 * i),
      );
      for (const variable of ["fvar", "gvar", "avar", "HVAR", "MVAR"])
        expect(tags).not.toContain(variable);
      const os2 = buf.readUInt32BE(12 + 16 * tags.indexOf("OS/2") + 8);
      expect(buf.readUInt16BE(os2 + 4)).toBe(weight);
      // The static-font naming convention: nameID 16/17 hold the family and style where
      // nameID 1/2 carry the legacy "Unbounded Medium" / "Regular" pair.
      const name = buf.readUInt32BE(12 + 16 * tags.indexOf("name") + 8);
      const strings = name + buf.readUInt16BE(name + 4);
      const names = new Map<number, string>();
      for (let i = 0; i < buf.readUInt16BE(name + 2); i++) {
        const rec = name + 6 + 12 * i;
        const at = strings + buf.readUInt16BE(rec + 10);
        names.set(
          buf.readUInt16BE(rec + 6),
          Buffer.from(buf.subarray(at, at + buf.readUInt16BE(rec + 8)))
            .swap16()
            .toString("utf16le"),
        );
      }
      expect(names.get(16) ?? names.get(1)).toBe("Unbounded");
      expect(names.get(17) ?? names.get(2)).toBe(face);
      expect(names.get(14)).toBe("https://scripts.sil.org/OFL");
    },
  );

  it("record where the Unbounded faces come from: upstream commit, source sha-256 and the recipe", () => {
    const source = read("UNBOUNDED-SOURCE.txt");
    for (const part of [
      "f3ec43228a864a72487e41552e2140efab9884ea",
      "323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f",
      "instantiateVariableFont",
      "name_IDs",
    ])
      expect(source).toContain(part);
  });

  it("ship Moonhouse alone in its directory, byte for byte, with its own licence and the owner-instruction note", () => {
    expect(readdirSync(join(FONTS, "moonhouse")).sort()).toEqual([
      "LICENSE-NOTE.txt",
      "moonhouse.ttf",
    ]);
    // sha-256 of the file as received from the app's public/fonts: unmodified, not subset, not renamed.
    expect(
      createHash("sha256")
        .update(readFileSync(join(FONTS, "moonhouse", "moonhouse.ttf")))
        .digest("hex"),
    ).toBe("a014f2f1f265653340d02f24af3f219023f993bed5801c99710dafbee220e827");
    const note = read("moonhouse", "LICENSE-NOTE.txt");
    expect(note).toContain("Copyright (c) 2013 by NimaVisual");
    expect(note).toContain(
      "The font files may not be modified without written permission from Andres Moreno W. / NimaVisual.",
    );
    expect(note).toContain(
      "Bundled at the package owner's instruction; terms require written permission from NimaVisual for redistribution; confirm or replace before relying on it.",
    );
  });

  it("are listed, with their licences and the Moonhouse caveat, in NOTICE (which the package ships)", () => {
    const notice = readFileSync(join(ROOT, "NOTICE"), "utf8");
    for (const part of [
      "Inter 4.1",
      "Unbounded",
      "Moonhouse",
      "SIL Open Font License 1.1",
      "NimaVisual",
      "written\n  permission from NimaVisual for redistribution",
    ])
      expect(notice).toContain(part);
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { files: string[]; scripts: Record<string, string> };
    expect(pkg.files).toContain("NOTICE");
    // The build copies the fonts directory with its subdirectory.
    expect(pkg.scripts.build).toContain("cp -R src/node/fonts/.");
  });
});

describe("renderPng with the bundled display fonts", () => {
  const ink = async (family: string, text: string, weight = "400") =>
    inkWidth(
      decode(
        await renderPng(
          sized(
            900,
            200,
            `<text x="20" y="150" font-family="${family}" font-size="100" font-weight="${weight}" fill="#fff">${text}</text>`,
          ),
        ),
      ),
    );

  it("draws Moonhouse and Unbounded, not a fallback, at the widths the metrics predict", async () => {
    // The ink is the advance sum less the side bearings: a bit narrower, never wider.
    const moon = await ink("moonhouse", "HELLO");
    const predictedMoon = fontWidth(MOONHOUSE, "HELLO", 100);
    expect(moon).toBeLessThanOrEqual(predictedMoon);
    expect(moon).toBeGreaterThan(0.9 * predictedMoon);
    const sans = await ink("Unbounded", "Hello");
    const predictedSans = fontWidth(UNBOUNDED, "Hello", 100);
    expect(sans).toBeLessThanOrEqual(predictedSans);
    expect(sans).toBeGreaterThan(0.9 * predictedSans);
    // An unknown family falls back to Inter, which is narrower than both.
    expect(await ink("NoSuchFace", "HELLO")).toBeLessThan(0.85 * moon);
    expect(await ink("NoSuchFace", "Hello")).toBeLessThan(0.85 * sans);
  });

  it("renders a social card to a 1200x630 PNG whose title is drawn in Moonhouse", async () => {
    const cover = coverSpec({
      family: "tag:ai",
      item: "my-post",
      theme: "dark",
      variant: "banner",
    });
    const png = await renderPng(
      ogCard({ title: "Hello", excerpt: "A short excerpt.", cover }),
    );
    expect(dims(png)).toEqual([1200, 630]);
    const raster = decode(png);
    // Opaque everywhere; white ink in the title band (y 80..172 at 92 px) and none right of it.
    expect(pixel(raster, 5, 5)[3]).toBe(255);
    const white = (x0: number, x1: number, y0: number, y1: number): number => {
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          if (bright(raster, x, y)) n++;
        }
      return n;
    };
    expect(white(80, 80 + 450, 80, 175)).toBeGreaterThan(2000);
    expect(white(80 + 600, 1200, 80, 175)).toBe(0);
    // The first row of ink starts where the metrics put it: just under the top margin, the cap height 0.7 em or so.
    expect(white(80, 80 + 450, 80, 90)).toBe(0);
  });

  it("keeps a title with curly quotes and an ellipsis in Moonhouse, which lacks them (a missing glyph would move the whole line to Inter)", async () => {
    const cover = coverSpec({ item: "q", theme: "dark", variant: "banner" });
    const raster = decode(
      await renderPng(ogCard({ title: "Don\u2019t stop\u2026", cover })),
    );
    let lo = raster.width;
    let hi = -1;
    for (let y = 80; y < 175; y++)
      for (let x = 0; x < raster.width; x++) {
        if (bright(raster, x, y)) {
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
      }
    const predicted = fontWidth(MOONHOUSE, "DON'T STOP...", 92);
    expect(hi - lo).toBeLessThanOrEqual(predicted);
    expect(hi - lo).toBeGreaterThan(0.9 * predicted);
  });

  it("draws the brand card's text in Unbounded and Moonhouse, not a fallback: every line's ink matches its font's advances", async () => {
    const svg = ogCard({
      title: "Build AI Systems Visually",
      subtitle: "A simpler way to design and orchestrate modern AI workflows.",
      footer: "Visual • Modular • Production-ready",
    });
    const raster = decode(await renderPng(svg));
    // White-ish ink only: the red art, the red rule and the red ".AI" and bullets have
    // little green and blue. Text sits over the dark left side of the card.
    const light = (x: number, y: number): boolean => {
      const p = pixel(raster, x, y);
      return (p[1] ?? 0) > 100 && (p[2] ?? 0) > 100;
    };
    const lines = [
      ...svg.matchAll(
        /<text x="([\d.]+)" y="([\d.]+)" font-family="([^"]+)" font-size="([\d.]+)"[^>]*>(.*?)<\/text>/g,
      ),
    ].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      moon: m[3]?.startsWith("moonhouse") === true,
      size: Number(m[4]),
      // The wordmark's red ".AI" (a child tspan) is not light ink: measure the text
      // before its first tag, "DAGNAM", alone. Other lines keep their children's text.
      text:
        m[3]?.startsWith("moonhouse") === true
          ? ((m[5] ?? "").split("<")[0] ?? "")
          : textContent(m[5] ?? ""),
    }));
    expect(lines).toHaveLength(6);
    for (const l of lines) {
      let hi = -1;
      for (let y = Math.floor(l.y - 0.7 * l.size); y < l.y; y++)
        for (let x = Math.floor(l.x); x < 700 + l.x; x++)
          if (light(x, y)) hi = Math.max(hi, x);
      const predicted = fontWidth(
        l.moon ? MOONHOUSE : UNBOUNDED,
        l.text,
        l.size,
      );
      // the ink ends where the advances say, less the last glyph's side bearing
      expect(hi - l.x, l.text).toBeLessThanOrEqual(predicted);
      expect(hi - l.x, l.text).toBeGreaterThan(0.88 * predicted);
    }
  });

  it("keeps the PNG identical between runs", async () => {
    const svg = ogCard({
      title: "Same",
      cover: coverSpec({ item: "a", theme: "dark", variant: "banner" }),
    });
    expect((await renderPng(svg)).equals(await renderPng(svg))).toBe(true);
  });

  it("bundles the files the card names, and registers every font file it ships", () => {
    for (const p of FONT_FILES) expect(existsSync(p)).toBe(true);
    const shipped = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? shipped(join(dir, e.name))
          : e.name.endsWith(".ttf")
            ? [join(dir, e.name)]
            : [],
      );
    expect([...FONT_FILES].sort()).toEqual(shipped(FONTS).sort());
  });

  it("lists every bundled font file in the tarball assertion", () => {
    const script = readFileSync(
      join(ROOT, ".github", "scripts", "assert-tarball.sh"),
      "utf8",
    );
    for (const p of FONT_FILES)
      expect(script).toContain(`dist/node/fonts/${p.slice(FONTS.length + 1)}`);
  });

  it("draws Unbounded at weights 400, 500 and 700 from the matching face", async () => {
    const png = (weight: string): Promise<Buffer> =>
      renderPng(
        sized(
          900,
          200,
          `<text x="20" y="150" font-family="Unbounded" font-size="100" font-weight="${weight}" fill="#fff">Hello</text>`,
        ),
      );
    const ink = (b: Buffer): number => {
      const r = decode(b);
      let sum = 0;
      for (let i = 3; i < r.pixels.length; i += 4) sum += r.pixels[i] ?? 0;
      return sum;
    };
    const [w400, w500, w700] = [
      await png("400"),
      await png("500"),
      await png("700"),
    ];
    expect(w400.equals(w500)).toBe(false);
    expect(w500.equals(w700)).toBe(false);
    expect(w400.equals(w700)).toBe(false);
    // Heavier strokes cover more of the same string: 700 clearly more than 400.
    expect(ink(w700)).toBeGreaterThan(1.15 * ink(w400));
    expect(ink(w500)).toBeGreaterThan(ink(w400));
    expect(ink(w700)).toBeGreaterThan(ink(w500));
  });
});
