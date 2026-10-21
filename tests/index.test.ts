import { describe, expect, it } from "vitest";

import * as vis from "../src/index.js";

describe("@dagnam/vis root barrel", () => {
  it("exposes VisError", () => {
    expect(typeof vis.VisError).toBe("function");
  });
});
