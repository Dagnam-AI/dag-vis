import { el } from "../core/svg.js";
import { assertBlend, assertList } from "./stops.js";
import type { Ctx, KindOutput, LayersSpec } from "./types.js";

/** A bare colour (mesh and aurora end their images with one); CSS images are functions. */
const BARE_COLOR = /^(?:#|rgba?\()/;

/**
 * Stacked specs, bottom first. SVG: one rect per layer, `mix-blend-mode` on every layer
 * above the first. CSS: a multi-background plus a `background-blend-mode` list. CSS
 * allows a bare colour only as the final background layer, so a mesh or aurora base that
 * ends up mid-stack is written as `linear-gradient(c, c)` (same pixels).
 *
 * The two agree exactly when every layer is a single CSS image (linear, radial, conic,
 * banded) or no blend is set. With a blend, a layer made of several CSS images (mesh,
 * aurora, nested layers) is blended image by image in CSS, but as one flattened group in
 * SVG, so those blended results differ.
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
  // ponytail: layers share ctx.rng, so reordering them shifts later aurora blobs;
  // upgrade path: sub-seed each layer from its index.
  const images = [...subs].reverse().flatMap((s) => s.cssImages);
  const last = images.length - 1;
  const out: KindOutput = {
    defs:
      subs.map((s) => s.defs).join("") +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        ...rects,
      ),
    fill: `url(#${id})`,
    cssImages: images.map((image, i) =>
      i < last && BARE_COLOR.test(image)
        ? `linear-gradient(${image}, ${image})`
        : image,
    ),
  };
  if (modes.flat().some((m) => m !== "normal"))
    out.cssBlend = [...modes].reverse().flat().join(", ");
  return out;
}
