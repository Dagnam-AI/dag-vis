import type { EffectHandle } from "../src/animate/index.js";

declare global {
  interface Window {
    __vis: {
      handles: Record<string, EffectHandle>;
      sample(name: string, t: number): number;
      snapshot(name: string, t: number): string;
    };
  }
}
export {};
