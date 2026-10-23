import { describe, expect, it } from "vitest";

import { QUOTE_LIMIT, describeValue } from "../../src/core/describe.js";
import * as validate from "../../src/core/validate.js";

describe("describeValue", () => {
  it("quotes and truncates strings, spells out other types, never throws", () => {
    expect(describeValue("a")).toBe('"a"');
    expect(describeValue("x".repeat(QUOTE_LIMIT + 1))).toBe(
      `"${"x".repeat(QUOTE_LIMIT)}..."`,
    );
    expect(describeValue(5n)).toBe("5");
    expect(describeValue(null)).toBe("null");
    expect(describeValue({})).toBe("object");
  });

  it("is the helper core/validate re-exports", () => {
    expect(validate.describeValue).toBe(describeValue);
    expect(QUOTE_LIMIT).toBe(80);
  });
});
