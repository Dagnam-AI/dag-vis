import type { Size } from "../core/geometry.js";
import { el } from "../core/svg.js";
import type { Overlay } from "./types.js";

/** A quoted url(): percent-encode what would end the string or the line. */
function cssUrl(image: string): string {
  const hex = (c: string): string =>
    `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
  return `url("${image.replace(/["\\\n\r]/g, hex)}")`;
}

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
    // The SVG draws the image like `background-size: cover`, centred; say the same in CSS.
    cssImage: `${cssUrl(overlay.image)} center / cover no-repeat`,
    cssBlend: blend,
  };
}
