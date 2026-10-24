import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  ICNS_CHUNKS,
  MAX_ICNS_IMAGE_BYTES,
  icnsFromPngs,
} from "../../src/node/icns.js";
import { renderPng } from "../../src/node/render-png.js";
import { dims } from "./png-helpers.js";

const square = (n: number): Promise<Buffer> =>
  renderPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><rect width="${n}" height="${n}" fill="#ca0303"/></svg>`,
  );
const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

/** Independent reader: header, then typed big-endian chunks to the end. */
function parseIcns(icns: Buffer): { type: string; body: Buffer }[] {
  expect(icns.toString("latin1", 0, 4)).toBe("icns");
  expect(icns.readUInt32BE(4)).toBe(icns.length);
  const out: { type: string; body: Buffer }[] = [];
  let at = 8;
  while (at < icns.length) {
    const length = icns.readUInt32BE(at + 4);
    expect(length).toBeGreaterThan(8);
    out.push({
      type: icns.toString("latin1", at, at + 4),
      body: icns.subarray(at + 8, at + length),
    });
    at += length;
  }
  expect(at).toBe(icns.length); // chunks tile the file exactly
  return out;
}

describe("icnsFromPngs", () => {
  it("writes the documented PNG chunk for every size, 2x chunks reusing the same pixels", async () => {
    const pngs = await Promise.all(SIZES.map(square));
    const chunks = parseIcns(icnsFromPngs(pngs));
    // Type codes as macOS's own iconutil reads and writes them: ic07 128, ic08 256,
    // ic09 512, ic10 1024 (512@2x), ic11 32 (16@2x), ic12 64 (32@2x), ic13 256
    // (128@2x), ic14 512 (256@2x); icp4 and icp5 are the 16 and 32 px PNGs.
    expect(chunks.map((c) => [c.type, dims(c.body)[0]])).toEqual([
      ["icp4", 16],
      ["icp5", 32],
      ["ic11", 32],
      ["ic12", 64],
      ["ic07", 128],
      ["ic08", 256],
      ["ic13", 256],
      ["ic09", 512],
      ["ic14", 512],
      ["ic10", 1024],
    ]);
    for (const c of chunks) {
      expect(c.body.subarray(0, 8).equals(PNG_SIGNATURE), c.type).toBe(true);
      const png = pngs.find((p) => dims(p)[0] === dims(c.body)[0]);
      expect(c.body.equals(png ?? Buffer.alloc(0)), c.type).toBe(true);
    }
  });

  it("describes the same table it writes", () => {
    expect(ICNS_CHUNKS).toEqual({
      16: ["icp4"],
      32: ["icp5", "ic11"],
      64: ["ic12"],
      128: ["ic07"],
      256: ["ic08", "ic13"],
      512: ["ic09", "ic14"],
      1024: ["ic10"],
    });
  });

  it("takes any subset of the sizes, in any order, and writes them ascending", async () => {
    const chunks = parseIcns(
      icnsFromPngs([await square(512), await square(128)]),
    );
    expect(chunks.map((c) => c.type)).toEqual(["ic07", "ic09", "ic14"]);
  });

  it("is deterministic and does not retain its inputs", async () => {
    const png = await square(16);
    const a = icnsFromPngs([png]);
    png.fill(0);
    expect(icnsFromPngs([await square(16)]).equals(a)).toBe(true);
    expect(a.length).toBe(8 + 8 + (await square(16)).length);
  });

  it("rejects a bad list", async () => {
    const png = await square(16);
    expect(() => icnsFromPngs([])).toThrow(/1\.\.7 images, got 0/);
    for (const bad of [null, undefined, "x", 3, {}, png])
      expect(() => icnsFromPngs(bad as never)).toThrow(/pngs must be an array/);
    expect(() => icnsFromPngs([png, png])).toThrow(
      /pngs\[1\] repeats the 16 px size/,
    );
    expect(() => icnsFromPngs(new Array<Buffer>(1))).toThrow(
      /pngs\[0\] must be a PNG/,
    );
  });

  it("rejects an input that is not a PNG, naming its index", async () => {
    const png = await square(16);
    const bads: unknown[] = [
      "89504e47",
      new Uint8Array(png),
      Buffer.from("not a png"),
      png.subarray(0, png.length - 1),
    ];
    for (const bad of bads)
      expect(() => icnsFromPngs([png, bad as Buffer])).toThrow(
        /pngs\[1\] must be a PNG/,
      );
  });

  it("rejects a PNG whose size macOS has no chunk for", async () => {
    for (const side of [48, 100, 2048]) {
      const bad = await square(side);
      expect(() => icnsFromPngs([bad])).toThrow(VisError);
    }
    const forty8 = await square(48);
    expect(() => icnsFromPngs([forty8])).toThrow(
      /pngs\[0\] must be 16, 32, 64, 128, 256, 512 or 1024 px, got 48x48/,
    );
    // a larger side than any chunk is refused by the shared check, naming the range
    const huge = await square(2048);
    expect(() => icnsFromPngs([huge])).toThrow(
      /pngs\[0\] must be a square PNG of 1\.\.1024 px, got 2048x2048/,
    );
  });

  it("rejects a non-square PNG and an image over the size cap", async () => {
    const wide = await renderPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"><rect width="16" height="8"/></svg>',
    );
    expect(() => icnsFromPngs([wide])).toThrow(/square PNG/);
    const png = await square(16);
    const big = Buffer.concat([
      png.subarray(0, png.length - 12),
      Buffer.alloc(MAX_ICNS_IMAGE_BYTES),
      png.subarray(png.length - 12),
    ]);
    expect(() => icnsFromPngs([big])).toThrow(
      new RegExp(`at most ${MAX_ICNS_IMAGE_BYTES} bytes`),
    );
  });
});
