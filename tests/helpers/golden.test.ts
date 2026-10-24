import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expectGolden } from "./golden.js";

// The helper's own goldens live in a temporary folder, never under tests/goldens.
let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dag-vis-golden-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("expectGolden", () => {
  it("fails on a missing golden instead of creating it", () => {
    vi.stubEnv("UPDATE_GOLDENS", "");
    expect(() => {
      expectGolden("missing.svg", "<svg/>", root);
    }).toThrow(/does not exist: create it with UPDATE_GOLDENS=1/);
    expect(existsSync(join(root, "missing.svg"))).toBe(false);
  });

  it("writes the golden only when UPDATE_GOLDENS is 1, then compares", () => {
    vi.stubEnv("UPDATE_GOLDENS", "1");
    expectGolden("sub/made.svg", "<svg>a</svg>", root);
    expect(readFileSync(join(root, "sub", "made.svg"), "utf8")).toBe(
      "<svg>a</svg>",
    );
    vi.stubEnv("UPDATE_GOLDENS", "");
    expectGolden("sub/made.svg", "<svg>a</svg>", root);
    expect(() => {
      expectGolden("sub/made.svg", "<svg>b</svg>", root);
    }).toThrow();
    expect(readFileSync(join(root, "sub", "made.svg"), "utf8")).toBe(
      "<svg>a</svg>",
    );
  });

  it("does not regenerate for any other value of UPDATE_GOLDENS", () => {
    vi.stubEnv("UPDATE_GOLDENS", "1");
    expectGolden("kept.svg", "one", root);
    vi.stubEnv("UPDATE_GOLDENS", "true");
    expect(() => {
      expectGolden("kept.svg", "two", root);
    }).toThrow();
  });

  it("reads the repository's goldens by default and never creates a file there", () => {
    vi.stubEnv("UPDATE_GOLDENS", "");
    expect(() => {
      expectGolden("_no-such-golden-ever.svg", "x");
    }).toThrow(/does not exist/);
  });
});
