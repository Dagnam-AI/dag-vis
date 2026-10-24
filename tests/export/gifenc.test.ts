import * as real from "gifenc";
import { describe, expect, it } from "vitest";

import { gifenc, pickGifenc } from "../../src/export/gifenc.js";

const api = {
  quantize: () => [],
  applyPalette: () => new Uint8Array(0),
  GIFEncoder: () => ({
    writeFrame: () => undefined,
    finish: () => undefined,
    bytes: () => new Uint8Array(0),
  }),
};

describe("pickGifenc", () => {
  it("takes named exports as they are (bundlers read the module field)", () => {
    expect(pickGifenc(api)).toBe(api);
  });

  it("unwraps the default export (plain Node loads the CommonJS main file)", () => {
    expect(pickGifenc({ default: api })).toBe(api);
  });

  it("resolves the installed package to a working encoder in this runtime", () => {
    expect(typeof gifenc.GIFEncoder).toBe("function");
    expect(typeof gifenc.quantize).toBe("function");
    expect(typeof gifenc.applyPalette).toBe("function");
    expect(pickGifenc(real)).toBe(gifenc);
  });
});
