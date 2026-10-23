import type { CSSProperties } from "react";

import { gradientSvg, type GradientSpec } from "../gradient/index.js";

export interface GradientProps {
  spec: GradientSpec;
  /** Intrinsic width of the SVG (default `spec.size.width`, else 1200); the element itself stretches to its wrapper. */
  width?: number;
  /** Intrinsic height of the SVG (default `spec.size.height`, else 630). */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const STRETCH = ' style="display:block;width:100%;height:100%"';

/**
 * Inline SVG from `gradientSvg(spec, { width, height })`, stretched to fill its
 * wrapper. The markup comes from the validated generator (colours, ids and
 * numbers are parsed and escaped), never from caller-supplied HTML. Two
 * gradients on one page need distinct `idPrefix`es, as with any inline SVG.
 */
export function Gradient({
  spec,
  width,
  height,
  className,
  style,
}: GradientProps) {
  const svg = gradientSvg(spec, {
    width: width ?? spec.size?.width ?? 1200,
    height: height ?? spec.size?.height ?? 630,
  }).replace("<svg", `<svg${STRETCH}`);
  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
