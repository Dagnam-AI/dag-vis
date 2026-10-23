/** A CSS background image that is a function (a gradient or url()), not a bare colour. */
const IMAGE = /^(?:(?:repeating-)?(?:linear|radial|conic)-gradient|url)\(/;

/**
 * The layers of a `background: …;` declaration as a browser reads it, top first.
 * Throws where a browser would drop the whole declaration: CSS allows a bare colour only
 * in the FINAL layer, so a colour anywhere else is invalid.
 */
export function cssLayers(css: string): string[] {
  const value = /^background: (.*?);(?: background-blend-mode:.*;)?$/.exec(
    css,
  )?.[1];
  if (value === undefined)
    throw new Error(`not a background declaration: ${css}`);
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  layers.push(value.slice(start).trim());
  layers.slice(0, -1).forEach((layer) => {
    if (!IMAGE.test(layer))
      throw new Error(
        `bare colour outside the final layer (invalid CSS): ${layer}`,
      );
  });
  return layers;
}
