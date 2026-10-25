import { createRng } from "@dagnam/vis";
import { describe, expect, it } from "vitest";

import { mulberry32 } from "../../../src/lib/audio/rng.ts";

describe("mulberry32", () => {
  it("is the library's createRng sequence (same constants) and is deterministic", () => {
    const lib = createRng(7);
    const own = mulberry32(7);
    const again = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = own();
      expect(v).toBe(lib.next());
      expect(again()).toBe(v);
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
