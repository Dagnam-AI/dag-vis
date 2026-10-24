import { describe, expect, it } from "vitest";

import {
  checkRecord,
  ledgerLine,
  parseCheckReport,
  storedCheckProblems,
  type CheckReport,
  type LedgerInput,
} from "../../src/lib/ledger.ts";

const REPORT: CheckReport = {
  file: "/Users/someone/dag-vis/motion/out/a/a-20261023-v1.mp4",
  video: "a",
  probe: {
    width: 640,
    height: 360,
    fps: 30,
    frames: 60,
    videoDuration: 2,
    audioDuration: 2.01,
    audioSampleRate: 48000,
  },
  loudness: { integrated: -16.1, truePeak: -2.3, lra: 4 },
  problems: [],
};
const INPUT: LedgerInput = {
  video: "a",
  name: "a-20261023-v1.mp4",
  sha256: "ab".repeat(32),
  bytes: 12345,
  report: REPORT,
  props: { seed: 3 },
  git: "f6af669803dac125c06c08aac0d8b61f6254e962",
  remotion: "4.0.534",
  gl: "swangle",
  renderedAt: "2026-10-23T12:00:00.000Z",
};

describe("parseCheckReport", () => {
  it("parses the JSON check-render prints", () => {
    expect(parseCheckReport(JSON.stringify(REPORT), "")).toEqual(REPORT);
  });

  it("names stderr when there is no report", () => {
    expect(() => parseCheckReport("", "ffprobe exited 1: boom\n")).toThrow(
      /no report: ffprobe exited 1: boom$/,
    );
  });

  it("falls back to stdout, then to a plain note, when stderr is empty", () => {
    expect(() => parseCheckReport("garbage", "  ")).toThrow(/report: garbage$/);
    expect(() => parseCheckReport("", "")).toThrow(/report: no output$/);
  });

  it("keeps only the end of a long message", () => {
    const err = `${"x".repeat(900)}END`;
    const message = (() => {
      try {
        parseCheckReport("", err);
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(message.endsWith("END")).toBe(true);
    expect(message.length).toBeLessThan(560);
  });
});

describe("checkRecord", () => {
  it("replaces the machine path by the motion-relative one and records the renderer", () => {
    const record = checkRecord(REPORT, "out/a/a-20261023-v1.mp4", "swangle");
    expect(record).toEqual({
      ...REPORT,
      file: "out/a/a-20261023-v1.mp4",
      renderer: "swangle",
    });
    expect(JSON.stringify(record)).not.toContain("/Users/");
  });
});

describe("ledgerLine", () => {
  it("builds the ledger line, keys in order, renderer and an empty R2 slot included", () => {
    const line = ledgerLine(INPUT);
    expect(Object.keys(line)).toEqual([
      "video",
      "file",
      "sha256",
      "bytes",
      "frames",
      "width",
      "height",
      "fps",
      "integrated_lufs",
      "true_peak_dbtp",
      "props",
      "git",
      "remotion",
      "gl",
      "renderedAt",
      "stored",
    ]);
    expect(line).toEqual({
      video: "a",
      file: "out/a/a-20261023-v1.mp4",
      sha256: "ab".repeat(32),
      bytes: 12345,
      frames: 60,
      width: 640,
      height: 360,
      fps: 30,
      integrated_lufs: -16.1,
      true_peak_dbtp: -2.3,
      props: { seed: 3 },
      git: "f6af669803dac125c06c08aac0d8b61f6254e962",
      remotion: "4.0.534",
      gl: "swangle",
      renderedAt: "2026-10-23T12:00:00.000Z",
      stored: { local: "a/a-20261023-v1.mp4", r2: null },
    });
  });

  it("refuses a render whose checks failed", () => {
    expect(() =>
      ledgerLine({
        ...INPUT,
        report: { ...REPORT, problems: ["frames 59, expected 60", "no audio"] },
      }),
    ).toThrow(
      /failed render is not a render: frames 59, expected 60; no audio/,
    );
  });

  it("refuses a render with no measured loudness", () => {
    expect(() =>
      ledgerLine({ ...INPUT, report: { ...REPORT, loudness: null } }),
    ).toThrow(/without a measured sound bed/);
  });
});

describe("storedCheckProblems", () => {
  it("is empty for a record that passed", () => {
    expect(storedCheckProblems(JSON.stringify({ ...REPORT }))).toEqual([]);
  });

  it("lists the problems a failed record carries", () => {
    expect(
      storedCheckProblems(JSON.stringify({ problems: ["no audio track", 3] })),
    ).toEqual(["no audio track", "3"]);
  });

  it.each(["", "{nope", "null", "[]", "{}", '{"problems":"none"}'])(
    "does not vouch for %j",
    (text) => {
      expect(storedCheckProblems(text)).toHaveLength(1);
    },
  );
});
