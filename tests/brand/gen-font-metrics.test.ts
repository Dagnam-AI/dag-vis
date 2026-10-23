import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROOT } from "../helpers/ttf.js";

describe("scripts/gen-font-metrics.mjs", () => {
  it("reproduces the committed tables from the shipped fonts (--check exits 0, silently)", () => {
    const out = execFileSync(
      process.execPath,
      [join(ROOT, "scripts", "gen-font-metrics.mjs"), "--check"],
      { encoding: "utf8" },
    );
    expect(out).toBe("");
  });
});
