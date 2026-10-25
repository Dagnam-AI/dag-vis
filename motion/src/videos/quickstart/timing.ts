// One file for picture AND sound: the beats, the cues inside them, the sound
// events, the captions and every number the layout uses. It is imported by
// plain node (scripts/sheet.ts, audio.ts, captions.ts), so it imports nothing
// from the library: colours are named in Quickstart's palette (from THEME).
import { defineTiming, framesFor } from "../../lib/timing.ts";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 60; // seconds: 1800 frames

export const BEAT_IDS = [
  "title",
  "project",
  "data",
  "model",
  "code",
  "train",
  "end",
] as const;
export type BeatId = (typeof BEAT_IDS)[number];

/** Seconds from 0 at which each beat starts; a beat ends where the next starts. */
const STARTS: Record<BeatId, number> = {
  title: 0,
  project: 4,
  data: 12,
  model: 22,
  code: 38,
  train: 48,
  end: 57,
};

export interface Beat {
  readonly id: BeatId;
  /** Frames, [start, end). */
  readonly start: number;
  readonly end: number;
}
export const BEATS: readonly Beat[] = BEAT_IDS.map((id, i) => {
  const next = BEAT_IDS[i + 1];
  return {
    id,
    start: framesFor(STARTS[id], FPS),
    end: framesFor(next === undefined ? DURATION : STARTS[next], FPS),
  };
});
export const TOTAL_FRAMES = framesFor(DURATION, FPS);
export function beatOf(id: BeatId): Beat {
  const beat = BEATS.find((b) => b.id === id);
  if (beat === undefined) throw new Error(`no beat ${id}`);
  return beat;
}

export const TIMING = defineTiming({
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  duration: DURATION,
  beats: STARTS,
  // Every `at` is a whole frame at 30 fps: the sheet renders exactly that frame.
  storyboard: [
    { at: 2, caption: "Title card settled: wordmark and title; the bed alone" },
    {
      at: 11,
      caption:
        "Project dialog filled in, Create Project pressed, version chip in; step tick just played",
    },
    {
      at: 20,
      caption:
        "Dataset node and its three splits on the canvas, slow push-in under way",
    },
    {
      at: 28,
      caption:
        "Three nodes connected, the connector to Dense Layer just drawn (red); a soft tick per link",
    },
    {
      at: 37,
      caption:
        "Output settings shown, pushed in on the detail; Output Type and Number of Classes up",
    },
    {
      at: 44.5,
      caption: "Code window with all its abstract lines and the red caret",
    },
    {
      at: 54,
      caption:
        "Loss curve fallen, accuracy arc risen; the finishing tick played",
    },
    {
      at: 1799 / FPS,
      caption: "Last frame: wordmark, next step and address, nothing moving",
    },
  ],
});

/** Every word that may appear on screen; Quickstart draws no other text. */
export const TEXT = {
  wordmark: { base: "DAGNAM", tld: ".AI" },
  title: "Quickstart: your first model",
  sections: {
    project: "Create a project",
    data: "Add data",
    model: "Build a small model",
    code: "Generate code",
    train: "Train",
  },
  project: {
    title: "Title",
    framework: "Framework",
    frameworkValue: "PyTorch",
    visibility: "Visibility",
    visibilityValue: "Public",
    button: "Create Project",
    chip: "v1.0.0 Initial architecture",
  },
  data: {
    dataset: "MNIST Handwritten Digits Dataset",
    splits: ["Train", "Validation", "Test"],
  },
  model: {
    nodes: ["Dataset", "Flatten", "Dense Layer", "Output"],
    outputType: "Output Type: Classification",
    classes: "Number of Classes: 10",
  },
  train: { loss: "Loss", accuracy: "Accuracy" },
  end: { next: "Next: fine tune and deploy", address: "dagnam.ai" },
} as const;

