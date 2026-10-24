import { describe, expect, it } from "vitest";

import {
  VIDEO_NAME_RULE,
  isVideoSlug,
  requireVideoName,
} from "../../src/lib/video-name.ts";

describe("isVideoSlug", () => {
  it("accepts lower-case words and digits joined by single hyphens", () => {
    for (const ok of ["pipeline-proof", "a1", "a", "2026-launch"])
      expect(isVideoSlug(ok), ok).toBe(true);
  });
  it("rejects every other spelling, including ones that pass a looser \\w rule", () => {
    for (const bad of [
      "",
      "A",
      "My_Video",
      "a_b",
      "a--b",
      "-a",
      "a-",
      "../a",
      "a/b",
      "a b",
      "a\n",
    ])
      expect(isVideoSlug(bad), bad).toBe(false);
  });
});

describe("requireVideoName", () => {
  it("returns a usable name unchanged", () => {
    expect(requireVideoName("pipeline-proof")).toBe("pipeline-proof");
  });
  it("states the rule when there is no name", () => {
    expect(() => requireVideoName(undefined)).toThrow(
      `a video name (${VIDEO_NAME_RULE}) is required`,
    );
  });
  it("states the rule and echoes a bad name", () => {
    expect(() => requireVideoName("My_Video")).toThrow(
      `a video name (${VIDEO_NAME_RULE}) is required, got "My_Video"`,
    );
  });
});
