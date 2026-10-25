import { describe, expect, it } from "vitest";

import { parseSheetArgs } from "../../src/lib/sheet-args.ts";

describe("parseSheetArgs", () => {
  it("takes the video name and defaults the props to an empty object", () => {
    expect(parseSheetArgs(["pipeline-proof"])).toEqual({
      video: "pipeline-proof",
      props: {},
    });
  });

  it("parses --props before or after the video", () => {
    const want = { video: "a", props: { seed: 3, nested: { x: [1] } } };
    const json = '{"seed":3,"nested":{"x":[1]}}';
    expect(parseSheetArgs(["a", "--props", json])).toEqual(want);
    expect(parseSheetArgs(["--props", json, "a"])).toEqual(want);
  });

  it.each([
    [[], /video name/],
    [["../x"], /video name/],
    [["My_Video"], /video name/],
    [["-x"], /unknown option -x/],
    [["a", "b"], /extra argument b/],
    [["a", "--props"], /needs a JSON object/],
    [["a", "--props", "{nope"], /not valid JSON/],
    [["a", "--props", "[1]"], /must be a JSON object/],
    [["a", "--props", "null"], /must be a JSON object/],
    [["a", "--props", "3"], /must be a JSON object/],
    [["--props", "{}"], /video name/],
    [["a", "--other"], /unknown option --other/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseSheetArgs(argv)).toThrow(message);
  });
});
