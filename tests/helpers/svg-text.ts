/**
 * The text content of a run of our own SVG markup: every `<...>` tag dropped,
 * its children's text kept ("DAGNAM<tspan fill=\"#f00\">.AI</tspan>" is
 * "DAGNAM.AI"). Done by walking the pieces between "<" characters rather than
 * with a tag regex, so no pattern can leave half a tag behind.
 */
export function textContent(markup: string): string {
  return markup
    .split("<")
    .map((piece, i) => (i === 0 ? piece : piece.slice(piece.indexOf(">") + 1)))
    .join("");
}
