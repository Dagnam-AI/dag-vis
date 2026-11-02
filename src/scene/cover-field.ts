import type { FlowFieldSpec, FlowShape } from "../field/index.js";
import { fnv1a32 } from "./cover.js";
import { coverLook } from "./cover-look.js";
import type { CoverLookInput, CoverLookName } from "./cover-look-types.js";

/** The flow shape each look moves in. */
const SHAPES: Record<CoverLookName, FlowShape> = {
  ember: "bloom",
  aurora: "aurora",
  contour: "band",
  silk: "wave",
  halftone: "noise",
};

/**
 * The animated twin of a cover: a flow field in the look's colours, its highlight at the
 * cover's anchor, seeded by the item. Hover swaps the still for this, in the same colour
 * world; it is for the one card under the pointer, never a banner.
 */
export function coverField(input: CoverLookInput): FlowFieldSpec {
  const look = coverLook(input);
  const { palette: p, params } = look;
  const dark = look.theme === "dark";
  return {
    kind: "flow",
    palette: dark
      ? [p.base, p.deep, p.ink, p.accent, p.highlight]
      : [p.base, p.deep, p.ink, p.accent],
    shape: SHAPES[look.look],
    light: {
      vignette: dark ? 0.45 : 0,
      highlight: {
        at: [params.anchor[0] / 100, params.anchor[1] / 100],
        strength: 0.4,
        radius: 0.5,
        color: p.highlight,
      },
    },
    grain: dark ? 0.25 : 0.12,
    seed: fnv1a32(params.itemKey),
  };
}
