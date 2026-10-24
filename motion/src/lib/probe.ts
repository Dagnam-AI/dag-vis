export interface Probe {
  width: number;
  height: number;
  fps: number;
  frames: number;
  videoDuration: number;
  audioDuration: number | null;
  audioSampleRate: number | null;
}
interface Stream {
  codec_type: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  nb_frames?: string;
  duration?: string;
  sample_rate?: string;
}

/** Parses `ffprobe -v error -show_streams -show_format -of json`. */
export function parseProbe(json: string): Probe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`probe: ffprobe output is not JSON: ${json.slice(0, 200)}`);
  }
  const listed = (parsed as { streams?: unknown } | null)?.streams;
  if (!Array.isArray(listed))
    throw new Error(
      `probe: ffprobe output has no streams list: ${json.slice(0, 200)}`,
    );
  const streams = listed as Stream[];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video) throw new Error("probe: no video stream");
  const need = (s: Stream, key: keyof Stream): string => {
    const v = s[key];
    if (v === undefined)
      throw new Error(`probe: ${s.codec_type} stream lacks ${key}`);
    return String(v);
  };
  // ffprobe prints "N/A" or "0/0" for what it cannot determine; NaN would
  // sail through every comparison in checkSync, so it is refused here.
  const num = (s: Stream, key: keyof Stream): number => {
    const raw = need(s, key);
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n) || n < 0)
      throw new Error(
        `probe: ${s.codec_type} ${key} is not a non-negative number: ${raw}`,
      );
    return n;
  };
  const rate = /^(\d+)\/(\d+)$/.exec(need(video, "r_frame_rate"));
  if (!rate || Number(rate[2]) === 0)
    throw new Error(
      `probe: video r_frame_rate is not a usable fraction: ${need(video, "r_frame_rate")}`,
    );
  return {
    width: num(video, "width"),
    height: num(video, "height"),
    fps: Number(rate[1]) / Number(rate[2]),
    frames: num(video, "nb_frames"),
    videoDuration: num(video, "duration"),
    audioDuration: audio ? num(audio, "duration") : null,
    audioSampleRate: audio ? num(audio, "sample_rate") : null,
  };
}

export interface Expected {
  width: number;
  height: number;
  fps: number;
  frames: number;
}
/** Frame count, resolution and audio length (one frame + 50 ms for the AAC priming). */
export function checkSync(p: Probe, e: Expected): string[] {
  const problems: string[] = [];
  if (p.width !== e.width || p.height !== e.height)
    problems.push(
      `size ${String(p.width)}×${String(p.height)}, expected ${String(e.width)}×${String(e.height)}`,
    );
  if (Math.abs(p.fps - e.fps) > 1e-6)
    problems.push(`fps ${String(p.fps)}, expected ${String(e.fps)}`);
  if (p.frames !== e.frames)
    problems.push(`frames ${String(p.frames)}, expected ${String(e.frames)}`);
  const tolerance = 1 / e.fps + 0.05;
  if (p.audioDuration === null) problems.push("no audio track");
  // 1e-9 s: ffprobe prints six decimals, so "equal to the tolerance" must not hinge on float noise.
  else if (Math.abs(p.audioDuration - p.videoDuration) > tolerance + 1e-9)
    problems.push(
      `audio ${String(p.audioDuration)}s vs video ${String(p.videoDuration)}s (tolerance ${tolerance.toFixed(3)}s)`,
    );
  return problems;
}
