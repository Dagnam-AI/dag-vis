import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  MAX_ICO_IMAGES,
  MAX_ICO_IMAGE_BYTES,
  icoFromPngs,
} from "../../src/node/ico.js";
import { renderPng } from "../../src/node/render-png.js";

const rect = (w: number, h: number): Promise<Buffer> =>
  renderPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ef4444"/></svg>`,
  );
const square = (n: number): Promise<Buffer> => rect(n, n);

/** A copy of `png` with `bytes` written at `at`. */
const patched = (png: Buffer, at: number, bytes: number[]): Buffer => {
  const copy = Buffer.from(png);
  Buffer.from(bytes).copy(copy, at);
  return copy;
};

describe("icoFromPngs", () => {
  it("writes a valid ICONDIR with one PNG entry per image", async () => {
    const pngs = [await square(16), await square(32), await square(256)];
    const ico = icoFromPngs(pngs);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(3); // count
    // entry 0
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(7)).toBe(16);
    expect(ico.readUInt8(8)).toBe(0); // palette colours
    expect(ico.readUInt8(9)).toBe(0); // reserved
    expect(ico.readUInt16LE(10)).toBe(1); // planes
    expect(ico.readUInt16LE(12)).toBe(32); // bpp
    expect(ico.readUInt32LE(14)).toBe(pngs[0]!.length);
    expect(ico.readUInt32LE(18)).toBe(6 + 16 * 3);
    // 256 is encoded as 0, in both byte positions
    expect(ico.readUInt8(6 + 32)).toBe(0);
    expect(ico.readUInt8(7 + 32)).toBe(0);
    // each entry's offset points at its own payload; payloads are back to back
    let offset = 6 + 16 * 3;
    pngs.forEach((png, i) => {
      expect(ico.readUInt32LE(6 + 16 * i + 8)).toBe(png.length);
      expect(ico.readUInt32LE(6 + 16 * i + 12)).toBe(offset);
      expect(ico.subarray(offset, offset + png.length).equals(png)).toBe(true);
      offset += png.length;
    });
    expect(ico.length).toBe(offset);
  });

  it("is deterministic and does not retain its inputs", async () => {
    const png = await square(16);
    const a = icoFromPngs([png]);
    png.fill(0);
    expect(icoFromPngs([await square(16)]).equals(a)).toBe(true);
    expect(
      a.subarray(22, 30).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    ).toBe(true);
  });

  it("accepts the maximum number of images", async () => {
    const png = await square(16);
    const ico = icoFromPngs(Array.from({ length: MAX_ICO_IMAGES }, () => png));
    expect(ico.readUInt16LE(4)).toBe(MAX_ICO_IMAGES);
  });

  it("rejects a bad list", async () => {
    const png = await square(16);
    expect(() => icoFromPngs([])).toThrow(/1\.\.16 images, got 0/);
    expect(() =>
      icoFromPngs(Array.from({ length: MAX_ICO_IMAGES + 1 }, () => png)),
    ).toThrow(/got 17/);
    for (const bad of [null, undefined, "x", 3, {}, png])
      expect(() => icoFromPngs(bad as never)).toThrow(VisError);
    expect(() => icoFromPngs(null as never)).toThrow(/pngs must be an array/);
  });

  it("rejects a sparse array: a hole reaches the validator, not a corrupt container", async () => {
    const png = await square(16);
    expect(() => icoFromPngs(new Array<Buffer>(2))).toThrow(VisError);
    expect(() => icoFromPngs(new Array<Buffer>(2))).toThrow(
      /pngs\[0\] must be a PNG/,
    );
    const holey = new Array<Buffer>(2);
    holey[0] = png;
    expect(() => icoFromPngs(holey)).toThrow(/pngs\[1\] must be a PNG/);
  });

  it("rejects an input that is not a PNG, naming its index", async () => {
    const png = await square(16);
    const bads: [string, unknown][] = [
      ["not a Buffer (string)", "89504e47"],
      ["not a Buffer (Uint8Array)", new Uint8Array(png)],
      ["a Buffer of text", Buffer.from("not a png")],
      ["too short", png.subarray(0, 20)],
      ["a wrong signature", patched(png, 0, [0x00])],
      ["a first chunk that is not IHDR", patched(png, 12, [0x58])],
      ["an IHDR of the wrong length", patched(png, 11, [0x0e])],
      ["a truncated file", png.subarray(0, png.length - 1)],
      ["trailing bytes after IEND", Buffer.concat([png, Buffer.from([0])])],
    ];
    for (const [label, bad] of bads) {
      expect(() => icoFromPngs([png, bad as Buffer]), label).toThrow(
        /pngs\[1\] must be a PNG/,
      );
      expect(() => icoFromPngs([png, bad as Buffer]), label).toThrow(VisError);
    }
  });

  it("rejects dimensions an ICO entry cannot hold", async () => {
    const png = await square(16);
    const dims: [string, Buffer][] = [
      ["300x300", await square(300)],
      ["257x257", await square(257)],
      ["16x8 (not square)", await rect(16, 8)],
      ["0x0", patched(png, 16, [0, 0, 0, 0, 0, 0, 0, 0])],
      ["0x16", patched(png, 16, [0, 0, 0, 0])],
    ];
    for (const [label, bad] of dims)
      expect(() => icoFromPngs([png, bad]), label).toThrow(
        /pngs\[1\] must be a square PNG of 1\.\.256 px/,
      );
  });

  it("rejects an image over the size cap", async () => {
    const png = await square(16);
    // A valid-looking PNG shell: signature + IHDR(16x16) + padding + IEND.
    const big = Buffer.concat([
      png.subarray(0, png.length - 12),
      Buffer.alloc(MAX_ICO_IMAGE_BYTES),
      png.subarray(png.length - 12),
    ]);
    expect(() => icoFromPngs([big])).toThrow(
      new RegExp(`at most ${MAX_ICO_IMAGE_BYTES} bytes`),
    );
  });
});
