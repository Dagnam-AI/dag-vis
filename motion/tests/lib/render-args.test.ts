import { describe, expect, it } from "vitest";

import {
  DELIVERABLE_RENDERER,
  PREVIEW_FLAG,
  parseRenderArgs,
  rendererProblem,
} from "../../src/lib/render-args.ts";

describe("parseRenderArgs", () => {
  it("takes the video name, with props {}, crf 18 and no preview by default", () => {
    expect(parseRenderArgs(["pipeline-proof"])).toEqual({
      video: "pipeline-proof",
      props: {},
      crf: 18,
      preview: false,
      allowDirty: false,
    });
  });

  it("parses every option in any order", () => {
    const json = '{"seed":3,"nested":{"x":[1]}}';
    const want = {
      video: "a",
      props: { seed: 3, nested: { x: [1] } },
      crf: 23,
      preview: true,
      allowDirty: true,
    };
    expect(
      parseRenderArgs([
        "a",
        "--props",
        json,
        "--crf",
        "23",
        PREVIEW_FLAG,
        "--allow-dirty",
      ]),
    ).toEqual(want);
    expect(
      parseRenderArgs([
        "--allow-dirty",
        PREVIEW_FLAG,
        "--crf",
        "23",
        "--props",
        json,
        "a",
      ]),
    ).toEqual(want);
  });

  it("accepts the ends of the crf range", () => {
    expect(parseRenderArgs(["a", "--crf", "1"]).crf).toBe(1);
    expect(parseRenderArgs(["a", "--crf", "51"]).crf).toBe(51);
  });

  it.each([
    [[], /video name/],
    [["../x"], /video name/],
    [["Bad_Name"], /video name/],
    [["My_Video"], /video name/],
    [["-x"], /unknown option -x/],
    [["a", "b"], /extra argument b/],
    [["a", "--props"], /needs a JSON object/],
    [["a", "--props", "{nope"], /not valid JSON/],
    [["a", "--props", "[1]"], /must be a JSON object/],
    [["a", "--props", "null"], /must be a JSON object/],
    [["a", "--props", "3"], /must be a JSON object/],
    [["--props", "{}"], /video name/],
    [["a", "--crf"], /needs a number/],
    [["a", "--crf", "0"], /from 1 to 51, got 0/],
    [["a", "--crf", "52"], /from 1 to 51, got 52/],
    [["a", "--crf", "1.5"], /from 1 to 51, got 1.5/],
    [["a", "--crf", "x"], /from 1 to 51, got x/],
    [["a", "--preview"], /unknown option --preview/],
    [["a", "--upload"], /unknown option --upload/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseRenderArgs(argv)).toThrow(message);
  });
});

describe("rendererProblem", () => {
  it("allows a deliverable only with the pinned software renderer", () => {
    expect(DELIVERABLE_RENDERER).toBe("swangle");
    expect(rendererProblem("swangle", false)).toBeNull();
  });

  it("refuses any other renderer for a deliverable, naming both the fix and the preview flag", () => {
    const problem = rendererProblem("angle", false);
    expect(problem).toMatch(/renderer is angle/);
    expect(problem).toMatch(/swangle only/);
    expect(problem).toMatch(/Unset MOTION_GL/);
    expect(problem).toContain("--preview-not-a-deliverable");
  });

  it("lets a preview use any renderer", () => {
    expect(rendererProblem("angle", true)).toBeNull();
    expect(rendererProblem("swangle", true)).toBeNull();
  });
});
