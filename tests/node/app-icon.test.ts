import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appIconSvg } from "../../src/brand/app-icon.js";
import { VisError } from "../../src/core/errors.js";
import {
  APP_ICON_FILES,
  appIcon,
  appIconFiles,
} from "../../src/node/app-icon.js";
import { ICNS_CHUNKS } from "../../src/node/icns.js";
import { decode, dims, pixel } from "./png-helpers.js";

const read = (dir: string, file: string): Buffer =>
  readFileSync(join(dir, file));
const SIDES = [16, 32, 64, 128, 256, 512, 1024];

/** Chunks of an .icns, parsed independently of the writer. */
function chunksOf(icns: Buffer): { type: string; body: Buffer }[] {
  expect(icns.toString("latin1", 0, 4)).toBe("icns");
  expect(icns.readUInt32BE(4)).toBe(icns.length);
  const out: { type: string; body: Buffer }[] = [];
  for (let at = 8; at < icns.length;) {
    const length = icns.readUInt32BE(at + 4);
    out.push({
      type: icns.toString("latin1", at, at + 4),
      body: icns.subarray(at + 8, at + length),
    });
    at += length;
  }
  return out;
}

describe("appIcon", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dag-vis-app-icon-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
    vi.doUnmock("../../src/node/render-png.js");
  });

  it("writes the SVG master, the seven PNG sizes and the .icns, in the documented order", async () => {
    const out = join(dir, "nested", "mac");
    const written = await appIcon({ outDir: out });
    expect(APP_ICON_FILES).toEqual([
      "app-icon.svg",
      ...SIDES.map((n) => `app-icon-${n}.png`),
      "app-icon.icns",
    ]);
    expect(written).toEqual(APP_ICON_FILES.map((f) => join(out, f)));
    expect(readdirSync(out).sort()).toEqual([...APP_ICON_FILES].sort());
    expect(read(out, "app-icon.svg").toString("utf8")).toBe(appIconSvg());
    for (const side of SIDES)
      expect(dims(read(out, `app-icon-${side}.png`))).toEqual([side, side]);
  });

  it("draws a transparent canvas around an opaque dark plate carrying the deep-red mark", async () => {
    await appIcon({ outDir: dir });
    const big = decode(read(dir, "app-icon-1024.png"));
    expect(pixel(big, 4, 4)[3]).toBe(0);
    expect(pixel(big, 60, 512)[3]).toBe(0);
    expect(pixel(big, 140, 512)[3]).toBe(255);
    expect(pixel(big, 340, 512)).toEqual([0xca, 0x03, 0x03, 255]);
    const small = decode(read(dir, "app-icon-128.png"));
    expect(pixel(small, 0, 0)[3]).toBe(0);
    expect(pixel(small, 64, 64)[3]).toBe(255);
  });

  it("builds the .icns from exactly those PNGs: every chunk is the file of its size", async () => {
    await appIcon({ outDir: dir });
    const chunks = chunksOf(read(dir, "app-icon.icns"));
    const expected = SIDES.flatMap((side) =>
      (ICNS_CHUNKS[side as keyof typeof ICNS_CHUNKS] as readonly string[]).map(
        (type) => [type, side] as const,
      ),
    );
    expect(chunks.map((c) => c.type)).toEqual(expected.map(([t]) => t));
    chunks.forEach((chunk, i) => {
      const side = expected[i]?.[1] ?? 0;
      expect(
        chunk.body.equals(read(dir, `app-icon-${side}.png`)),
        chunk.type,
      ).toBe(true);
    });
  });

  it("honours colour and plate overrides, normalising them", async () => {
    await appIcon({
      outDir: dir,
      color: "RGB(255, 255, 255)",
      background: "#ABC",
    });
    const svg = read(dir, "app-icon.svg").toString("utf8");
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#aabbcc"');
    expect(
      pixel(decode(read(dir, "app-icon-1024.png")), 140, 512)[0],
    ).toBeGreaterThan(0xa0);
  });

  it("uses defaults only for undefined, never for null", async () => {
    const explicit: unknown = {
      outDir: dir,
      background: undefined,
      color: undefined,
    };
    await appIcon(explicit as never);
    expect(read(dir, "app-icon.svg").toString("utf8")).toBe(appIconSvg());
    for (const key of ["background", "color"])
      await expect(appIcon({ outDir: dir, [key]: null })).rejects.toThrow(
        new RegExp(key),
      );
  });

  it("validates before touching disk", async () => {
    const out = join(dir, "out");
    for (const [opts, re] of [
      [{ outDir: out, color: "nope" }, /color/],
      [{ outDir: out, color: "#ff000080" }, /color must be opaque/],
      [{ outDir: out, background: "transparent" }, /background/],
      [{ outDir: "" }, /outDir/],
      [{ outDir: "a\0b" }, /NUL/],
    ] as const) {
      const failure = appIcon(opts);
      await expect(failure).rejects.toThrow(VisError);
      await expect(failure).rejects.toThrow(re);
    }
    for (const o of [null, undefined, "x", 3])
      await expect(appIcon(o as never)).rejects.toThrow(
        /options must be an object/,
      );
    expect(existsSync(out)).toBe(false);
  });

  it("is deterministic and overwrites an earlier set without touching other files", async () => {
    writeFileSync(join(dir, "app-icon.svg"), "old");
    writeFileSync(join(dir, "other.txt"), "mine");
    await appIcon({ outDir: join(dir, "b") });
    await appIcon({ outDir: dir });
    for (const f of APP_ICON_FILES)
      expect(read(dir, f).equals(read(join(dir, "b"), f)), f).toBe(true);
    expect(read(dir, "other.txt").toString("utf8")).toBe("mine");
  });

  it("names appIcon and the file when a write fails", async () => {
    writeFileSync(join(dir, "not-a-dir"), "x");
    const error = await appIcon({
      outDir: join(dir, "not-a-dir", "sub"),
    }).catch((e: unknown) => e);
    expect((error as VisError).message).toMatch(
      /^appIcon could not create outDir/,
    );
  });

  it("renders everything before touching disk", async () => {
    vi.resetModules();
    vi.doMock("../../src/node/render-png.js", () => ({
      renderPng: () => Promise.reject(new VisError("boom")),
    }));
    const { appIcon: fresh } = await import("../../src/node/app-icon.js");
    const out = join(dir, "never");
    await expect(fresh({ outDir: out })).rejects.toThrow("boom");
    expect(existsSync(out)).toBe(false);
  });

  it("passes the look options through: the SVG and every PNG are that preset", async () => {
    const written = await appIcon({ outDir: dir, preset: "store" });
    // only the macos look makes an .icns
    expect(written.map((p) => relative(dir, p))).toEqual(
      APP_ICON_FILES.filter((f) => f !== "app-icon.icns"),
    );
    expect(existsSync(join(dir, "app-icon.icns"))).toBe(false);
    expect(read(dir, "app-icon.svg").toString("utf8")).toBe(
      appIconSvg({ preset: "store" }),
    );
    for (const side of [16, 128, 1024]) {
      const png = decode(read(dir, `app-icon-${side}.png`));
      for (const [x, y] of [
        [0, 0],
        [side - 1, 0],
        [0, side - 1],
        [side - 1, side - 1],
      ] as const)
        expect(pixel(png, x, y)).toEqual([0x0a, 0x0a, 0x0a, 255]);
    }
    await appIcon({
      outDir: join(dir, "round"),
      shape: "rounded",
      cornerRadius: 0.3,
      margin: 0.1,
      markScale: 0.5,
      flat: true,
    });
    expect(read(join(dir, "round"), "app-icon.svg").toString("utf8")).toBe(
      appIconSvg({
        shape: "rounded",
        cornerRadius: 0.3,
        margin: 0.1,
        markScale: 0.5,
        flat: true,
      }),
    );
  });

  it("writes exactly the PNG sizes asked for, ascending, and no .icns without the full set", async () => {
    const written = await appIcon({ outDir: dir, sizes: [512, 120] });
    expect(written.map((p) => relative(dir, p))).toEqual([
      "app-icon.svg",
      "app-icon-120.png",
      "app-icon-512.png",
    ]);
    expect(readdirSync(dir).sort()).toEqual([
      "app-icon-120.png",
      "app-icon-512.png",
      "app-icon.svg",
    ]);
    expect(dims(read(dir, "app-icon-120.png"))).toEqual([120, 120]);
    await appIcon({ outDir: join(dir, "b"), sizes: [120, 512] });
    for (const f of readdirSync(dir).filter((f) => f !== "b"))
      expect(read(dir, f).equals(read(join(dir, "b"), f)), f).toBe(true);
  });

  it("builds the .icns from the seven icns sizes when the set holds them all, leaving other sizes as extra PNGs", async () => {
    const written = await appIcon({ outDir: dir, sizes: [...SIDES, 120] });
    expect(written.map((p) => relative(dir, p))).toEqual([
      "app-icon.svg",
      ...[16, 32, 64, 120, 128, 256, 512, 1024].map((n) => `app-icon-${n}.png`),
      "app-icon.icns",
    ]);
    const chunks = chunksOf(read(dir, "app-icon.icns"));
    expect(chunks.map((c) => c.type)).toEqual(
      SIDES.flatMap(
        (n) => ICNS_CHUNKS[n as keyof typeof ICNS_CHUNKS] as readonly string[],
      ),
    );
    await appIcon({ outDir: join(dir, "six"), sizes: SIDES.slice(1) });
    expect(existsSync(join(dir, "six", "app-icon.icns"))).toBe(false);
  });

  it("takes the sizes cap as a limit, not an off-by-one: 16 entries are fine", async () => {
    const sizes = Array.from({ length: 16 }, (_, i) => 16 + i);
    expect(appIconFiles({ sizes })).toHaveLength(17);
    await appIcon({ outDir: dir, sizes });
    expect(readdirSync(dir)).toHaveLength(17);
  });

  it("lists the files for given sizes with appIconFiles; the default is APP_ICON_FILES", () => {
    expect(appIconFiles()).toEqual([...APP_ICON_FILES]);
    expect(appIconFiles({})).toEqual([...APP_ICON_FILES]);
    expect(appIconFiles({ sizes: [1024, 16] })).toEqual([
      "app-icon.svg",
      "app-icon-16.png",
      "app-icon-1024.png",
    ]);
    for (const preset of ["store", "maskable", "round"] as const)
      expect(appIconFiles({ preset })).toEqual(
        APP_ICON_FILES.filter((f) => f !== "app-icon.icns"),
      );
    expect(appIconFiles({ preset: "macos" })).toEqual([...APP_ICON_FILES]);
    expect(() => appIconFiles({ preset: "nope" as never })).toThrow(
      /app icon preset/,
    );
    expect(appIconFiles({ sizes: [...SIDES].reverse() })).toEqual([
      ...APP_ICON_FILES,
    ]);
  });

  it("validates sizes and the look before touching disk", async () => {
    const out = join(dir, "out");
    for (const [opts, re] of [
      [{ sizes: [] }, /sizes must be a non-empty array/],
      [{ sizes: "512" }, /sizes must be a non-empty array/],
      [{ sizes: null }, /sizes must be a non-empty array/],
      [{ sizes: [15] }, /sizes\[0\] must be an integer in 16\.\.1024/],
      [{ sizes: [16, 1025] }, /sizes\[1\] must be an integer in 16\.\.1024/],
      [{ sizes: [64.5] }, /integer/],
      [{ sizes: ["64"] }, /integer/],
      [
        { sizes: Object.assign(new Array<number>(3), { 0: 64, 2: 128 }) },
        /sizes\[1\]/,
      ],
      [{ sizes: [64, 128, 64] }, /sizes repeats 64/],
      [{ sizes: Array.from({ length: 17 }, (_, i) => 16 + i) }, /at most 16/],
      [{ size: 16 }, /does not take size/],
      [{ shape: "blob" }, /app icon shape/],
      [{ preset: "nope" }, /app icon preset/],
      [{ shape: "circle", cornerRadius: 0.1 }, /cornerRadius/],
      [{ margin: 0.5 }, /app icon margin/],
      [{ opaque: true }, /opaque needs/],
    ] as const) {
      const failure = appIcon({ outDir: out, ...opts } as never);
      await expect(failure).rejects.toThrow(VisError);
      await expect(failure).rejects.toThrow(re);
      if ("sizes" in opts)
        expect(() => appIconFiles(opts as never)).toThrow(re);
    }
    expect(existsSync(out)).toBe(false);
  });

  it("resolves a relative outDir to absolute returned paths", async () => {
    const written = await appIcon({ outDir: relative(process.cwd(), dir) });
    expect(written[0]).toBe(join(dir, "app-icon.svg"));
    expect(written.every((p) => isAbsolute(p))).toBe(true);
  });
});
