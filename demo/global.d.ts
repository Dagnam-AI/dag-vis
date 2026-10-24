import type { EffectHandle } from "../src/animate/index.js";

declare global {
  interface Window {
    __vis: {
      /** Set (with no handles) when the URL was invalid; sample/snapshot then throw it. */
      error?: string;
      handles: Record<string, EffectHandle>;
      sample(name: string, t: number): number;
      snapshot(name: string, t: number): string;
    };
    /** parity.html: GPU RGB triples at `points`, then the drawing-buffer width and height. */
    __parity: (
      name: string,
      t: number,
      loop: number | undefined,
      points: [number, number][],
    ) => number[];
    __parityReady?: boolean;
  }
}
export {};
