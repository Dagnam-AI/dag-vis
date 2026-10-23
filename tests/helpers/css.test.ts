import { describe, expect, it } from "vitest";

import { cssLayers } from "./css.js";

describe("cssLayers", () => {
  it("splits at top-level commas only and drops the blend list", () => {
    expect(
      cssLayers(
        'background: radial-gradient(circle 5px at 50% 50%, #fff 0%, rgba(0, 0, 0, 0) 100%), url("x,y") center / cover no-repeat, #102030; background-blend-mode: normal, normal, normal;',
      ),
    ).toEqual([
      "radial-gradient(circle 5px at 50% 50%, #fff 0%, rgba(0, 0, 0, 0) 100%)",
      'url("x,y") center / cover no-repeat',
      "#102030",
    ]);
  });

  it("rejects a bare colour that is not the final layer, as a browser does", () => {
    expect(() =>
      cssLayers(
        "background: linear-gradient(0deg, #000 0%, #fff 100%), #102030, linear-gradient(0deg, #000 0%, #fff 100%);",
      ),
    ).toThrow("bare colour outside the final layer");
    expect(() => cssLayers("background: rgba(1, 2, 3, 0.5), #102030;")).toThrow(
      "bare colour",
    );
  });

  it("rejects anything that is not a background declaration", () => {
    expect(() => cssLayers("color: red;")).toThrow("not a background");
  });
});
