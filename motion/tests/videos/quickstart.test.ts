import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fieldPresetNames } from "@dagnam/vis";
import { describe, expect, it } from "vitest";

import { settle } from "../../src/lib/ease.ts";
import { framesFor } from "../../src/lib/timing.ts";
import { cuesFromFrames, formatVtt, validateCues } from "../../src/lib/vtt.ts";
import { codeLines, lossCurve } from "../../src/videos/quickstart/curve.ts";
import { DEFAULT_PROPS } from "../../src/videos/quickstart/props.ts";
import {
  BEATS,
  BEAT_IDS,
  CAMERA,
  CAPTIONS,
  CUES,
  EVENTS,
  FIELD_SETTLE,
  LAYOUT,
  TEXT,
  TIMING,
  TOTAL_FRAMES,
  beatOf,
  type BeatId,
} from "../../src/videos/quickstart/timing.ts";

const FPS = TIMING.fps;
const LAYOUT_WIDTH = TIMING.width;
const length = (id: BeatId): number => beatOf(id).end - beatOf(id).start;

/** Every string the owner approved for the screen: nothing else may be written. */
const APPROVED = [
  "DAGNAM",
  ".AI",
  "Quickstart: your first model",
  "Create a project",
  "Add data",
  "Build a small model",
  "Generate code",
  "Train",
  "Title",
  "Framework",
  "PyTorch",
  "Visibility",
  "Public",
  "Create Project",
  "v1.0.0 Initial architecture",
  "MNIST Handwritten Digits Dataset",
  "Validation",
  "Test",
  "Dataset",
  "Flatten",
  "Dense Layer",
  "Output",
  "Output Type: Classification",
  "Number of Classes: 10",
  "Loss",
  "Accuracy",
  "Next: fine tune and deploy",
  "dagnam.ai",
];

const leaves = (v: unknown): string[] =>
  typeof v === "string"
    ? [v]
    : Object.values(v as object).flatMap((x: unknown) => leaves(x));
const numbers = (v: unknown): number[] =>
  typeof v === "number"
    ? [v]
    : typeof v === "object" && v !== null
      ? Object.values(v).flatMap((x: unknown) => numbers(x))
      : [];

describe("quickstart timing", () => {
  it("is a 60 s, 30 fps, 1920x1080 film of 1800 frames", () => {
    expect(TIMING).toMatchObject({ fps: 30, width: 1920, height: 1080 });
    expect(TOTAL_FRAMES).toBe(1800);
  });

  it("has the seven beats, contiguous, from frame 0 to the last frame", () => {
    expect(BEATS.map((b) => b.id)).toEqual([...BEAT_IDS]);
    expect(BEATS[0]?.start).toBe(0);
    BEATS.forEach((b, i) => {
      expect(b.end, b.id).toBeGreaterThan(b.start);
      expect(b.start, b.id).toBe(BEATS[i - 1]?.end ?? 0);
    });
    expect(BEATS.at(-1)?.end).toBe(1800);
    expect(BEATS.map((b) => [b.start / FPS, b.end / FPS])).toEqual([
      [0, 4],
      [4, 12],
      [12, 22],
      [22, 38],
      [38, 48],
      [48, 57],
      [57, 60],
    ]);
  });

  it("agrees with the base timing's beat starts", () => {
    for (const b of BEATS)
      expect(framesFor(TIMING.beats[b.id], FPS), b.id).toBe(b.start);
  });

  it("shows 6 to 8 storyboard frames, whole frames, in order, the last being the last frame", () => {
    const frames = TIMING.storyboard.map((s) => framesFor(s.at, FPS));
    expect(frames.length).toBeGreaterThanOrEqual(6);
    expect(frames.length).toBeLessThanOrEqual(8);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(new Set(frames).size).toBe(frames.length);
    expect(frames.at(-1)).toBe(1799);
  });
});

