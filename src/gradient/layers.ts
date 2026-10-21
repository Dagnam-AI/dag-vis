import { el } from "../core/svg.js";
import { assertBlend, assertList } from "./stops.js";
import type { Ctx, KindOutput, LayersSpec } from "./types.js";

/**
 * Stacked specs, bottom first. SVG: one rect per layer, `mix-blend-mode` on every layer
 * above the first. CSS: a multi-background plus a `background-blend-mode` list. The two
 * agree exactly when each blended layer is a single CSS image (linear, radial, conic):
 * CSS has no isolated group, so a multi-image layer (mesh, aurora, nested layers) is
 * blended image by image rather than as the flattened whole SVG blends.
 */
export function renderLayers(spec: LayersSpec, ctx: Ctx): KindOutput {
  assertList("layers needs at least one layer", spec.layers);
  assertBlend(spec.blend);
  const blend = spec.blend ?? "normal";
  const { width, height } = ctx.size;
  const id = `${ctx.id}-g`;
  const subs = spec.layers.map((layer, i) =>
    ctx.render(layer, `${ctx.id}-l${i}`),
  );
  const rects = subs.map((s, i) =>
    el("rect", {
      width,
      height,
      fill: s.fill,
      style:
        i > 0 && blend !== "normal" ? `mix-blend-mode:${blend}` : undefined,
    }),
  );
  // Each layer's own images are top first; the layers themselves are bottom first.
  const modes = subs.map((s, i) => {
    const own = s.cssBlend?.split(", ") ?? s.cssImages.map(() => "normal");
    // The bottom layer is never blended; an image a layer left normal takes the blend.
    return i === 0 ? own : own.map((m) => (m === "normal" ? blend : m));
  });
  const out: KindOutput = {
    defs:
      subs.map((s) => s.defs).join("") +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        ...rects,
      ),
    fill: `url(#${id})`,
    cssImages: [...subs].reverse().flatMap((s) => s.cssImages),
  };
  if (modes.flat().some((m) => m !== "normal"))
    out.cssBlend = [...modes].reverse().flat().join(", ");
  return out;
}
