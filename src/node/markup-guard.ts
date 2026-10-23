import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";

/**
 * Most `<clipPath>` plus `<mask>` elements. A coarse guard against the one
 * crash seen: a CHAIN of 20,000 clip-path-referencing clipPaths segfaulted
 * resvg 2.6.2 on one machine (10,000 rendered; other platforms not checked).
 * It counts elements, not depth. The generators emit clipPaths only for
 * `fluted`, one per reed (256 at most, siblings, nesting bounded by fluted's
 * own cost cap), and `layers` adds them up, so more than 19 fluted-256 layers
 * (5000 / 256) reaches this cap.
 */
export const MAX_CLIP_MASKS = 5000;

// resvg draws files it is told about. For `<image>` and `<feImage>` an href
// that is not a valid data URL (needs a comma) is a PATH relative to the
// process's working directory, and neither element ever resolves `#id`, so
// `#x.png`, `data:x.png` and a directory called `#` all read files. A data URL
// that IS valid can still hurt: resvg sniffs an SVG out of `image/svg+xml`,
// `text/*` and a missing type, and a nested SVG's `<feImage href>` reads files
// again; and a comma-bearing URL that resvg takes for a nested SVG (`text/*`, an
// empty type) makes `<feImage>` abort the process. So the rule is element-aware and
// deny-by-default, applied to the raw text:
//   - <image>, <feImage> (any namespace prefix): href / xlink:href must be a
//     RASTER data URL: `data:image/png|jpeg|jpg|gif|webp`, optional `;params`,
//     then `,`. Nothing else.
//   - every other element: href / xlink:href must be `#` + an NCName without
//     `.`, `/` or `:`, so it can never read as a path.
// The text is cut into markup in one linear pass (no regex over the whole
// document, so no quadratic backtracking): comments, CDATA sections and
// processing instructions are skipped as units, a DOCTYPE must be plain (no
// internal subset), and every start tag is read by a small state machine in
// which a quoted value can never contain `<` (XML forbids it). Markup that
// cannot be classified (an unterminated comment or tag, a stray `<`) is refused,
// not guessed at. The inside of comments, CDATA and processing instructions is
// still searched for tag-like text and checked as if live, which only errs on
// the rejecting side (an unbalanced quote there cannot hide a real tag, because
// every `<` there is read independently). DTD entities could expand into markup
// this scan never sees, so they are refused outright (no generator emits one).
const ATTRIBUTE = /([^\s=/>"']+)\s*=\s*("[^"]*"|'[^']*')|[^\s=/>"']+/g;
const HREF_NAME = /(?:^|:)href$/i;
const RASTER_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp)(?:;[^,]*)?,/;
const FRAGMENT = /^#[A-Za-z_][A-Za-z0-9_-]*$/;
const FILE_READERS = new Set(["image", "feimage"]);
const CLIP_OR_MASK = new Set(["clippath", "mask"]);
const END_TAG = /<\/[^\s<>/]+\s*>/y;
const NAME_END = /[\s/>!?<]/;

interface Tag {
  name: string;
  attrs: string;
  end: number;
}

/**
 * The start tag whose `<` is at `from`, or undefined when what follows is not
 * a name or the tag does not close before another `<` (a quoted value cannot
 * contain one). Linear: it only moves forward and stops at the next `<`.
 */
function readTag(svg: string, from: number): Tag | undefined {
  let at = from + 1;
  while (at < svg.length && !NAME_END.test(svg.charAt(at))) at++;
  if (at === from + 1) return undefined;
  const nameEnd = at;
  let quote = "";
  for (; at < svg.length; at++) {
    const c = svg.charAt(at);
    if (c === "<") return undefined;
    if (quote !== "") {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">")
      return {
        name: svg.slice(from + 1, nameEnd),
        attrs: svg.slice(nameEnd, at),
        end: at,
      };
  }
  return undefined;
}

/**
 * The index of the `>` that ends the DOCTYPE starting at `from`, or undefined.
 * Only a plain DOCTYPE is understood: no internal subset (`[`), no `<`, and a
 * quoted string (a public or system id) may hold a `>` but must close.
 */
