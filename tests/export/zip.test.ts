import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { crc32 } from "../../src/export/crc32.js";
import { zipStore } from "../../src/export/zip.js";

describe("zipStore", () => {
  it("writes local headers, a central directory and an EOCD that index every entry", () => {
    const a = new TextEncoder().encode("hello");
    const b = new Uint8Array([1, 2, 3, 4]);
    const zip = zipStore([
      { name: "a.txt", data: a },
      { name: "dir/b.bin", data: b },
    ]);
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint16(8, true)).toBe(0); // method: store
    expect(dv.getUint32(14, true)).toBe(crc32(a));
    expect(dv.getUint32(18, true)).toBe(5);
    expect(new TextDecoder().decode(zip.subarray(30, 35))).toBe("a.txt");
    expect(new TextDecoder().decode(zip.subarray(35, 40))).toBe("hello");
    const eocd = zip.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 10, true)).toBe(2);
    const cdSize = dv.getUint32(eocd + 12, true);
    const cdStart = dv.getUint32(eocd + 16, true);
    expect(dv.getUint32(cdStart, true)).toBe(0x02014b50);
    expect(cdStart + cdSize).toBe(eocd);
    const second = cdStart + 46 + 5;
    expect(dv.getUint32(second, true)).toBe(0x02014b50);
    expect(dv.getUint32(second + 42, true)).toBe(30 + 5 + 5); // offset of the second local header
  });

  it("handles an empty archive", () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
  });

  describe("format limits (no ZIP64)", () => {
    const empty = new Uint8Array(0);
    // A stand-in for a payload of `length` bytes that is never allocated: the
    // limits are checked from `length` before any byte is read.
    const huge = (length: number) => ({ length }) as unknown as Uint8Array;

    it("accepts 65535 entries and a 65535-byte name", () => {
      const many = zipStore(
        Array.from({ length: 65535 }, () => ({ name: "a", data: empty })),
      );
      expect(
        new DataView(many.buffer).getUint16(many.length - 22 + 10, true),
      ).toBe(65535);
      const long = zipStore([{ name: "n".repeat(65535), data: empty }]);
      expect(new DataView(long.buffer).getUint16(26, true)).toBe(65535);
    });

    it("rejects 65536 entries instead of wrapping the count", () => {
      const entries = Array.from({ length: 65536 }, () => ({
        name: "a",
        data: empty,
      }));
      expect(() => zipStore(entries)).toThrow(VisError);
      expect(() => zipStore(entries)).toThrow(/entries.*65535.*ZIP64/);
    });

    it("rejects a name longer than 65535 UTF-8 bytes (counted in bytes, not characters)", () => {
      expect(() =>
        zipStore([{ name: "n".repeat(65536), data: empty }]),
      ).toThrow(/entries\[0\]\.name.*65535.*ZIP64/);
      // 32768 two-byte characters are 65536 bytes.
      expect(() =>
        zipStore([{ name: "\u00e9".repeat(32768), data: empty }]),
      ).toThrow(VisError);
    });

    it("rejects an entry of 4 GiB or more", () => {
      expect(() => zipStore([{ name: "a", data: huge(2 ** 32) }])).toThrow(
        /entries\[0\]\.data.*4 GiB.*ZIP64/,
      );
    });

    it("rejects an archive whose later entry would start at or past 4 GiB", () => {
      const half = huge(2 ** 31 + 2 ** 30);
      expect(() =>
        zipStore([
          { name: "a", data: half },
          { name: "b", data: half },
          { name: "c", data: empty },
        ]),
      ).toThrow(/entries\[2\].*offset.*4 GiB.*ZIP64/);
    });

    it("rejects a central directory that would start past 4 GiB", () => {
      const nearly = huge(2 ** 32 - 1 - 30 - 1);
      expect(() =>
        zipStore([
          { name: "a", data: nearly },
          { name: "b", data: empty },
        ]),
      ).toThrow(/central directory starts.*4 GiB.*ZIP64/);
    });

    it("rejects a central directory that would end past 4 GiB", () => {
      // The single entry ends 11 bytes short of 4 GiB; its 47-byte directory record does not fit.
      expect(() =>
        zipStore([{ name: "a", data: huge(2 ** 32 - 11 - 31) }]),
      ).toThrow(/central directory ends.*4 GiB.*ZIP64/);
    });
  });
});
