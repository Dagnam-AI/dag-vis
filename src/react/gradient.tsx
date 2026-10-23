import { useId, type CSSProperties } from "react";

import { gradientSvg, type GradientSpec } from "../gradient/index.js";

export interface GradientProps {
  spec: GradientSpec;
  /** Intrinsic width of the SVG (default `spec.size.width`, else 1200); the element itself stretches to its wrapper. */
  width?: number;
  /** Intrinsic height of the SVG (default `spec.size.height`, else 630). */
  height?: number;
  /**
   * How the intrinsic size fits a wrapper of another aspect ratio: `slice`
   * (default) covers it and crops the overflow, `meet` letterboxes, `none`
   * stretches (distorting angles and circles).
   */
  fit?: "slice" | "meet" | "none";
  /** Makes the gradient meaningful: the wrapper becomes `role="img"` with this label. Omit for a decorative gradient (`aria-hidden`). */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

const ASPECT = {
  slice: "xMidYMid slice",
  meet: "xMidYMid meet",
  none: "none",
} as const;

/**
 * Inline SVG from `gradientSvg(spec, { width, height })`, stretched to fill its
 * wrapper. The markup comes from the validated generator (colours, ids and
 * numbers are parsed and escaped), never from caller-supplied HTML. When the
 * spec has no `idPrefix`, one is derived from `useId()` (stable between server
 * and client), so several gradients in one document never share `<defs>` ids.
 */
export function Gradient({
  spec,
  width,
  height,
  fit = "slice",
  title,
  className,
  style,
}: GradientProps) {
  const id = useId();
  const idPrefix = spec.idPrefix ?? `vis-${id.replace(/[^\w-]/g, "")}`;
  const svg = gradientSvg(
    { ...spec, idPrefix },
    {
      width: width ?? spec.size?.width ?? 1200,
      height: height ?? spec.size?.height ?? 630,
    },
  ).replace(
    "<svg",
    `<svg preserveAspectRatio="${ASPECT[fit]}" style="display:block;width:100%;height:100%"`,
  );
  return (
    <div
      className={className}
      style={style}
      {...(title === undefined
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": title })}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
