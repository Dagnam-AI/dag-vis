import { createRng } from "../../src/core/rng.js";
import { NS, XL, sized } from "./png-helpers.js";

const b64 = (text: string): string => Buffer.from(text).toString("base64");

/** Where the canary file is, as the generated hrefs spell it. */
export interface CanaryPaths {
  /** Absolute path of a canary PNG (an href that names it directly). */
  abs: string;
  /** A valid raster data: URI, the one href the guard must keep accepting. */
  raster: string;
}

/**
 * Every href value the cases use. The canary-reading ones are relative to the
 * process cwd (`canary.png`, `#canary.png`, `data:canary.png`), to its parent
 * (`../canary.png`) or absolute; the rest are values a renderer may treat
 * differently from the guard (an SVG nested in a data: URL, empty or non-image
 * data: URLs, same-document references).
 */
export function hrefValues({ abs, raster }: CanaryPaths): string[] {
  const nested = sized(
    8,
    8,
    `<filter id="f"><feImage href="${abs}"/></filter><rect width="8" height="8" filter="url(#f)"/>`,
  );
  return [
    "canary.png",
    "../canary.png",
    abs,
    "#canary.png",
    "data:canary.png",
    `file://${abs}`,
    "#id1",
    raster,
    "data:,",
    "data:image/png;base64,",
    `data:image/svg+xml;base64,${b64(nested)}`,
    `data:image/svg+xml,${encodeURIComponent(nested)}`,
    `data:text/plain;base64,${b64(nested)}`,
    `data:;base64,${b64(nested)}`,
  ];
}

/**
 * Text that is not an element but holds a quote or a tag-like fragment. An
 * unbalanced quote in one of these is what once let a real tag slip past the
 * guard, so most of them are unbalanced on purpose.
 */
const WRAPPERS: readonly string[] = [
  "",
  '<!--<b "-->',
  "<!--<b '-->",
  '<!--"-->',
  "<!--'-->",
  '<![CDATA[<b "]]>',
  "<![CDATA[<b ']]>",
  '<style><![CDATA[<b "]]></style>',
  '<style><![CDATA[a { b: "c }]]></style>',
  "<text>it's</text>",
  '<text>say "hi</text>',
  '<?pi "x?>',
  "<?pi 'x?>",
  '<!-- <image href="decoy.png"/> -->',
  '<!-- <g title="a> -->',
];

/** One attribute list carrying `value` the way the case's mode says. */
const ATTRIBUTES: readonly ((value: string, q: string) => string)[] = [
  (v, q) => `href=${q}${v}${q}`,
  (v, q) => `xlink:href=${q}${v}${q}`,
  (v, q) => `href=${q}${v}${q} xlink:href=${q}#id1${q}`,
  (v, q) => `xlink:href=${q}#id1${q} href=${q}${v}${q}`,
  (v, q) => `title="a>b" href=${q}${v}${q}`,
  (v, q) => `x="0"\n\thref\n=\n${q}${v}${q}`,
  (v, q) => `title='"' xlink:href=${q}${v}${q}`,
  (v, q) => `HREF=${q}${v}${q}`,
];

/** Each element form that can carry an href; `a` is the attribute list. */
const TARGETS: readonly ((a: string) => string)[] = [
  (a) => `<image ${a} width="8" height="8"/>`,
  (a) => `<image ${a} width="8" height="8"></image>`,
  (a) =>
    `<filter id="f"><feImage ${a}/></filter><rect width="8" height="8" filter="url(#f)"/>`,
  (a) => `<use ${a}/>`,
  (a) => `<a ${a}><rect width="8" height="8" fill="#00f"/></a>`,
  (a) =>
    `<pattern id="p" ${a} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#00f"/></pattern><rect width="8" height="8" fill="url(#p)"/>`,
  (a) =>
    `<pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><image ${a} width="8" height="8"/></pattern><rect width="8" height="8" fill="url(#p)"/>`,
  (a) => `<g><image ${a} width="8" height="8"/></g>`,
];

/**
 * `count` SVG documents (16x16, no red of their own), the same for the same
 * seed: element x href attribute shape x value x quote x text/comment/CDATA/PI
 * before and after. Some are invalid XML on purpose; the consumer only needs
 * the guard's verdict and, for the accepted ones, what bare resvg draws.
 */
export function guardCases(
  seed: number,
  count: number,
  paths: CanaryPaths,
): string[] {
  const rng = createRng(seed);
  const values = hrefValues(paths);
  const cases: string[] = [];
  for (let n = 0; n < count; n++) {
    const q = rng.pick(['"', "'"]);
    const attrs = rng.pick(ATTRIBUTES)(rng.pick(values), q);
    const body = rng.pick(TARGETS)(attrs);
    const before = rng.pick(WRAPPERS);
    const after = rng.pick(WRAPPERS);
    cases.push(
      `<svg ${NS} ${XL} width="16" height="16">${before}${body}${after}</svg>`,
    );
  }
  return cases;
}
