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

  it("treats the base literally (a dot is not a wildcard)", () => {
    expect(
      nextVersionedName(["a.b-20260101-v2.mp4"], "a-b", "20260102", ".mp4"),
    ).toBe("a-b-20260102-v1.mp4");
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
