import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { assertSpec } from "../../src/gradient/spec.js";

describe("assertSpec", () => {
  it("accepts any object with a string kind, leaving the rest to the kind", () => {
    expect(() => {
      assertSpec({ kind: "linear" });
    }).not.toThrow();
    expect(() => {
      assertSpec({ kind: "plaid" });
    }).not.toThrow();
  });

  it.each([null, undefined, 5, "linear", true])(
    "rejects %j, which is not an object",
    (spec) => {
      expect(() => {
        assertSpec(spec);
      }).toThrow(VisError);
      expect(() => {
        assertSpec(spec);
      }).toThrow("gradient spec must be an object");
    },
  );

  it.each([{}, [], { kind: 5 }, { kind: null }, { kind: ["linear"] }])(
    "rejects %j, which has no string kind",
    (spec) => {
      expect(() => {
        assertSpec(spec);
      }).toThrow("unknown gradient kind");
    },
  );
});
