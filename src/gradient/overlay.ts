import { VisError } from "../core/errors.js";
import type { Size } from "../core/geometry.js";
import { el } from "../core/svg.js";
import { bounded, describeValue, orDefault } from "../core/validate.js";
import { assertBlend } from "./stops.js";
import type { Blend, Overlay } from "./types.js";

/** A quoted url(): percent-encode what would end the string or the line. */
function cssUrl(image: string): string {
  const hex = (c: string): string =>
    `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
  return `url("${image.replace(/["\\\n\r]/g, hex)}")`;
}

/** A validated overlay: `image` is a string, `opacity` 0..1, `blend` a known mode. */
export function parseOverlay(overlay: unknown): Required<Overlay> {
  if (typeof overlay !== "object" || overlay === null || Array.isArray(overlay))
    throw new VisError(
      `overlay must be an object { image, opacity?, blend? }, got ${describeValue(overlay)}`,
    );
  const { image, opacity, blend } = overlay as Record<string, unknown>;
  if (typeof image !== "string")
    throw new VisError(
      `overlay.image must be a string (a URL or data URI), got ${describeValue(image)}`,
    );
  assertBlend(blend as string | undefined);
  return {
    image,
    opacity: bounded("overlay.opacity", orDefault<unknown>(opacity, 1), 0, 1),
    blend: orDefault<unknown>(blend, "normal") as Blend,
  };
}

export function overlayLayer(
  overlay: Overlay,
  size: Size,
): { svg: string; cssImage: string; cssBlend: string } {
  const { image, opacity, blend } = parseOverlay(overlay);
  return {
    svg: el("image", {
      href: image,
      width: size.width,
      height: size.height,
      preserveAspectRatio: "xMidYMid slice",
      opacity,
      style: `mix-blend-mode:${blend}`,
    }),
    // The SVG draws the image like `background-size: cover`, centred; say the same in CSS.
    cssImage: `${cssUrl(image)} center / cover no-repeat`,
    cssBlend: blend,
  };
}
