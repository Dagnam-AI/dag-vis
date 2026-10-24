import { requireVideoName } from "./video-name.ts";

export interface SheetArgs {
  video: string;
  /** Input props handed to the video's own composition, `{}` when not given. */
  props: Record<string, unknown>;
}

/** `<video> [--props <json>]`, the arguments after the script name. Throws a message naming what is wrong. */
export function parseSheetArgs(argv: readonly string[]): SheetArgs {
  let video: string | undefined;
  let propsJson = "{}";
  const rest = [...argv];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    if (arg === "--props") {
      const value = rest.shift();
      if (value === undefined) throw new Error("--props needs a JSON object");
      propsJson = value;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (video === undefined) {
      video = arg;
    } else {
      throw new Error(`unexpected extra argument ${arg}`);
    }
  }
  const name = requireVideoName(video);
  let props: unknown;
  try {
    props = JSON.parse(propsJson);
  } catch {
    throw new Error("--props is not valid JSON");
  }
  if (typeof props !== "object" || props === null || Array.isArray(props))
    throw new Error("--props must be a JSON object");
  return { video: name, props: props as Record<string, unknown> };
}