describe("quickstart words", () => {
  it("are exactly the approved list, the wordmark reading DAGNAM.AI", () => {
    const words = new Set(leaves(TEXT));
    expect([...words].sort()).toEqual([...new Set(APPROVED)].sort());
    expect(TEXT.wordmark.base + TEXT.wordmark.tld).toBe("DAGNAM.AI");
  });

  it("are the only text the components draw: no text node in any of their JSX", () => {
    const text = />\s*[A-Za-z0-9][^<>{}=]*<\//;
    expect(text.test("<Txt>Hello</Txt>")).toBe(true);
    for (const file of [
      "Quickstart.tsx",
      "beats-setup.tsx",
      "beats-build.tsx",
      "parts.tsx",
    ])
      expect(
        readFileSync(
          fileURLToPath(
            new URL(`../../src/videos/quickstart/${file}`, import.meta.url),
          ),
          "utf8",
        ),
        file,
      ).not.toMatch(text);
  });

  it("are sized for a phone: headlines 72 px or more, everything else 36 px or more", () => {
    const { label, body, card, headline, wordmark, address } = LAYOUT.text;
    expect(headline).toBeGreaterThanOrEqual(72);
    expect(wordmark).toBeGreaterThanOrEqual(72);
    for (const size of [label, body, card, address])
      expect(size).toBeGreaterThanOrEqual(36);
  });

  it("scale the dialog and the model cards up by about 1.3x over body text", () => {
    expect(LAYOUT.text.card / LAYOUT.text.body).toBeGreaterThan(1.25);
    expect(LAYOUT.text.card / LAYOUT.text.body).toBeLessThan(1.35);
  });

  it("keep the project dialog and its chip inside the frame, centred, with room below", () => {
    const { dialog: d, chip } = LAYOUT.project;
    expect(d.x + d.w / 2).toBe(TIMING.width / 2);
    expect(d.y).toBeGreaterThanOrEqual(LAYOUT.labelAt.y + LAYOUT.text.label);
    expect(d.y + d.h).toBeLessThan(chip.y);
    expect(chip.y + chip.h).toBeLessThanOrEqual(TIMING.height - 60);
    expect(chip.w).toBeLessThan(d.w);
  });

  it("keep the model chain and its settings inside their canvas, the chain across the width", () => {
    const { canvas, row, panel } = LAYOUT.model;
    const chainRight =
      row.x0 + row.widths.reduce((a, b) => a + b, 0) + 3 * row.gap;
    expect(row.x0).toBeGreaterThan(canvas.x);
    expect(chainRight).toBeLessThan(canvas.x + canvas.w);
    expect(chainRight - row.x0).toBeGreaterThan(0.85 * TIMING.width);
    expect(panel.x + panel.w).toBeLessThanOrEqual(chainRight);
    expect(row.y).toBeGreaterThan(canvas.y);
    // Before the settings arrive the canvas is snug: the chain sits inside it with room, and it is short.
    expect(row.y + row.h).toBeLessThan(canvas.y + LAYOUT.model.tightH);
    expect(LAYOUT.model.tightH).toBeLessThan(row.h + 200);
    expect(panel.y + panel.h).toBeLessThan(canvas.y + canvas.h);
    // Trimmed: under 60 px of empty canvas below the settings.
    expect(canvas.y + canvas.h - (panel.y + panel.h)).toBeLessThan(60);
    expect(canvas.y).toBeGreaterThanOrEqual(
      LAYOUT.labelAt.y + 2 * LAYOUT.text.label,
    );
  });

  it("keep the product name and the address up for at least 2 s on the end card, and the title for 2 s", () => {
    const end = length("end");
    expect((end - CUES.end.wordmark[0]) / FPS).toBeGreaterThanOrEqual(2);
    expect((end - CUES.end.address[0]) / FPS).toBeGreaterThanOrEqual(2);
    expect((length("title") - CUES.title.subtitle[1]) / FPS).toBeGreaterThan(2);
  });

  it("lets the last frame stand still: every end-card cue is over well before it", () => {
    expect(Math.max(...numbers(CUES.end))).toBeLessThanOrEqual(
      length("end") - FPS,
    );
    expect(
      settle(1799, ...FIELD_SETTLE) - settle(1798, ...FIELD_SETTLE),
    ).toBeLessThan(0.02);
  });
});

