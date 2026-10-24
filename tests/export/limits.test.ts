import { describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  animationPlan,
  GIF_MAX_WIDTH,
  MAX_DURATION,
  MAX_FPS,
  SIZES,
  sizeOf,
} from "../../src/export/limits.js";

describe("limits", () => {
  it("ships the spec sizes and resolves shortcuts", () => {
    expect(SIZES.og).toEqual([1200, 630]);
    expect(SIZES.square).toEqual([1080, 1080]);
    expect(SIZES.story).toEqual([1080, 1920]);
    expect(SIZES.wallpaper).toEqual([2560, 1440]);
    expect(SIZES["4k"]).toEqual([3840, 2160]);
    expect(SIZES.header).toEqual([1500, 500]);
    expect(sizeOf("og")).toEqual([1200, 630]);
    expect(() => sizeOf("huge")).toThrow(VisError);
  });

  it("treats Object.prototype names as unknown sizes", () => {
    for (const name of ["constructor", "__proto__", "toString"])
      expect(() => sizeOf(name)).toThrow(VisError);
  });

  it("defaults to 30 fps / 6 s and computes the frame count", () => {
    expect(animationPlan({ format: "mp4", width: 100 })).toEqual({
      fps: 30,
      duration: 6,
      count: 180,
    });
    expect(
      animationPlan({ format: "mp4", width: 100, fps: 24, duration: 2.5 })
        .count,
    ).toBe(60);
  });

  it("guards fps, duration and frame count before any frame renders", () => {
    expect(MAX_FPS).toBe(60);
    expect(MAX_DURATION).toBe(60);
    const bad = (o: { fps?: number; duration?: number }) => () =>
      animationPlan({ format: "gif", width: 10, ...o });
    expect(bad({ fps: 61 })).toThrow(VisError);
    expect(bad({ fps: 2.5 })).toThrow(VisError);
    expect(bad({ fps: 0 })).toThrow(VisError);
    expect(bad({ duration: 61 })).toThrow(VisError);
    expect(bad({ duration: 0 })).toThrow(VisError);
    expect(bad({ duration: NaN })).toThrow(VisError);
    expect(bad({ fps: 1, duration: 0.1 })).toThrow(/no frames/);
  });

  it("warns once for wide GIFs through the injected warn", () => {
    const msgs: string[] = [];
    animationPlan({ format: "gif", width: GIF_MAX_WIDTH + 1 }, (m) =>
      msgs.push(m),
    );
    animationPlan({ format: "gif", width: GIF_MAX_WIDTH }, (m) => msgs.push(m));
    animationPlan({ format: "mp4", width: 4000 }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("801");
  });

  it("warns through console.warn by default", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    animationPlan({ format: "gif", width: GIF_MAX_WIDTH + 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
