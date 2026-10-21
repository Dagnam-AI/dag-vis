import { fmt } from "./format.js";
import type { Size } from "./geometry.js";

export type Attrs = Record<string, string | number | undefined>;

export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped text content. */
export function text(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One element. Undefined attrs are skipped; numbers go through fmt; strings are escaped. */
export function el(
  tag: string,
  attrs: Attrs = {},
  ...children: string[]
): string {
  let out = `<${tag}`;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    out += ` ${k}="${typeof v === "number" ? fmt(v) : escapeAttr(v)}"`;
  }
  return children.length === 0
    ? `${out}/>`
    : `${out}>${children.join("")}</${tag}>`;
}

/** A standalone SVG document with a pixel viewBox. */
export function svgDoc(size: Size, ...children: string[]): string {
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size.width,
      height: size.height,
      viewBox: `0 0 ${fmt(size.width)} ${fmt(size.height)}`,
    },
    ...children,
  );
}
