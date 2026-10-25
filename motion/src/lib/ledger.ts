import type { Loudness } from "./loudness.ts";
import type { Probe } from "./probe.ts";
import { DELIVERABLE_RENDERER } from "./render-args.ts";
import { newStored, type Stored } from "./store.ts";

/** The checkout a render was made from. */
export interface Source {
  /** HEAD. */
  git: string;
  /** Uncommitted changes (other than the ledger) were present: the commit does not describe the video. */
  dirty: boolean;
}

/** What `scripts/check-render.ts --json` prints. */
export interface CheckReport {
  file: string;
  video: string;
  probe: Probe;
  loudness: Loudness | null;
  problems: string[];
}

/** The report from check-render's stdout; a crash with no report names its stderr instead of failing inside JSON.parse. */
export function parseCheckReport(stdout: string, stderr: string): CheckReport {
  try {
    return JSON.parse(stdout) as CheckReport;
  } catch {
    throw new Error(
      `check-render printed no report: ${(stderr.trim() || stdout.trim() || "no output").slice(-500)}`,
    );
  }
}

/**
 * Why a `.check.json` does not vouch for its render: its problems, that it cannot
 * be read, or that the renderer it names is not the deliverable one. Empty means
 * it passed.
 */
export function storedCheckProblems(text: string): string[] {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch {
    return ["the check output is not valid JSON"];
  }
  const { problems, renderer } = (record ?? {}) as {
    problems?: unknown;
    renderer?: unknown;
  };
  if (!Array.isArray(problems))
    return ["the check output has no list of problems"];
  return [
    ...problems.map(String),
    ...(renderer === DELIVERABLE_RENDERER
      ? []
      : [
          `rendered with ${String(renderer)}, not ${DELIVERABLE_RENDERER}: not a deliverable`,
        ]),
  ];
}

/**
 * The `.check.json` kept beside a render: the report with the file named
 * relative to motion/ (no machine path leaves the machine), the renderer that
 * made the picture and the commit it was made from, with whether the tree had
 * uncommitted changes.
 */
export function checkRecord(
  report: CheckReport,
  file: string,
  renderer: string,
  source: Source,
): CheckReport & { renderer: string } & Source {
  return { ...report, file, renderer, ...source };
}

export interface LedgerInput {
  video: string;
  /** The versioned MP4 name, `<video>-<yyyymmdd>-v<N>.mp4`. */
  name: string;
  sha256: string;
  bytes: number;
  report: CheckReport;
  props: Record<string, unknown>;
  git: string;
  dirty: boolean;
  remotion: string;
  gl: string;
  renderedAt: string;
}

/** One `RENDERS.jsonl` line, in the order it is written. Only a render that passed its checks and was measured gets one. */
export function ledgerLine(i: LedgerInput): {
  file: string;
  stored: Stored;
  sha256: string;
} & Record<string, unknown> {
  if (i.report.problems.length > 0)
    throw new Error(
      `a failed render is not a render: ${i.report.problems.join("; ")}`,
    );
  if (i.report.loudness === null)
    throw new Error("a render without a measured sound bed is not a render");
  return {
    video: i.video,
    file: `out/${i.video}/${i.name}`,
    sha256: i.sha256,
    bytes: i.bytes,
    frames: i.report.probe.frames,
    width: i.report.probe.width,
    height: i.report.probe.height,
    fps: i.report.probe.fps,
    integrated_lufs: i.report.loudness.integrated,
    true_peak_dbtp: i.report.loudness.truePeak,
    props: i.props,
    git: i.git,
    dirty: i.dirty,
    remotion: i.remotion,
    gl: i.gl,
    renderedAt: i.renderedAt,
    stored: newStored(i.video, i.name),
  };
}
