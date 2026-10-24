/** The five XML characters; `&` first so the entities it produces are not escaped twice. */
export function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** A library SVG string as an <Img src>: Remotion's Img blocks the frame until it is decoded, so static scenes need no bridge. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
