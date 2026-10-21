import type { Size } from "../core/geometry.js";
import { el } from "../core/svg.js";
import type { Overlay } from "./types.js";

export function overlayLayer(
  overlay: Overlay,
  size: Size,
): { svg: string; cssImage: string; cssBlend: string } {
  const blend = overlay.blend ?? "normal";
  return {
    svg: el("image", {
      href: overlay.image,
      width: size.width,
      height: size.height,
      preserveAspectRatio: "xMidYMid slice",
      opacity: overlay.opacity ?? 1,
      style: `mix-blend-mode:${blend}`,
    }),
    cssImage: `url("${overlay.image.replace(/"/g, "%22")}")`,
    cssBlend: blend,
  };
}