describe("quickstart cues, events and camera", () => {
  it.each(BEAT_IDS)("keeps every %s cue inside its beat", (id) => {
    for (const n of numbers(CUES[id])) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(length(id));
    }
    expect(CUES.label[1]).toBeLessThan(length(id));
  });

  it("lets every link finish drawing and its red cool off inside the beat", () => {
    for (const [, end] of CUES.model.links)
      expect(end + CUES.model.hot + CUES.model.cool).toBeLessThan(
        length("model") - CUES.fade,
      );
  });

  it("keeps every camera keyframe in order inside its beat, ending before the fade out", () => {
    for (const [id, keys] of Object.entries(CAMERA)) {
      const ats = keys.map((k) => k.at);
      expect(ats, id).toEqual([...ats].sort((x, y) => x - y));
      expect(ats[0], id).toBeGreaterThanOrEqual(0);
      expect(ats.at(-1), id).toBeLessThanOrEqual(
        length(id as BeatId) - CUES.fade,
      );
      for (const k of keys) expect(k.scale, id).toBeGreaterThanOrEqual(1);
    }
  });

  it("frames the model chain close, then wide as Output arrives, then pushes in on its settings", () => {
    const keys = CAMERA.model ?? [];
    const [first] = keys;
    const [outputStart] = CUES.model.nodes[3];
    // Output arrives late, and the camera is back to the whole canvas by the time it is in.
    expect(outputStart).toBeGreaterThanOrEqual(200);
    const wide = keys.find((k) => k.scale === 1);
    expect(wide?.at).toBeGreaterThanOrEqual(outputStart);
    expect(wide?.at).toBeLessThanOrEqual(CUES.model.nodes[3][1] + 8);
    expect(keys.at(-1)?.at).toBe(CUES.model.pushIn[1]);
    expect(keys.at(-1)?.scale).toBeGreaterThan(1);
    // Close stage: the first three cards fill the width, with a margin each side.
    const { row } = LAYOUT.model;
    const left = row.x0;
    const right =
      row.x0 + row.widths.slice(0, 3).reduce((a, b) => a + b, 0) + 2 * row.gap;
    const screen = (x: number): number =>
      LAYOUT_WIDTH / 2 + (x - (first?.x ?? 0)) * (first?.scale ?? 1);
    expect(screen(left)).toBeGreaterThan(60);
    expect(screen(left)).toBeLessThan(200);
    expect(screen(right)).toBeLessThan(LAYOUT_WIDTH - 60);
    expect(screen(right)).toBeGreaterThan(LAYOUT_WIDTH - 200);
  });

  it("puts every sound event on a frame inside its own beat, in order", () => {
    const frames = EVENTS.map((e) => e.frame);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    for (const e of EVENTS) {
      const beat = beatOf(e.beat);
      expect(e.frame, e.beat).toBeGreaterThanOrEqual(beat.start);
      expect(e.frame, e.beat).toBeLessThan(beat.end);
    }
  });

  it("has a connect tick at the end of each of the three links and a step tick per finished step", () => {
    const model = beatOf("model").start;
    expect(
      EVENTS.filter((e) => e.kind === "connect").map((e) => e.frame),
    ).toEqual(CUES.model.links.map(([, end]) => model + end));
    expect(EVENTS.filter((e) => e.kind === "step").map((e) => e.beat)).toEqual([
      "project",
      "data",
      "model",
      "code",
      "train",
    ]);
  });
});

describe("quickstart captions", () => {
  it("cover the whole film, one per beat, without a gap or an overlap", () => {
    expect(CAPTIONS).toHaveLength(BEATS.length);
    expect(CAPTIONS[0]?.start).toBe(0);
    expect(CAPTIONS.at(-1)?.end).toBe(TOTAL_FRAMES);
    CAPTIONS.forEach((c, i) => {
      expect(c.start).toBe(BEATS[i]?.start);
      expect(c.end).toBe(BEATS[i]?.end);
      expect(c.text.length).toBeLessThanOrEqual(120);
    });
    const cues = cuesFromFrames(CAPTIONS, FPS);
    expect(() => {
      validateCues(cues);
    }).not.toThrow();
    cues.slice(1).forEach((c, i) => {
      expect(c.start).toBe(cues[i]?.end);
    });
  });

  it("make a WebVTT file that starts at 0 and ends at 60 s", () => {
    const vtt = formatVtt(cuesFromFrames(CAPTIONS, FPS));
    expect(vtt.split("\n")[0]).toBe("WEBVTT");
    expect(vtt).toContain("00:00:00.000 --> 00:00:04.000");
    expect(vtt).toContain("00:00:57.000 --> 00:01:00.000");
  });
});

describe("quickstart drawing helpers", () => {
  it("draws a loss curve from the seed that falls, stays on the plot and wobbles", () => {
    const curve = lossCurve(7, 90);
    expect(curve).toHaveLength(90);
    expect(curve.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(curve[0]).toBeGreaterThan(0.85);
    expect(curve.at(-1)).toBeLessThan(0.2);
    const mean = (xs: number[]): number =>
      xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(curve.slice(0, 22))).toBeGreaterThan(mean(curve.slice(68)));
    expect(curve.some((v, i) => i > 0 && v > (curve[i - 1] ?? 0))).toBe(true);
    expect(lossCurve(7, 90)).toEqual(curve);
    expect(lossCurve(8, 90)).not.toEqual(curve);
  });

  it("draws abstract code lines from the seed, blank where asked, and never the last", () => {
    const lines = codeLines(7, LAYOUT.code.lines.count, [4, 9]);
    expect(lines).toHaveLength(LAYOUT.code.lines.count);
    expect(lines.flatMap((l, i) => (l.blank ? [i] : []))).toEqual([4, 9]);
    for (const l of lines) {
      expect(l.indent).toBeGreaterThanOrEqual(0);
      expect(l.indent).toBeLessThanOrEqual(2);
      expect(l.token + l.rest).toBeLessThan(1);
    }
    expect(codeLines(7, 13, [4, 9])).toEqual(lines);
    expect(codeLines(8, 13, [4, 9])).not.toEqual(lines);
  });

  it("names a real field preset by default", () => {
    expect(fieldPresetNames).toContain(DEFAULT_PROPS.preset);
    expect(Number.isSafeInteger(DEFAULT_PROPS.seed)).toBe(true);
  });
});