/** Frames inside each beat (0 = the beat's first frame) at which things start and end. */
export const CUES = {
  fade: 8,
  label: [4, 16],
  title: { wordmark: [0, 18], subtitle: [12, 36] },
  project: {
    dialog: [10, 34],
    typing: [48, 100],
    framework: [112, 124],
    visibility: [136, 148],
    ready: [160, 172],
    press: [184, 196],
    chip: [194, 218],
  },
  data: {
    canvas: [6, 24],
    land: [30, 54],
    splits: [
      [96, 110],
      [114, 128],
      [132, 146],
    ],
    links: [
      [86, 106],
      [104, 124],
      [122, 142],
    ],
    done: 150,
    pushIn: [160, 290],
  },
  model: {
    canvas: [6, 24],
    nodes: [
      [14, 32],
      [60, 78],
      [150, 168],
      [240, 258],
    ],
    links: [
      [78, 96],
      [168, 186],
      [258, 276],
    ],
    /** A new link is red for this long after it is drawn, then eases back to grey over `cool`. */
    hot: 24,
    cool: 20,
    stem: [296, 312],
    panel: [306, 330],
    outputType: [336, 352],
    classes: [366, 382],
    pushIn: [330, 470],
  },
  code: {
    window: [14, 44],
    firstLine: 56,
    stagger: 9,
    grow: 14,
    caret: 182,
    pushIn: [190, 290],
  },
  train: {
    panels: [10, 34],
    draw: [44, 204],
    done: 206,
    pushIn: [120, 260],
  },
  end: { wordmark: [0, 14], next: [8, 24], address: [16, 32] },
} as const;

/** The field behind everything slows to a stop over the end card (frames). */
export const FIELD_SETTLE = [1620, 1799] as const;
export const FIELD_OPACITY = 0.34;

export interface CameraMove {
  readonly scale: number;
  /** The world point the camera ends up centred on, px. */
  readonly x: number;
  readonly y: number;
}
const REST: CameraMove = { scale: 1, x: WIDTH / 2, y: HEIGHT / 2 };
export interface Keyframe extends CameraMove {
  /** Frames inside the beat. */
  readonly at: number;
}
const key = (at: number, move: CameraMove): Keyframe => ({ at, ...move });
const wide = (at: number): Keyframe => key(at, REST);
/** The whole model canvas in view, a little low so the chain keeps company with the settings that arrive under it. */
const WHOLE_CANVAS: CameraMove = { scale: 1, x: WIDTH / 2, y: 470 };
/** Camera moves per beat, eased between keyframes; before the first and after the last it holds still. */
export const CAMERA: Partial<Record<BeatId, readonly Keyframe[]>> = {
  data: [
    wide(CUES.data.pushIn[0]),
    key(CUES.data.pushIn[1], { scale: 1.1, x: 930, y: 550 }),
  ],
  // Close on the first three cards so the chain fills the frame, back to the whole
  // chain as Output arrives, then a slow push-in on the output settings.
  model: [
    key(0, { scale: 1.2, x: 760, y: 375 }),
    key(222, { scale: 1.2, x: 760, y: 375 }),
    key(262, WHOLE_CANVAS),
    key(CUES.model.pushIn[0], WHOLE_CANVAS),
    key(CUES.model.pushIn[1], { scale: 1.15, x: 1100, y: 540 }),
  ],
  code: [
    wide(CUES.code.pushIn[0]),
    key(CUES.code.pushIn[1], { scale: 1.08, x: 900, y: 500 }),
  ],
  train: [
    wide(CUES.train.pushIn[0]),
    key(CUES.train.pushIn[1], { scale: 1.06, x: 880, y: 540 }),
  ],
};

