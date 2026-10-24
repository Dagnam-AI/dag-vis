/** The only renderer a deliverable may be made with: software, so it is the same on every machine. */
export const DELIVERABLE_RENDERER = "swangle";
/** Named so a file made with it, and the command line, cannot be mistaken for a deliverable. */
export const PREVIEW_FLAG = "--preview-not-a-deliverable";

export interface RenderArgs {
  video: string;
  /** Input props handed to the composition, `{}` when not given. */
  props: Record<string, unknown>;
  crf: number;
  preview: boolean;
}

/** `<video> [--props <json>] [--crf <1-51>] [--preview-not-a-deliverable]`, the arguments after the script name. Throws a message naming what is wrong. */
export function parseRenderArgs(argv: readonly string[]): RenderArgs {
  let video: string | undefined;
  let propsJson = "{}";
  let crf = "18";
  let preview = false;
  const rest = [...argv];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (arg === "--props") {
      const value = rest.shift();
      if (value === undefined) throw new Error("--props needs a JSON object");
      propsJson = value;
    } else if (arg === "--crf") {
      const value = rest.shift();
      if (value === undefined) throw new Error("--crf needs a number");
      crf = value;
    } else if (arg === PREVIEW_FLAG) {
      preview = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (video === undefined) {
      video = arg;
    } else {
      throw new Error(`unexpected extra argument ${arg}`);
    }
  }
  if (video === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(video))
    throw new Error("a video name (lower-case words joined by -) is required");
  let props: unknown;
  try {
    props = JSON.parse(propsJson);
  } catch {
    throw new Error("--props is not valid JSON");
  }
  if (typeof props !== "object" || props === null || Array.isArray(props))
    throw new Error("--props must be a JSON object");
  // x264 accepts 0-51; 0 is lossless (a different profile), so the range starts at 1.
  if (!/^\d+$/.test(crf) || Number(crf) < 1 || Number(crf) > 51)
    throw new Error(`--crf must be a whole number from 1 to 51, got ${crf}`);
  return {
    video,
    props: props as Record<string, unknown>,
    crf: Number(crf),
    preview,
  };
}

/** Why `renderer` may not make this render, or null. A deliverable is swangle only; a preview may use anything. */
export function rendererProblem(
  renderer: string,
  preview: boolean,
): string | null {
  if (preview || renderer === DELIVERABLE_RENDERER) return null;
  return `renderer is ${renderer}, but a deliverable is rendered with ${DELIVERABLE_RENDERER} only (the same output on every machine). Unset MOTION_GL, or pass ${PREVIEW_FLAG} for a look that is not a deliverable.`;
}
