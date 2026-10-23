import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";

describe("VisError", () => {
  it("is an Error named VisError carrying the message", () => {
    const e = new VisError("bad colour: nope");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("VisError");
    expect(e.message).toBe("bad colour: nope");
  });

  it("can be caught by instanceof after being thrown", () => {
    expect(() => {
      throw new VisError("x");
    }).toThrow(VisError);
  });
});
