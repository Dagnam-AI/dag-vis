import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

import type * as FsPromises from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { FAVICON_FILES, favicons } from "../../src/node/favicons.js";
import type { FaviconsOptions } from "../../src/node/favicons.js";
import type { Raster } from "../helpers/render.js";
import { PNG_SIG, decode, dims, pixel } from "./png-helpers.js";

/** Reads `file` from `dir` as a Buffer. */
const read = (dir: string, file: string): Buffer =>
  readFileSync(join(dir, file));
const manifestOf = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, "site.webmanifest"), "utf8")) as Record<
    string,
    unknown
  >;
/** The VisError a promise rejects with. */
async function rejection(promise: Promise<unknown>): Promise<VisError> {
  try {
    await promise;
  } catch (error) {
    // By name: a test that re-imports the module gets a second VisError class.
    expect(error).toMatchObject({ name: "VisError" });
    return error as VisError;
  }
  throw new Error("expected the promise to reject");
}
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

/** Parses an ICO from raw bytes, asserting the container layout as it goes. */
function parseIco(ico: Buffer) {
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  const count = ico.readUInt16LE(4);
  let expectedOffset = 6 + 16 * count;
  return Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i;
    const size = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    expect(offset).toBe(expectedOffset); // payloads sit back to back
    expectedOffset += size;
    const png = ico.subarray(offset, offset + size);
    expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    expect(ico.readUInt16LE(at + 4)).toBe(1); // planes
    expect(ico.readUInt16LE(at + 6)).toBe(32); // bpp
    const [w, h] = dims(png);
    expect(ico.readUInt8(at)).toBe(w === 256 ? 0 : w);
    expect(ico.readUInt8(at + 1)).toBe(h === 256 ? 0 : h);
    if (i === count - 1) expect(expectedOffset).toBe(ico.length);
    return { w, h, png };
  });
}

/** Bounding box and farthest distance from the centre of every pixel that differs from `bg`. */
function ink(r: Raster, bg: number[]) {
  let minX = r.width;
  let minY = r.height;
  let maxX = -1;
  let maxY = -1;
  let far = 0;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const p = pixel(r, x, y);
      if (p.every((v, i) => v === bg[i])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      far = Math.max(
        far,
        Math.hypot(x + 0.5 - r.width / 2, y + 0.5 - r.height / 2),
      );
    }
  return { minX, minY, maxX, maxY, far };
}
const alphas = (r: Raster): Set<number> => {
  const out = new Set<number>();
  for (let i = 3; i < r.pixels.length; i += 4) out.add(Number(r.pixels[i]));
  return out;
};

