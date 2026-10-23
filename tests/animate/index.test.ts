// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import * as animate from "../../src/animate/index.js";
import { installFakeGl } from "./fake-gl.js";

describe("animate barrel", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(animate).sort()).toEqual([
      "COMMON_DEFAULTS",
      "DITHER_DEFAULTS",
      "GLITCH_DEFAULTS",
      "PIXEL_BLAST_DEFAULTS",
      "RIBBON_DEFAULTS",
      "TERMINAL_DEFAULTS",
      "createDither",
      "createGlitch",
      "createPixelBlast",
      "createRibbon",
      "createTerminal",
      "loopTime",
    ]);
  });
});

describe("importing the animate entry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates no GL or 2d context", async () => {
    const fake = installFakeGl();
    try {
      vi.resetModules();
      const fresh = await import("../../src/animate/index.js");
      expect(typeof fresh.createDither).toBe("function");
      expect(fake.gls).toHaveLength(0);
      expect(fake.ctx2ds).toHaveLength(0);
    } finally {
      fake.restore();
    }
  });

  it("does not throw with no DOM or canvas at all", async () => {
    for (const name of ["window", "document", "HTMLCanvasElement"])
      vi.stubGlobal(name, undefined);
    vi.resetModules();
    const fresh = await import("../../src/animate/index.js");
    expect(typeof fresh.createRibbon).toBe("function");
    expect(fresh.COMMON_DEFAULTS.fps).toBe(60);
  });
});
