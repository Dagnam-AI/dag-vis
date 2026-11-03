import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { coverLook } from "../../src/scene/cover-look.js";
import { assertLook } from "../../src/scene/cover-validate.js";

const look = coverLook({
  item: "a",
  theme: "dark",
  variant: "banner",
  look: "halftone",
});

describe("assertLook", () => {
  it("accepts a built look and its scrim, and a look with neither", () => {
    expect(() => {
      assertLook(look, look.scrim);
    }).not.toThrow();
    expect(() => {
      assertLook({ ...look, texture: null }, null);
    }).not.toThrow();
  });

  it("names the field of a mask that is not an object or has a null at or radius", () => {
    const tx = look.texture;
    if (!tx) throw new Error("halftone has a texture");
    const withMask = (mask: unknown): never =>
      ({ ...look, texture: { ...tx, mask } }) as never;
    expect(() => {
      assertLook(withMask(null), null);
    }).toThrow(/^texture\.mask must be an object, got /);
    for (const field of ["at", "radius"])
      expect(() => {
        assertLook(withMask({ ...tx.mask, [field]: null }), null);
      }).toThrow(
        new RegExp(`^texture\\.mask\\.${field} must be an array of 2 numbers`),
      );
    expect(() => {
      assertLook(withMask({ ...tx.mask, floor: 3 }), null);
    }).toThrow(VisError);
  });
});
