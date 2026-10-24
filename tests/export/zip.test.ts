import { describe, expect, it } from "vitest";

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
});
