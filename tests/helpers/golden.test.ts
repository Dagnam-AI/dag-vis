import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { expectGolden } from "./golden.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "goldens");
const SCRATCH = "_golden-helper";

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(join(ROOT, SCRATCH), { recursive: true, force: true });
});

describe("expectGolden", () => {
  it("fails on a missing golden instead of creating it", () => {
    vi.stubEnv("UPDATE_GOLDENS", "");
    expect(() => {
      expectGolden(`${SCRATCH}/missing.svg`, "<svg/>");
    }).toThrow(/does not exist: create it with UPDATE_GOLDENS=1/);
    expect(existsSync(join(ROOT, SCRATCH, "missing.svg"))).toBe(false);
  });

  it("writes the golden only when UPDATE_GOLDENS is 1, then compares", () => {
    vi.stubEnv("UPDATE_GOLDENS", "1");
    expectGolden(`${SCRATCH}/made.svg`, "<svg>a</svg>");
    expect(readFileSync(join(ROOT, SCRATCH, "made.svg"), "utf8")).toBe(
      "<svg>a</svg>",
    );
    vi.stubEnv("UPDATE_GOLDENS", "");
    expectGolden(`${SCRATCH}/made.svg`, "<svg>a</svg>");
    expect(() => {
      expectGolden(`${SCRATCH}/made.svg`, "<svg>b</svg>");
    }).toThrow();
    expect(readFileSync(join(ROOT, SCRATCH, "made.svg"), "utf8")).toBe(
      "<svg>a</svg>",
    );
  });

  it("does not regenerate for any other value of UPDATE_GOLDENS", () => {
    vi.stubEnv("UPDATE_GOLDENS", "1");
    expectGolden(`${SCRATCH}/kept.svg`, "one");
    vi.stubEnv("UPDATE_GOLDENS", "true");
    expect(() => {
      expectGolden(`${SCRATCH}/kept.svg`, "two");
    }).toThrow();
  });
});
