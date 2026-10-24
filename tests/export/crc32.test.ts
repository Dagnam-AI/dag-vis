import { describe, expect, it } from "vitest";

import { crc32 } from "../../src/export/crc32.js";

describe("crc32", () => {
  it("matches the standard check value and the PNG IEND chunk CRC", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});
