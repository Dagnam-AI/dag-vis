import { describe, expect, it, vi } from "vitest";

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

  describe("boundary validation", () => {
    const base = {
      width: 4,
      height: 4,
      fps: 10,
      count: 1,
      frameAt: () => frame(0),
    };
    const rejects = async (patch: object, pattern: RegExp) => {
      const frameAt = vi.fn(() => frame(0));
      const promise = encodeGif({ ...base, frameAt, ...patch });
      await expect(promise).rejects.toThrow(VisError);
      await expect(promise).rejects.toThrow(pattern);
      expect(frameAt).not.toHaveBeenCalled();
    };

    it.each([0, -1, 1.5, 65536, NaN, Infinity])("rejects width %s", (width) =>
      rejects({ width }, /width/),
    );
    it.each([0, -1, 1.5, 65536, NaN, Infinity])("rejects height %s", (height) =>
      rejects({ height }, /height/),
    );
    it.each([0, -1, 2.5, NaN, Infinity])("rejects count %s", (count) =>
      rejects({ count }, /count/),
    );
    it.each([0, -1, NaN, Infinity])("rejects fps %s", (fps) =>
      rejects({ fps }, /fps/),
    );
    it.each([0, 1, 2.5, 257, NaN])("rejects maxColors %s", (maxColors) =>
      rejects({ maxColors }, /maxColors/),
    );

    it("accepts the extremes of each range", async () => {
      for (const maxColors of [2, 256]) {
        const bytes = await encodeGif({ ...base, maxColors });
        expect(bytes.at(-1)).toBe(0x3b);
      }
      const wide = await encodeGif({
        ...base,
        width: 65535,
        height: 1,
        frameAt: () => new Uint8Array(65535 * 4),
      });
      expect(new DataView(wide.buffer).getUint16(6, true)).toBe(65535);
    });
  });

  describe("frame timing", () => {
    // Delay of every frame in centiseconds, read from the Graphic Control Extensions.
    const delays = (gif: Uint8Array): number[] => {
      const out: number[] = [];
      for (let i = 0; i + 7 < gif.length; i++)
        if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4)
          out.push((gif[i + 4] ?? 0) | ((gif[i + 5] ?? 0) << 8));
      return out;
    };
    const timing = async (fps: number, count: number) => {
      const gif = await encodeGif({
        width: 4,
        height: 4,
        fps,
        count,
        frameAt: (i) => frame(i),
      });
      return delays(gif);
    };
    const sum = (a: number[]) => a.reduce((n, d) => n + d, 0);

    it.each([
      [30, 180],
      [24, 48],
      [7, 20],
      [50, 100],
      [25, 13],
    ])(
      "at %s fps, %s frames last exactly the rounded count / fps",
      async (fps, count) => {
        const d = await timing(fps, count);
        expect(d).toHaveLength(count);
        expect(sum(d)).toBe(Math.round((count * 100) / fps));
        expect(Math.min(...d)).toBeGreaterThanOrEqual(2);
      },
    );

    it("spreads 30 fps as 3 and 4 centiseconds instead of 3 each", async () => {
      expect(await timing(30, 6)).toEqual([3, 4, 3, 3, 4, 3]);
    });

    it("holds every frame for at least 2 centiseconds above 50 fps", async () => {
      // Browsers play a 0 or 1 centisecond delay as 10, so 50 fps is the ceiling.
      const d = await timing(60, 60);
      expect(d.every((cs) => cs === 2)).toBe(true);
    });
  });
});
