import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { checkMarkup } from "../../src/node/markup-guard.js";
import { bareLeaks, bluePngUri, canaryWorld } from "./guard-child.js";
import { guardCases } from "./guard-cases.js";

// A small deterministic differential test: whatever the guard ACCEPTS must not
// make bare resvg (no guard, a child process whose cwd holds canary files)
// read a file. Rejected cases are never rendered bare: one of them aborts the
// process. A `#` or `:` in a file name cannot exist on Windows.
describe.skipIf(process.platform === "win32")(
  "href guard vs bare resvg (seeded differential)",
  () => {
    it("accepts no document that makes resvg read a canary file", () => {
      const { cwd, abs } = canaryWorld();
      const accepted: string[] = [];
      let rejected = 0;
      for (const seed of [20261021, 20261022]) {
        for (const svg of guardCases(seed, 750, { abs, raster: bluePngUri })) {
          try {
            checkMarkup(svg);
            accepted.push(svg);
          } catch (error) {
            expect(error).toBeInstanceOf(VisError);
            rejected++;
          }
        }
      }
      // Both outcomes are common, or the test would prove nothing.
      expect(accepted.length).toBeGreaterThan(100);
      expect(rejected).toBeGreaterThan(100);
      const leaks = bareLeaks(accepted, cwd);
      expect(leaks).toHaveLength(accepted.length);
      expect(accepted.filter((_, i) => leaks[i])).toEqual([]);
    });
  },
);
