import { describe, expect, it } from "vitest";
import { VisError } from "../../../src/core/index.js";
import { assertPositiveSize, uvError } from "../../../src/field/cpu/guards.js";

describe("assertPositiveSize", () => {
  it("accepts positive finite numbers, fractions included", () => {
    expect(() => {
      assertPositiveSize("width", 1);
    }).not.toThrow();
    expect(() => {
      assertPositiveSize("width", 0.5);
    }).not.toThrow();
  });

  it.each([0, -1, NaN, Infinity, -Infinity, "8", null, undefined])(
    "rejects %s, naming the parameter",
    (bad) => {
      expect(() => {
        assertPositiveSize("height", bad as number);
      }).toThrow(VisError);
      expect(() => {
        assertPositiveSize("height", bad as number);
      }).toThrow(/^height must be a positive finite number, got /);
    },
  );
});

describe("uvError", () => {
  it("always throws a VisError naming the coordinate, the value and the limit", () => {
    expect(() => uvError("u", NaN, 5)).toThrow(VisError);
    expect(() => uvError("v", 7, 5)).toThrow(
      /^v must be a finite number within ±5, got 7/,
    );
  });
});
