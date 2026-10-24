import { describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/index.js";

// A rasteriser that answers with the wrong number of bytes: the frame source must
// refuse it rather than hand ffmpeg or the GIF encoder a frame of the wrong size.
vi.mock("../../src/node/render-png.js", () => ({
  renderPng: vi.fn(),
  renderRgba: vi.fn(() =>
    Promise.resolve({ data: new Uint8Array(7), width: 1, height: 1 }),
  ),
}));
import { frameSource } from "../../src/node/frames.js";

describe("frameSource: frame size contract", () => {
  it.each([
    ["ribbon", { kind: "ribbon", lines: 4, samples: 8 }],
    ["gradient", { kind: "linear", angle: 0, stops: ["#000", "#fff"] }],
  ])(
    "rejects a %s frame that is not width x height x 4 bytes",
    async (_, spec) => {
      const src = frameSource(spec, 16, 8);
      await expect(src.rgba(0)).rejects.toThrow(VisError);
      await expect(src.rgba(0)).rejects.toThrow(
        /frame has 7 bytes, expected 512 \(16x8 RGBA\)/,
      );
    },
  );
});
