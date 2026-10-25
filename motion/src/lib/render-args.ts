import {
  PLAIN_WORDING,
  parseArgv,
  parseJsonObject,
  type ArgSpec,
} from "./args.ts";
import { requireVideoName } from "./video-name.ts";

/** The only renderer a deliverable may be made with: software, so it does not depend on the GPU (the same machine renders the same bytes; equality across machines is not measured). */
export const DELIVERABLE_RENDERER = "swangle";
/** Named so a file made with it, and the command line, cannot be mistaken for a deliverable. */
export const ALLOW_DIRTY_FLAG = "--allow-dirty";
export const PREVIEW_FLAG = "--preview-not-a-deliverable";

export interface RenderArgs {
  video: string;
  /** Input props handed to the composition, `{}` when not given. */
  props: Record<string, unknown>;
  crf: number;
  preview: boolean;
  /** Render a deliverable although the checkout has uncommitted changes; the ledger records `dirty: true`. */
  allowDirty: boolean;
}

const SPEC: ArgSpec = {
  flags: [ALLOW_DIRTY_FLAG, PREVIEW_FLAG],
  values: { "--props": "a JSON object", "--crf": "a number" },
  max: 1,
  wording: PLAIN_WORDING,
};

/** `<video> [--props <json>] [--crf <1-51>] [--allow-dirty] [--preview-not-a-deliverable]`, the arguments after the script name. Throws a message naming what is wrong. */
export function parseRenderArgs(argv: readonly string[]): RenderArgs {
  const { flags, values, positionals } = parseArgv(argv, SPEC);
  const name = requireVideoName(positionals[0]);
  const props = parseJsonObject("--props", values.get("--props") ?? "{}");
  const crf = values.get("--crf") ?? "18";
  // x264 accepts 0-51; 0 is lossless (a different profile), so the range starts at 1.
  if (!/^\d+$/.test(crf) || Number(crf) < 1 || Number(crf) > 51)
    throw new Error(`--crf must be a whole number from 1 to 51, got ${crf}`);
  return {
    video: name,
    props,
    crf: Number(crf),
    preview: flags.has(PREVIEW_FLAG),
    allowDirty: flags.has(ALLOW_DIRTY_FLAG),
  };
}

/** Why `renderer` may not make this render, or null. A deliverable is swangle only; a preview may use anything. */
export function rendererProblem(
  renderer: string,
  preview: boolean,
): string | null {
  if (preview || renderer === DELIVERABLE_RENDERER) return null;
  return `renderer is ${renderer}, but a deliverable is rendered with ${DELIVERABLE_RENDERER} only (software, independent of the GPU). Unset MOTION_GL, or pass ${PREVIEW_FLAG} for a look that is not a deliverable.`;
}
