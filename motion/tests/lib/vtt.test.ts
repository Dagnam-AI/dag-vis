import { describe, expect, it } from "vitest";

import {
  cuesFromFrames,
  formatTimestamp,
  formatVtt,
  validateCues,
} from "../../src/lib/vtt.ts";

describe("formatTimestamp", () => {
  it.each([
    [0, "00:00:00.000"],
    [0.5, "00:00:00.500"],
    [4, "00:00:04.000"],
    [59.999, "00:00:59.999"],
    [60, "00:01:00.000"],
    [3599.999, "00:59:59.999"],
    [3600, "01:00:00.000"],
    [3661.25, "01:01:01.250"],
    [36000, "10:00:00.000"],
  ])("writes %s s as %s", (seconds, text) => {
    expect(formatTimestamp(seconds)).toBe(text);
  });

  it("rounds to the millisecond and carries into the next second, minute and hour", () => {
    expect(formatTimestamp(0.0004)).toBe("00:00:00.000");
    expect(formatTimestamp(0.0005)).toBe("00:00:00.001");
    expect(formatTimestamp(0.9996)).toBe("00:00:01.000");
    expect(formatTimestamp(59.9996)).toBe("00:01:00.000");
    expect(formatTimestamp(3599.9996)).toBe("01:00:00.000");
  });

  it("writes a frame time such as 1/30 s exactly to the millisecond", () => {
    expect(formatTimestamp(1 / 30)).toBe("00:00:00.033");
    expect(formatTimestamp(1799 / 30)).toBe("00:00:59.967");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s",
    (seconds) => {
      expect(() => formatTimestamp(seconds)).toThrow(
        /time must be a finite number of seconds >= 0/,
      );
    },
  );
});

describe("validateCues", () => {
  const cue = (start: number, end: number, text = "x") => ({
    start,
    end,
    text,
  });

  it("accepts ordered cues that touch but do not overlap, and an empty list", () => {
    expect(() => {
      validateCues([cue(0, 1), cue(1, 2), cue(3, 4)]);
    }).not.toThrow();
    expect(() => {
      validateCues([]);
    }).not.toThrow();
  });

  it("refuses a cue that ends no later than it starts", () => {
    expect(() => {
      validateCues([cue(2, 2)]);
    }).toThrow("cue 1: ends at 2 s, not after its start 2 s");
    expect(() => {
      validateCues([cue(0, 1), cue(3, 2)]);
    }).toThrow("cue 2: ends at 2 s, not after its start 3 s");
  });

  it("refuses a cue that starts before the previous one ends (overlap) or before it starts (order)", () => {
    expect(() => {
      validateCues([cue(0, 2), cue(1, 3)]);
    }).toThrow("cue 2: starts at 1 s, before cue 1 ends at 2 s");
    expect(() => {
      validateCues([cue(5, 6), cue(0, 1)]);
    }).toThrow("cue 2: starts at 0 s, before cue 1 ends at 6 s");
  });

  it("refuses an empty or blank text, a blank line and the arrow in a text", () => {
    expect(() => {
      validateCues([cue(0, 1, "  ")]);
    }).toThrow("cue 1: the text is empty");
    expect(() => {
      validateCues([cue(0, 1, "a\n\nb")]);
    }).toThrow("cue 1: the text has a blank line");
    expect(() => {
      validateCues([cue(0, 1, "a --> b")]);
    }).toThrow('cue 1: the text contains "-->"');
  });

  it("refuses a time that is not a number of seconds (naming the cue)", () => {
    expect(() => {
      validateCues([cue(Number.NaN, 1)]);
    }).toThrow(/cue 1: .*finite number of seconds/);
    expect(() => {
      validateCues([cue(0, 1), cue(1, Number.POSITIVE_INFINITY)]);
    }).toThrow(/cue 2: .*finite number of seconds/);
  });
});

describe("formatVtt", () => {
  it("writes the header, then each cue as a number-free block, with a final newline", () => {
    expect(
      formatVtt([
        { start: 0, end: 4, text: "One." },
        { start: 4, end: 61.5, text: " Two,\nover two lines. " },
      ]),
    ).toBe(
      [
        "WEBVTT",
        "",
        "00:00:00.000 --> 00:00:04.000",
        "One.",
        "",
        "00:00:04.000 --> 00:01:01.500",
        "Two,",
        "over two lines.",
        "",
      ].join("\n"),
    );
  });

  it("validates first", () => {
    expect(() =>
      formatVtt([
        { start: 0, end: 2, text: "a" },
        { start: 1, end: 3, text: "b" },
      ]),
    ).toThrow("cue 2: starts at 1 s");
  });

  it("is a header alone for no cues", () => {
    expect(formatVtt([])).toBe("WEBVTT\n");
  });
});

describe("cuesFromFrames", () => {
  it("turns frames into seconds at the frame rate, keeping the text", () => {
    expect(
      cuesFromFrames(
        [
          { start: 0, end: 120, text: "a" },
          { start: 120, end: 1800, text: "b" },
        ],
        30,
      ),
    ).toEqual([
      { start: 0, end: 4, text: "a" },
      { start: 4, end: 60, text: "b" },
    ]);
  });

  it("refuses a frame rate that is not a positive number", () => {
    expect(() => cuesFromFrames([], 0)).toThrow(
      "fps must be a positive number, got 0",
    );
    expect(() => cuesFromFrames([], Number.NaN)).toThrow(
      "fps must be a positive number, got NaN",
    );
  });
});