function doctypeEnd(svg: string, from: number): number | undefined {
  if (!svg.startsWith("<!DOCTYPE", from)) return undefined;
  let quote = "";
  for (let at = from + 9; at < svg.length; at++) {
    const c = svg.charAt(at);
    if (c === "<" || c === "[" || c === "]") return undefined;
    if (quote !== "") {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return at;
  }
  return undefined;
}

function refuse(reason: string, at: number): never {
  throw new VisError(
    `svg has markup the external-reference check cannot classify (${reason} at character ${at}), so it is refused`,
  );
}

/** Counts clipPath and mask, and rejects an href that could read a file. */
function checkTag(tag: Tag, counts: { clipMasks: number }): void {
  const { name, attrs } = tag;
  const element = name.slice(name.lastIndexOf(":") + 1).toLowerCase();
  if (CLIP_OR_MASK.has(element)) counts.clipMasks++;
  attrs.replace(ATTRIBUTE, (attr, key?: string, quoted?: string) => {
    if (key === undefined || quoted === undefined || !HREF_NAME.test(key))
      return attr;
    const value = quoted.slice(1, -1);
    const allowed = FILE_READERS.has(element)
      ? RASTER_DATA_URI.test(value)
      : FRAGMENT.test(value);
    if (!allowed)
      throw new VisError(
        `svg has an external reference (${describeValue(`<${name} ${key}=${quoted}`)}): <image> and <feImage> may only use raster data: URIs (data:image/png, jpeg, gif or webp, with a comma), every other element only #id references`,
      );
    return attr;
  });
}

/** Checks every tag-like `<` in text that is not live markup (comment, CDATA, PI); what is not a tag is ignored. */
function checkInert(text: string, counts: { clipMasks: number }): void {
  for (let i = text.indexOf("<"); i !== -1; i = text.indexOf("<", i + 1)) {
    const tag = readTag(text, i);
    if (tag !== undefined) checkTag(tag, counts);
  }
}

/** Skips a `open ... close` section (checking its inside as inert text) and returns the index after it. */
function skipSection(
  svg: string,
  from: number,
  [open, close, what]: readonly [string, string, string],
  counts: { clipMasks: number },
): number {
  const end = svg.indexOf(close, from + open.length);
  if (end === -1) refuse(`unterminated ${what}`, from);
  checkInert(svg.slice(from + open.length, end), counts);
  return end + close.length;
}

const COMMENT = ["<!--", "-->", "comment"] as const;
const CDATA = ["<![CDATA[", "]]>", "CDATA section"] as const;
const PI = ["<?", "?>", "processing instruction"] as const;

/**
 * Throws a VisError when `svg` has an `<image>`/`<feImage>` href that is not a
 * raster data URL, any other element's href that is not a bare `#id`, a DTD
 * entity, markup the scan cannot classify, or too many clipPath/mask elements.
 */
export function checkMarkup(svg: string): void {
  if (svg.includes("<!ENTITY"))
    throw new VisError(
      "svg must not contain DTD entity declarations (<!ENTITY ...>)",
    );
  const counts = { clipMasks: 0 };
  let i = svg.indexOf("<");
  while (i !== -1) {
    let next: number;
    if (svg.startsWith("<!--", i)) next = skipSection(svg, i, COMMENT, counts);
    else if (svg.startsWith("<![CDATA[", i))
      next = skipSection(svg, i, CDATA, counts);
    else if (svg.startsWith("<?", i)) next = skipSection(svg, i, PI, counts);
    else if (svg.startsWith("<!", i)) {
      const end = doctypeEnd(svg, i);
      if (end === undefined) refuse("unsupported <! section", i);
      next = end + 1;
    } else if (svg.startsWith("</", i)) {
      END_TAG.lastIndex = i;
      const closing = END_TAG.exec(svg);
      if (closing === null) refuse("malformed end tag", i);
      next = i + closing[0].length;
    } else {
      const tag = readTag(svg, i);
      if (tag === undefined) refuse("malformed start tag", i);
      checkTag(tag, counts);
      next = tag.end + 1;
    }
    i = svg.indexOf("<", next);
  }
  if (counts.clipMasks > MAX_CLIP_MASKS)
    throw new VisError(
      `svg must have at most ${MAX_CLIP_MASKS} <clipPath> and <mask> elements, got ${counts.clipMasks}`,
    );
}
