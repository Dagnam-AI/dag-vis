import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { encodeGif, PALETTE_SAMPLES } from "../../src/export/gif.js";

function frame(i: number): Uint8Array {
  const d = new Uint8Array(4 * 4 * 4);
  for (let p = 0; p < 16; p++) {
    d[p * 4] = (i * 40) & 255;
    d[p * 4 + 1] = p * 16;
    d[p * 4 + 2] = 200;
    d[p * 4 + 3] = 255;
  }
  return d;
}

describe("encodeGif", () => {
  it("produces a looping GIF89a with one frame per count and a shared palette", async () => {
    const calls: number[] = [];
    const bytes = await encodeGif({
      width: 4,
      height: 4,
      fps: 10,
      count: 12,
      frameAt: (i) => {
        calls.push(i);
        return frame(i);
      },
    });
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
    expect(bytes.at(-1)).toBe(0x3b);
    // NETSCAPE2.0 loop extension present (repeat forever)
    expect(new TextDecoder("latin1").decode(bytes)).toContain("NETSCAPE2.0");
    // 12 image descriptors (0x2c) at least
    expect(bytes.filter((b) => b === 0x2c).length).toBeGreaterThanOrEqual(12);
    // palette pass samples ceil(count / PALETTE_SAMPLES) stride, then every frame once
    const stride = Math.ceil(12 / PALETTE_SAMPLES);
    const sampled = calls.slice(0, Math.ceil(12 / stride));
    expect(sampled).toEqual([0, 2, 4, 6, 8, 10]);
    expect(calls.slice(sampled.length)).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
  });

  it("accepts Uint8ClampedArray frames, async frames and a single frame", async () => {
    const bytes = await encodeGif({
      width: 4,
      height: 4,
      fps: 1,
      count: 1,
      frameAt: () => new Uint8ClampedArray(frame(0)),
    });
    expect(bytes.length).toBeGreaterThan(20);
    const asyncBytes = await encodeGif({
      width: 4,
      height: 4,
      fps: 1,
      count: 1,
      frameAt: async () => Promise.resolve(frame(0)),
    });
    expect(asyncBytes).toEqual(bytes);
  });

  it("honours maxColors", async () => {
    const wide = await encodeGif({
      width: 4,
      height: 4,
      fps: 1,
      count: 1,
      frameAt: () => frame(0),
    });
    const narrow = await encodeGif({
      width: 4,
      height: 4,
      fps: 1,
      count: 1,
      maxColors: 2,
      frameAt: () => frame(0),
    });
    // Global colour table size lives in the logical screen descriptor (byte 10, low 3 bits).
    expect((narrow[10] ?? 0) & 7).toBeLessThan((wide[10] ?? 0) & 7);
  });

  it("rejects a frame whose byte length is not width x height x 4", async () => {
    await expect(
      encodeGif({
        width: 4,
        height: 4,
        fps: 1,
        count: 1,
        frameAt: () => new Uint8Array(10),
      }),
    ).rejects.toThrow(VisError);
  });
});
