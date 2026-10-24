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
  const { streams } = JSON.parse(json) as { streams: Stream[] };
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video) throw new Error("probe: no video stream");
  const need = (s: Stream, key: keyof Stream): string => {
    const v = s[key];
    if (v === undefined)
      throw new Error(`probe: ${s.codec_type} stream lacks ${key}`);
    return String(v);
  };
  const rate = /^(\d+)\/(\d+)$/.exec(need(video, "r_frame_rate"));
  if (!rate)
    throw new Error(
      `probe: r_frame_rate is not a fraction: ${need(video, "r_frame_rate")}`,
    );
  return {
    width: Number(need(video, "width")),
    height: Number(need(video, "height")),
    fps: Number(rate[1]) / Number(rate[2]),
    frames: Number(need(video, "nb_frames")),
    videoDuration: Number(need(video, "duration")),
    audioDuration: audio ? Number(need(audio, "duration")) : null,
    audioSampleRate: audio ? Number(need(audio, "sample_rate")) : null,
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
  else if (Math.abs(p.audioDuration - p.videoDuration) > tolerance)
    problems.push(
      `audio ${String(p.audioDuration)}s vs video ${String(p.videoDuration)}s (tolerance ${tolerance.toFixed(3)}s)`,
    );
  return problems;
}
