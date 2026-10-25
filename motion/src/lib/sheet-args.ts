import {
  PLAIN_WORDING,
  parseArgv,
  parseJsonObject,
  type ArgSpec,
} from "./args.ts";
import { requireVideoName } from "./video-name.ts";

export interface SheetArgs {
  video: string;
  /** Input props handed to the video's own composition, `{}` when not given. */
  props: Record<string, unknown>;
}

const SPEC: ArgSpec = {
  values: { "--props": "a JSON object" },
  max: 1,
  wording: PLAIN_WORDING,
};

/** `<video> [--props <json>]`, the arguments after the script name. Throws a message naming what is wrong. */
export function parseSheetArgs(argv: readonly string[]): SheetArgs {
  const { values, positionals } = parseArgv(argv, SPEC);
  const name = requireVideoName(positionals[0]);
  return {
    video: name,
    props: parseJsonObject("--props", values.get("--props") ?? "{}"),
  };
}
