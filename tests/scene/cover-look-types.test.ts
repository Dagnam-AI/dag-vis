import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  COVER_LOOKS,
  LOOK_EXPECTED,
  isCoverLook,
  isLookName,
  parseLookName,
} from "../../src/scene/cover-look-types.js";
import { coverLook } from "../../src/scene/cover-look.js";
import { coverSpec } from "../../src/scene/cover.js";

describe("look names", () => {
  it("are the five looks, in weight order", () => {
    expect(COVER_LOOKS).toEqual([
      "ember",
      "aurora",
      "contour",
      "silk",
      "halftone",
    ]);
    expect(LOOK_EXPECTED).toBe("one of ember, aurora, contour, silk, halftone");
  });

  it("isLookName accepts exactly those", () => {
    for (const name of COVER_LOOKS) expect(isLookName(name)).toBe(true);
    for (const v of ["Ember", "", "nope", 1, null, undefined, {}])
      expect(isLookName(v)).toBe(false);
  });

  it("parseLookName reads null and undefined as 'derive', and names cover.look otherwise", () => {
    expect(parseLookName(undefined)).toBeUndefined();
    expect(parseLookName(null)).toBeUndefined();
    expect(parseLookName("silk")).toBe("silk");
    for (const bad of ["nope", 1, "", {}]) {
      expect(() => parseLookName(bad)).toThrow(VisError);
      expect(() => parseLookName(bad)).toThrow(
        /^cover\.look: expected one of ember, aurora, contour, silk, halftone, got /,
      );
    }
  });
});

describe("isCoverLook", () => {
  it("tells a look from a gradient spec and from junk", () => {
    const input = { item: "a", theme: "dark", variant: "banner" } as const;
    expect(isCoverLook(coverLook(input))).toBe(true);
    expect(isCoverLook(coverSpec(input))).toBe(false);
    expect(isCoverLook({ look: "ember", spec: {} })).toBe(false);
    expect(isCoverLook({ look: "nope", spec: {}, palette: {} })).toBe(false);
    for (const v of [null, undefined, 1, "ember"])
      expect(isCoverLook(v)).toBe(false);
  });
});
