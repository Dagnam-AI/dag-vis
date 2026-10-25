import { describe, expect, it } from "vitest";

import { nextVersionedName, utcDateStamp } from "../../src/lib/versions.ts";

describe("nextVersionedName", () => {
  it("starts at v1 and continues past the highest existing version, whatever the dates", () => {
    expect(nextVersionedName([], "pipeline-proof", "20261023", ".mp4")).toBe(
      "pipeline-proof-20261023-v1.mp4",
    );
    expect(
      nextVersionedName(
        [
          "pipeline-proof-20261001-v3.mp4",
          "pipeline-proof-20261023-v1.mp4",
          "pipeline-proof-20261023-v1.props.json",
          "other-20261023-v9.mp4",
        ],
        "pipeline-proof",
        "20261023",
        ".mp4",
      ),
    ).toBe("pipeline-proof-20261023-v4.mp4");
  });

  // Each decoy matches the pattern a base would make if its metacharacters were live.
  it.each([
    ["a.b", "aXb"],
    ["a+", "aaa"],
    ["a*", "aaa"],
    ["a?", "a"],
    ["(a)", "a"],
    ["[ab]", "a"],
    ["a|b", "a"],
    ["a{2}", "aa"],
    ["^a", "a"],
    ["a\\", "a"],
    ["a$", "a"],
  ])("treats the base %s literally, not as a pattern", (base, decoy) => {
    expect(
      nextVersionedName([`${decoy}-20260101-v7.png`], base, "20260102", ".png"),
    ).toBe(`${base}-20260102-v1.png`);
    expect(
      nextVersionedName([`${base}-20260101-v7.png`], base, "20260102", ".png"),
    ).toBe(`${base}-20260102-v8.png`);
  });

  it("shares one version counter across extensions", () => {
    expect(
      nextVersionedName(
        ["x-20260101-v2.png", "x-20260101-v5.props.json"],
        "x",
        "20260102",
        ".png",
      ),
    ).toBe("x-20260102-v6.png");
  });

  it("ignores malformed names even with a high version", () => {
    expect(
      nextVersionedName(
        [
          "x-2026-v9.png",
          "x-20260101-v9",
          "x-20260101-v9png",
          "xx-20260101-v9.png",
          "x-20260101-vv9.png",
          "x-20260101-v.png",
          "y-x-20260101-v9.png",
          "x-202601011-v9.png",
        ],
        "x",
        "20260102",
        ".png",
      ),
    ).toBe("x-20260102-v1.png");
  });

  it("refuses a version too large to continue and an extension without a dot", () => {
    expect(() =>
      nextVersionedName(
        ["x-20260101-v99999999999999999999999.png"],
        "x",
        "20260102",
        ".png",
      ),
    ).toThrow(/too large/);
    expect(
      nextVersionedName(
        [`x-20260101-v${String(Number.MAX_SAFE_INTEGER - 1)}.png`],
        "x",
        "20260102",
        ".png",
      ),
    ).toBe(`x-20260102-v${String(Number.MAX_SAFE_INTEGER)}.png`);
    expect(() => nextVersionedName([], "x", "20260102", "png")).toThrow(
      /start with a dot/,
    );
  });

  it("compares versions as numbers, not strings", () => {
    expect(
      nextVersionedName(
        ["x-20260101-v9.png", "x-20260101-v10.png"],
        "x",
        "20260102",
        ".png",
      ),
    ).toBe("x-20260102-v11.png");
  });

  it("stamps UTC dates", () => {
    expect(utcDateStamp(new Date("2026-10-23T23:59:59Z"))).toBe("20261023");
  });
});
