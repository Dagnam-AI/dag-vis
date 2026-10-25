import { describe, expect, it } from "vitest";

import { encodeWav } from "../../../src/lib/audio/wav.ts";

describe("encodeWav", () => {
  it("writes a 44-byte PCM16 header and interleaves mono samples into every channel, clipping to ±1", () => {
    const wav = encodeWav(Float32Array.from([0, 0.5, -1, 2]), 48000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(48000 * 4); // byte rate
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(4 * 2 * 2); // data bytes
    expect(v.getUint32(4, true)).toBe(36 + 16);
    expect(wav.length).toBe(44 + 16);
    const pcm = (i: number): number => v.getInt16(44 + i * 2, true);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(pcm)).toEqual([
      0, 0, 16384, 16384, -32767, -32767, 32767, 32767,
    ]);
  });
  it("supports mono", () => {
    expect(encodeWav(Float32Array.from([1]), 8000, 1).length).toBe(46);
  });
});