export type EventKind = "connect" | "step";
export interface SoundEvent {
  readonly kind: EventKind;
  /** Absolute frame. */
  readonly frame: number;
  readonly beat: BeatId;
}
const at = (beat: BeatId, local: number, kind: EventKind): SoundEvent => ({
  kind,
  beat,
  frame: beatOf(beat).start + local,
});
/** A soft tick when a link is made and when a step completes: sound and picture share these frames. */
export const EVENTS: readonly SoundEvent[] = [
  at("project", CUES.project.press[0] + 6, "step"),
  at("data", CUES.data.done, "step"),
  ...CUES.model.links.map(([, end]) => at("model", end, "connect")),
  at("model", CUES.model.panel[1], "step"),
  at("code", CUES.code.caret + 2, "step"),
  at("train", CUES.train.done, "step"),
];

export interface Caption {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
/** English captions, one cue per beat, in frames. Plain words about what is on screen. */
const CAPTION_TEXT: Record<BeatId, string> = {
  title: "Title card: Quickstart, your first model.",
  project:
    "Create a project: choose a title, PyTorch and Public, then select Create Project.",
  data: "Add data: the MNIST Handwritten Digits Dataset joins the canvas, with Train, Validation and Test splits.",
  model:
    "Build a small model: connect Dataset, Flatten, Dense Layer and Output, then set Classification with 10 classes.",
  code: "Generate code: a code window opens.",
  train: "Train: the loss curve falls while accuracy rises.",
  end: "Next: fine tune and deploy, at dagnam.ai.",
};
export const CAPTIONS: readonly Caption[] = BEATS.map((b) => ({
  start: b.start,
  end: b.end,
  text: CAPTION_TEXT[b.id],
}));

/** Every size, position and duration the pictures use, px at 1920x1080. */
export const LAYOUT = {
  margin: 96,
  labelAt: { x: 96, y: 60 },
  text: {
    label: 36,
    body: 36,
    /** The dialog and the model cards: body text at about 1.3x, for a phone. */
    card: 47,
    headline: 72,
    wordmark: 200,
    address: 48,
  },
  hairline: 2,
  title: { wordmarkY: 300, subtitleY: 610 },
  project: {
    dialog: { x: 336, y: 140, w: 1248, h: 704, pad: 72 },
    input: { h: 104 },
    title: { labelY: 212, inputY: 276 },
    row2: { labelY: 424, inputY: 488, w: 528, rightX: 984 },
    typedBar: { w: 390, h: 18, inset: 31 },
    button: { y: 648, h: 124 },
    chip: { y: 884, h: 112, pad: 48, w: 900 },
    pressScale: 0.97,
  },
  canvas: { x: 96, y: 190, w: 1728, h: 720 },
  data: {
    node: { x: 160, y: 450, w: 560, h: 200 },
    split: {
      x: 1100,
      w: 600,
      h: 112,
      ys: [350, 494, 638],
      share: [0.7, 0.15, 0.15],
    },
    trunkX: 910,
    track: { x: 340, w: 228, h: 16 },
    drop: 60,
  },
  model: {
    /** The model's own canvas: just tall enough for the chain and the output settings. */
    canvas: { x: 64, y: 220, w: 1792, h: 640 },
    /** Its height before the settings arrive: snug around the chain, so no empty canvas shows. */
    tightH: 300,
    row: { y: 290, h: 170, x0: 110, widths: [320, 290, 440, 290], gap: 120 },
    panel: { x: 890, y: 560, w: 920, h: 256, pad: 56 },
  },
  code: {
    window: { x: 360, y: 190, w: 1200, h: 700, bar: 72 },
    lines: {
      x: 408,
      y: 300,
      step: 40,
      count: 13,
      h: 16,
      maxW: 1100,
      indent: 56,
    },
    caret: { w: 18, h: 30 },
  },
  train: {
    loss: { x: 144, y: 200, w: 1000, h: 700 },
    plot: { x: 200, y: 320, w: 900, h: 540, points: 90 },
    accuracy: { x: 1220, y: 200, w: 556, h: 700 },
    arc: { cx: 1498, cy: 590, r: 170, stroke: 28, sweep: 270, reach: 0.82 },
  },
  end: { wordmarkY: 250, nextY: 560, addressY: 720 },
} as const;
