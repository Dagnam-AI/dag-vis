import { describe, expect, it } from "vitest";

import * as react from "../../src/react/index.js";

describe("react barrel", () => {
  it("exports the two components", () => {
    expect(Object.keys(react).sort()).toEqual(["Gradient", "VisBackground"]);
  });
});
