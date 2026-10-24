// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Sheet,
  sheetMetadata,
  type SheetProps,
} from "../../src/sheet/Sheet.tsx";

// The Studio's defaults: no frames yet.
const defaults: SheetProps = {
  title: "sheet",
  tiles: [],
  cols: 3,
  tileWidth: 480,
  tileHeight: 270,
};

afterEach(cleanup);

describe("sheetMetadata", () => {
  it("sizes an empty sheet as one cell instead of throwing", () => {
    // one column (cols is clamped to the one cell): 2*48 + 480 wide; 2*48 + 270 + 56 + 72 header tall
    expect(sheetMetadata(defaults)).toEqual({
      width: 576,
      height: 494,
      durationInFrames: 1,
      fps: 1,
    });
  });

  it("sizes a full sheet from its grid and header", () => {
    const tiles = Array.from({ length: 6 }, (_, i) => ({
      src: `a/${String(i)}.png`,
      caption: "c",
    }));
    expect(sheetMetadata({ ...defaults, tiles })).toEqual({
      width: 48 * 2 + 3 * 480 + 2 * 24,
      height: 48 * 2 + 2 * (270 + 56) + 24 + 72,
      durationInFrames: 1,
      fps: 1,
    });
  });

  it("still names a bad column count", () => {
    expect(() => sheetMetadata({ ...defaults, cols: 0 })).toThrow(/cols/);
  });
});

describe("Sheet", () => {
  it("renders an empty-state frame for the Studio's defaults", () => {
    const { container } = render(<Sheet {...defaults} />);
    expect(container.textContent).toContain("No frames yet.");
    expect(container.querySelector("img")).toBeNull();
  });
});
