import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { crc32 } from "../../src/export/crc32.js";
import { encodePng } from "../../src/node/png.js";
import { decode, pixel } from "./png-helpers.js";

interface Chunk {
  type: string;
  body: Buffer;
  crcOk: boolean;
}

/** Walk the chunk list after the signature, checking each CRC over type + body. */
function chunks(png: Buffer): Chunk[] {
  const out: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const typed = png.subarray(at + 4, at + 8 + len);
    out.push({
      type: typed.subarray(0, 4).toString("latin1"),
      body: typed.subarray(4),
      crcOk: png.readUInt32BE(at + 8 + len) === crc32(typed),
    });
    at += 12 + len;
  }
  expect(at).toBe(png.length);
  return out;
}

/** A gradient with a distinct byte at every position, so a misplaced row or channel shows. */
function pattern(w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37 + 11) & 0xff;
  return px;
}

describe("encodePng", () => {
  it("writes a valid 8-bit RGBA PNG whose IDAT inflates to filter-0 scanlines", () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128,
    ]);
    const png = encodePng(rgba, 2, 2);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(8)).toBe(13);
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(2);
    expect(Array.from(png.subarray(24, 29))).toEqual([8, 6, 0, 0, 0]);
    expect(png.readUInt32BE(29)).toBe(crc32(png.subarray(12, 29)));
    const idatLen = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString("latin1")).toBe("IDAT");
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(Array.from(raw)).toEqual([
      0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 128,
    ]);
    expect(png.subarray(-8, -4).toString("latin1")).toBe("IEND");
    expect(png.readUInt32BE(png.length - 4)).toBe(0xae426082);
  });

  it("is exactly IHDR, one IDAT and IEND, each with a correct CRC", () => {
    const list = chunks(encodePng(pattern(3, 2), 3, 2));
    expect(list.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(list.map((c) => c.crcOk)).toEqual([true, true, true]);
    expect(list[2]?.body.length).toBe(0);
  });

  it("keeps every row and channel in place for a non-square, odd-width image", () => {
    const w = 5;
    const h = 3;
    const px = pattern(w, h);
    const idat = chunks(encodePng(px, w, h)).find((c) => c.type === "IDAT");
    const raw = inflateSync(idat?.body ?? Buffer.alloc(0));
    const stride = w * 4;
    expect(raw.length).toBe((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      expect(raw[y * (stride + 1)]).toBe(0);
      expect(
        raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
      ).toEqual(Buffer.from(px.subarray(y * stride, (y + 1) * stride)));
    }
  });

  it("round-trips through an independent decoder", () => {
    const w = 4;
    const h = 3;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([200, 100, 50, 255], i * 4);
    px.set([0, 0, 0, 0], 0);
    const back = decode(encodePng(px, w, h));
    expect([back.width, back.height]).toEqual([w, h]);
    expect(pixel(back, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(back, 1, 0)).toEqual([200, 100, 50, 255]);
    expect(pixel(back, 3, 2)).toEqual([200, 100, 50, 255]);
  });

  it("accepts a 1 x 1 image and a Node Buffer", () => {
    const png = encodePng(Buffer.from([1, 2, 3, 4]), 1, 1);
    expect(chunks(png).every((c) => c.crcOk)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1);
  });

  it("is deterministic and does not read or keep the caller's buffer", () => {
    const px = pattern(2, 2);
    const a = encodePng(px, 2, 2);
    px.fill(0);
    expect(encodePng(pattern(2, 2), 2, 2).equals(a)).toBe(true);
  });

  it.each([
    ["width", 0, 2],
    ["width", 1.5, 2],
    ["width", Number.NaN, 2],
    ["width", Infinity, 2],
    ["width", -1, 2],
    ["width", 16385, 2],
    ["width", "2", 2],
    ["width", null, 2],
    ["height", 0, 2],
    ["height", 2.5, 2],
    ["height", 16385, 2],
    ["height", undefined, 2],
  ])("rejects %s = %s", (which, bad, good) => {
    const [w, h] = which === "width" ? [bad, good] : [good, bad];
    expect(() =>
      encodePng(new Uint8Array(16), w as number, h as number),
    ).toThrow(new RegExp(`^${which} must be`));
  });

  it("rejects a frame over the pixel cap before looking at the bytes", () => {
    expect(() => encodePng(new Uint8Array(4), 16384, 16384)).toThrow(
      /at most 33554432 pixels/,
    );
    expect(() => encodePng(new Uint8Array(4), 16384, 16384)).toThrow(VisError);
  });

  it("treats a frame of exactly the pixel cap as in range", () => {
    // 16384 x 2048 is exactly the cap, so only the byte-length check can reject it.
    expect(() => encodePng(new Uint8Array(4), 16384, 2048)).toThrow(
      /rgba must have 134217728 bytes for 16384 x 2048, got 4/,
    );
  });

  it("rejects a byte length that is not width x height x 4", () => {
    expect(() => encodePng(new Uint8Array(15), 2, 2)).toThrow(VisError);
    expect(() => encodePng(new Uint8Array(17), 2, 2)).toThrow(
      /rgba must have 16 bytes for 2 x 2, got 17/,
    );
  });

  it.each([
    ["a plain array", [0, 0, 0, 0]],
    ["a Uint16Array", new Uint16Array(4)],
    ["a DataView", new DataView(new ArrayBuffer(4))],
    ["an ArrayBuffer", new ArrayBuffer(4)],
    ["a string", "abcd"],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s as pixel data", (_name, bad) => {
    expect(() => encodePng(bad as unknown as Uint8Array, 1, 1)).toThrow(
      /^rgba must be a Uint8Array or Uint8ClampedArray/,
    );
  });
});
