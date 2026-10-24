import * as namespace from "gifenc";

/**
 * The part of gifenc this package uses. Declared here, not taken from the
 * ambient `gifenc` module, so no emitted declaration names a module that ships
 * without types.
 */
export interface Gifenc {
  quantize: (
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: "rgb565" | "rgb444" | "rgba4444" },
  ) => number[][];
  applyPalette: (
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ) => Uint8Array;
  GIFEncoder: () => {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number; repeat?: number },
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
}

/**
 * gifenc has no `exports` map: bundlers read its ES `module` file and see named
 * exports, but plain Node loads the CommonJS `main` file, where only `default`
 * carries them. Accept either shape.
 */
export function pickGifenc(ns: Gifenc | { default: Gifenc }): Gifenc {
  return "GIFEncoder" in ns ? ns : ns.default;
}

export const gifenc = pickGifenc(namespace);