describe("favicons", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dag-vis-favicons-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
    vi.doUnmock("../../src/node/render-png.js");
    vi.doUnmock("node:fs/promises");
  });

  it("writes the whole set with the documented sizes and a manifest", async () => {
    const out = join(dir, "nested", "public");
    const written = await favicons({ outDir: out });
    expect(written).toEqual(FAVICON_FILES.map((f) => join(out, f)));
    expect(FAVICON_FILES).toEqual([
      "favicon.ico",
      "favicon.svg",
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
      "site.webmanifest",
    ]);
    expect(readdirSync(out).sort()).toEqual([...FAVICON_FILES].sort());
    expect(
      parseIco(read(out, "favicon.ico")).map(({ w, h }) => [w, h]),
    ).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
    const svg = read(out, "favicon.svg").toString("utf8");
    expect(svg).toContain('fill="#ef4444"');
    expect(svg).not.toContain("<rect"); // transparent: no backdrop
    for (const [file, side] of [
      ["apple-touch-icon.png", 180],
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["icon-maskable-512.png", 512],
    ] as const)
      expect(dims(read(out, file))).toEqual([side, side]);
    const manifest = manifestOf(out);
    expect(manifest).toEqual({
      name: "Dagnam.AI",
      short_name: "Dagnam",
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      theme_color: "#0a0a0a",
      background_color: "#0a0a0a",
      display: "standalone",
    });
    // every manifest icon exists on disk with the size it claims, and its src
    // is relative to the manifest (no leading slash), so it also resolves when
    // the site is served under a sub-path
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      expect(icon.src).not.toMatch(/^[/\\]|^[a-z][a-z0-9+.-]*:/i);
      const [w] = dims(read(out, icon.src));
      expect(icon.sizes).toBe(`${w}x${w}`);
    }
  });

  it("makes the opaque icons fully opaque and the ICO and SVG transparent", async () => {
    await favicons({ outDir: dir, background: "#123456" });
    const bg = [0x12, 0x34, 0x56, 255];
    for (const file of [
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ]) {
      const r = decode(read(dir, file));
      expect([...alphas(r)], file).toEqual([255]);
      expect(pixel(r, 0, 0), file).toEqual(bg);
      expect(pixel(r, r.width - 1, r.height - 1), file).toEqual(bg);
      expect(ink(r, bg).maxX, file).toBeGreaterThan(0); // the logo is there
    }
    for (const { png } of parseIco(read(dir, "favicon.ico"))) {
      const r = decode(png);
      expect(pixel(r, 0, 0)[3]).toBe(0);
      expect(alphas(r).has(255)).toBe(true); // and the mark is drawn
    }
  });

  it("places the logo at the documented padding", async () => {
    await favicons({ outDir: dir, background: "#123456" });
    const bg = [0x12, 0x34, 0x56, 255];
    // [file, size, padding]: the mark is as wide as its box (to within 5%:
    // the 180 px icon measures 132 px against 135, which 2.5% left on its edge).
    for (const [file, size, padding] of [
      ["apple-touch-icon.png", 180, 0.125],
      ["icon-192.png", 192, 0.1],
      ["icon-512.png", 512, 0.1],
      ["icon-maskable-512.png", 512, 0.2],
    ] as const) {
      const box = size * (1 - 2 * padding);
      const b = ink(decode(read(dir, file)), bg);
      expect(b.minX, file).toBeGreaterThanOrEqual(size * padding - 1);
      expect(b.maxX, file).toBeLessThanOrEqual(size * (1 - padding) + 1);
      expect(b.minY, file).toBeGreaterThanOrEqual(size * padding - 1);
      expect(b.maxY, file).toBeLessThanOrEqual(size * (1 - padding) + 1);
      expect(b.maxX - b.minX, file).toBeGreaterThan(box * 0.95);
    }
  });

  it("keeps the maskable icon's ink inside the 80% safe-zone circle", async () => {
    await favicons({ outDir: dir });
    const bg = [0x0a, 0x0a, 0x0a, 255];
    const r = decode(read(dir, "icon-maskable-512.png"));
    expect(ink(r, bg).far).toBeLessThanOrEqual(0.4 * 512);
    // and the plain icon is NOT inside it, so the test can tell the two apart
    const plain = decode(read(dir, "icon-512.png"));
    expect(ink(plain, bg).far).toBeGreaterThan(0.4 * 512);
  });

  it("honours colour, background and names, normalising colours", async () => {
    await favicons({
      outDir: dir,
      color: "RGB(255, 255, 255)",
      background: "#ABC",
      name: "X App",
      shortName: "X",
    });
    expect(read(dir, "favicon.svg").toString("utf8")).toContain(
      'fill="#ffffff"',
    );
    expect(manifestOf(dir)).toMatchObject({
      name: "X App",
      short_name: "X",
      theme_color: "#aabbcc",
      background_color: "#aabbcc",
    });
    expect(pixel(decode(read(dir, "icon-192.png")), 0, 0)).toEqual([
      0xaa, 0xbb, 0xcc, 255,
    ]);
  });

  it("writes a valid manifest for any allowed name", async () => {
    const names = [
      'He said "hi"',
      "back\\slash \\",
      "</script><b>&amp;",
      "naïve 日本語 ünï",
      "emoji 🚀👩💻",
      "lone \ud800 high",
      "lone \udc00 low",
      "   separators",
      "a".repeat(100),
    ];
    for (const name of names) {
      const shortName = Array.from(name).slice(0, 50).join("");
      await favicons({ outDir: dir, name, shortName });
      const manifest = manifestOf(dir);
      expect(manifest.name).toBe(name);
      expect(manifest.short_name).toBe(shortName);
    }
  });

  it("counts characters as code points, not UTF-16 units", async () => {
    // 100 emoji are 200 UTF-16 units but 100 characters; 101 are too many.
    await favicons({ outDir: dir, name: "😀".repeat(100) });
    expect(manifestOf(dir).name).toBe("😀".repeat(100));
    await favicons({ outDir: dir, shortName: "😀".repeat(50) });
    await expect(
      favicons({ outDir: dir, name: "😀".repeat(101) }),
    ).rejects.toThrow(/name must be 1\.\.100 characters, got 101/);
    await expect(
      favicons({ outDir: dir, shortName: "😀".repeat(51) }),
    ).rejects.toThrow(/shortName must be 1\.\.50 characters, got 51/);
  });

  it("uses defaults only for undefined, never for null", async () => {
    // What a JS caller (or a spread of optional values) can pass.
    const explicit: unknown = {
      outDir: dir,
      background: undefined,
      color: undefined,
      name: undefined,
      shortName: undefined,
    };
    await favicons(explicit as FaviconsOptions);
    expect(manifestOf(dir)).toMatchObject({
      name: "Dagnam.AI",
      short_name: "Dagnam",
      theme_color: "#0a0a0a",
    });
    for (const key of ["background", "color", "name", "shortName"])
      await expect(favicons({ outDir: dir, [key]: null })).rejects.toThrow(
        new RegExp(key),
      );
  });

  describe("validation", () => {
    const bad: [string, unknown, RegExp][] = [
      ["outDir", "", /outDir/],
      ["outDir", "   ", /outDir/],
      ["outDir", 5, /outDir/],
      ["outDir", null, /outDir/],
      ["outDir", undefined, /outDir/],
      ["outDir", "a\0b", /outDir.*NUL/],
      ["outDir", "x".repeat(5000), /outDir.*at most 4096/],
      ["background", "nope", /background/],
      ["background", 12, /background/],
      ["background", "", /background/],
      ["background", "transparent", /background/],
      ["background", "#ff000080", /background must be opaque/],
      ["background", "rgb(0 0 0 / 50%)", /background must be opaque/],
      ["color", "nope", /color/],
      ["color", {}, /color/],
      ["color", "#ff000080", /color must be opaque/],
      ["name", 5, /name must be a string/],
      ["name", "", /name must be 1\.\.100/],
      ["name", "x".repeat(101), /name must be 1\.\.100/],
      ["name", "a\nb", /name must not contain control/],
      ["name", "a\0b", /name must not contain control/],
      ["name", "a\u007fb", /name must not contain control/],
      ["name", "a\u0085b", /name must not contain control/],
      ["shortName", ["x"], /shortName must be a string/],
      ["shortName", "", /shortName must be 1\.\.50/],
      ["shortName", "x".repeat(51), /shortName must be 1\.\.50/],
      ["shortName", "tab\there", /shortName must not contain control/],
      ["name", "   ", /name must not be only whitespace/],
      ["name", "\u00a0\u3000", /name must not be only whitespace/],
      ["shortName", " ", /shortName must not be only whitespace/],
      ["name", "evil\u202egnp.exe", /name must not contain format.*U\+202E/],
      ["name", "a\u2066b", /name must not contain format.*U\+2066/],
      ["name", "a\u200bb", /name must not contain format.*U\+200B/],
      ["name", "a\u200db", /name must not contain format.*U\+200D/],
      ["name", "a\ufeffb", /name must not contain format.*U\+FEFF/],
      ["shortName", "x\u200ey", /shortName must not contain format.*U\+200E/],
      ["name", "tag\u{e0001}", /name must not contain format.*U\+E0001/],
    ];
    it.each(bad)("rejects %s = %j before touching disk", async (key, v, re) => {
      const out = join(dir, "out");
      const opts = key === "outDir" ? { outDir: v } : { outDir: out, [key]: v };
      const failure = favicons(opts as never);
      await expect(failure).rejects.toThrow(VisError);
      await expect(failure).rejects.toThrow(re);
      expect(readdirSync(dir)).toEqual([]);
    });

    it("rejects options that are not an object", async () => {
      for (const o of [null, undefined, "x", 3])
        await expect(favicons(o as never)).rejects.toThrow(
          /options must be an object/,
        );
    });

    it("quotes the offending value, truncated", async () => {
      await expect(
        favicons({ outDir: dir, color: "z".repeat(500) }),
      ).rejects.toThrow(/color.*at most 80 characters/);
    });
  });

  describe("disk behaviour", () => {
    it("is deterministic: two runs give byte-identical files", async () => {
      await favicons({ outDir: join(dir, "a") });
      await favicons({ outDir: join(dir, "b") });
      for (const f of FAVICON_FILES)
        expect(sha(read(join(dir, "a"), f)), f).toBe(
          sha(read(join(dir, "b"), f)),
        );
      // and re-running over an existing set rewrites the same bytes
      await favicons({ outDir: join(dir, "a") });
      for (const f of FAVICON_FILES)
        expect(sha(read(join(dir, "a"), f)), f).toBe(
          sha(read(join(dir, "b"), f)),
        );
    });

    it("overwrites old files and leaves no temp files or foreign files touched", async () => {
      writeFileSync(join(dir, "favicon.svg"), "old");
      writeFileSync(join(dir, "other.txt"), "mine");
      await favicons({ outDir: dir });
      expect(read(dir, "favicon.svg").toString("utf8")).toContain("<svg");
      expect(read(dir, "other.txt").toString("utf8")).toBe("mine");
      expect(readdirSync(dir).sort()).toEqual(
        [...FAVICON_FILES, "other.txt"].sort(),
      );
    });

    it("replaces a symlink at a target instead of writing through it", async () => {
      const outside = join(dir, "outside.txt");
      writeFileSync(outside, "keep me");
      const out = join(dir, "out");
      mkdirSync(out);
      symlinkSync(outside, join(out, "favicon.svg"));
      await favicons({ outDir: out });
      expect(readFileSync(outside, "utf8")).toBe("keep me");
      expect(statSync(join(out, "favicon.svg")).isFile()).toBe(true);
      expect(read(out, "favicon.svg").toString("utf8")).toContain("<svg");
    });

    it("names the file that failed, keeps the cause and leaves no half-written file", async () => {
      // A directory sits where favicon.svg must go, so the final rename fails.
      mkdirSync(join(dir, "favicon.svg"));
      const error = await rejection(favicons({ outDir: dir }));
      expect(error.message).toMatch(/could not write favicon\.svg/);
      expect(error.cause).toBeInstanceOf(Error);
      // favicon.ico, written before it, is complete; nothing after it was started
      expect(parseIco(read(dir, "favicon.ico"))).toHaveLength(3);
      expect(readdirSync(dir).sort()).toEqual(["favicon.ico", "favicon.svg"]);
      expect(statSync(join(dir, "favicon.svg")).isDirectory()).toBe(true);
    });

    it("names outDir when it cannot be created", async () => {
      const file = join(dir, "not-a-dir");
      writeFileSync(file, "x");
      const error = await rejection(favicons({ outDir: join(file, "sub") }));
      expect(error.message).toMatch(/could not create outDir/);
      expect(error.cause).toBeInstanceOf(Error);
    });

    it("reports a write that fails with a non-Error value", async () => {
      vi.resetModules();
      const actual =
        await vi.importActual<typeof FsPromises>("node:fs/promises");
      // What a misbehaving fs shim could reject with; typed as an Error to satisfy the linter.
      const notAnError = "disk on fire" as unknown as Error;
      vi.doMock("node:fs/promises", () => ({
        ...actual,
        writeFile: () => Promise.reject(notAnError),
      }));
      const { favicons: fresh } = await import("../../src/node/favicons.js");
      const error = await rejection(fresh({ outDir: dir }));
      expect(error.message).toBe(
        "favicons could not write favicon.ico: disk on fire",
      );
      expect(error.cause).toBe("disk on fire");
      expect(readdirSync(dir)).toEqual([]);
    });

    it("renders everything before touching disk", async () => {
      vi.resetModules();
      vi.doMock("../../src/node/render-png.js", () => ({
        renderPng: () => Promise.reject(new VisError("boom")),
      }));
      const { favicons: fresh } = await import("../../src/node/favicons.js");
      const out = join(dir, "never");
      await expect(fresh({ outDir: out })).rejects.toThrow("boom");
      expect(existsSync(out)).toBe(false);
    });

    it("resolves a relative outDir to absolute returned paths", async () => {
      const written = await favicons({ outDir: relative(process.cwd(), dir) });
      expect(written[0]).toBe(join(dir, "favicon.ico"));
      expect(written.every((p) => isAbsolute(p))).toBe(true);
    });
  });
});
