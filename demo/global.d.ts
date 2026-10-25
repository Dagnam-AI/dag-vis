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
    /** flow.html: test hooks. `error` is set (and the page has no cards) when the URL was invalid. */
    __flow: {
      error?: string;
      stats(): {
        /** Cards with a live handle right now, and the most there have been at once. */
        live: number;
        peak: number;
        /** The page's own cap on live cards. */
        cap: number;
        /** Live handles whose loop is running (zero under reduced motion). */
        running: number;
        /** Canvases created and released, those still open, and open ones whose context is not lost. */
        created: number;
        released: number;
        open: number;
        contexts: number;
        /** Released canvases whose context could not be lost (must stay 0). */
        leaked: number;
      };
      /** Render the card's frame at t and report, in the same task: share of lit pixels, and the luma range. */
      sample(name: string, t: number): { lit: number; spread: number };
    };
    /** parity.html: GPU RGB triples at `points`, then the drawing-buffer width and height. */
    __parity: (
      name: string,
      t: number,
      loop: number | undefined,
      points: [number, number][],
    ) => number[];
    __parityReady?: boolean;
    /** vis-background.html: the React wrapper's real-browser hooks. */
    __visBg: {
      /** Mount and unmount `n` fields back to back in #cycle, leaving the last mounted; `cycled` holds every canvas. */
      cycle(n: number): void;
      cycled: HTMLCanvasElement[];
      /** Distinct colours over an 8x8 grid of the canvas's drawing buffer (0 and `lost` when its context is lost). */
      sample(
        canvas: HTMLCanvasElement,
      ): Promise<{ lost: boolean; distinct: number }>;
    };
    __visBgReady?: boolean;
    /** vis-background.html: the field-preset picker's onChange calls, in order. */
    __picker: { changes: string[] };
    /** vis-background.spec.ts: the canvas the page held before a replace or unmount. */
    __held?: HTMLCanvasElement | null;
  }
}
export {};
