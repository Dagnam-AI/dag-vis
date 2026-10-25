import { describe, expect, it } from "vitest";

import * as react from "../../src/react/index.js";

describe("react barrel", () => {
  it("exports the three components", () => {
    expect(Object.keys(react).sort()).toEqual([
      "FieldPresetPicker",
      "Gradient",
      "VisBackground",
    ]);
  });
});
