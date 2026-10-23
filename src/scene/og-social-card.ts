import { MOONHOUSE } from "../brand/moonhouse-metrics.js";
import { BRAND } from "../brand/tokens.js";
import { UNBOUNDED } from "../brand/unbounded-metrics.js";
import { VisError } from "../core/errors.js";
import { el, svgDoc, text } from "../core/svg.js";
import {
  describeValue,
  orDefault,
  parseId,
  parseSeed,
  within,
} from "../core/validate.js";
import { gradient } from "../gradient/index.js";
import type { GradientSpec } from "../gradient/index.js";
import type { OgCardOptions } from "./og-card.js";
import {
  asciiPunctuation,
  fontWidth,
  middleBaseline,
  topBaseline,
  wrapGreedy,
} from "./text-fonts.js";
import { cleanText, optionalText } from "./text.js";

/** The social layout's numbers, px, as the blog app's canvas card drew them. */
const SOCIAL = {
  width: 1200,
  height: 630,
  pad: 80,
  bar: 104,
  /** Tried largest first; the smallest also stands when none fits (the title is then cut). */
  titleSizes: [92, 84, 76, 68, 60, 52],
  titleMin: 52,
  titleLead: 1.02,
  titleLines: 3,
  excerptSize: 30,
  excerptLead: 44,
  excerptLines: 2,
  excerptGap: 24,
  wordmarkSize: 34,
  addressSize: 22,
} as const;
const TEXT_WIDTH = SOCIAL.width - 2 * SOCIAL.pad;
// The family as the font file names itself, lowercase: resvg matches family names
// case-sensitively (a browser does not), and "Moonhouse" would fall back to Inter.
const DISPLAY = "moonhouse, sans-serif";
const SANS = "Unbounded, sans-serif";

/**
 * The social card. Text is set in the two bundled brand fonts: lines are wrapped
 * by their advance widths (no canvas, no font parsing: the same lines in a
 * browser and in Node), and each line's SVG baseline is its canvas top (or
 * middle) plus the font's normalised ascent (`topBaseline`, `middleBaseline`).
 */
export function socialCard(opts: OgCardOptions): string {
  for (const name of ["subtitle", "eyebrow", "footer", "background"] as const)
    if (opts[name] !== undefined)
      throw new VisError(
        `${name} is not supported with cover: the social layout has no ${name}`,
      );
  const theme: unknown = opts.theme;
  if (theme !== undefined && theme !== "dark")
    throw new VisError(
      `theme must be "dark" with cover, got ${describeValue(theme)}`,
    );
  for (const [name, value, fixed] of [
    ["width", opts.width, SOCIAL.width],
    ["height", opts.height, SOCIAL.height],
  ] as const)
    if (value !== undefined && value !== fixed)
      throw new VisError(
        `${name} must be ${fixed} with cover, got ${describeValue(value)}`,
      );
  const title = cleanText("title", opts.title);
  if (title === "") throw new VisError("title must not be empty");
  const excerpt = optionalText("excerpt", opts.excerpt);
  const cover: unknown = opts.cover;
  if (typeof cover !== "object" || cover === null || Array.isArray(cover))
    throw new VisError(
      `cover must be a gradient spec object, got ${describeValue(cover)}`,
    );
  const seed = parseSeed(opts.seed);
  const idPrefix = parseId(
    "idPrefix",
    orDefault<unknown>(opts.idPrefix, `vis${seed}`),
    60,
  );
  const art = within("cover", () =>
    gradient({
      ...(cover as GradientSpec),
      size: { width: SOCIAL.width, height: SOCIAL.height },
      seed,
      idPrefix,
    }),
  );

  // The title: uppercase, the largest size that fits three lines, else the smallest with an
  // ellipsis. Moonhouse has no curly quotes, dashes or "…", and resvg would then draw the
  // whole line in a fallback face: ASCII stand-ins keep it in Moonhouse ("..." for "…").
  const upper = asciiPunctuation(title).toUpperCase();
  const wrapTitle = (size: number): string[] =>
    wrapGreedy(
      (t) => fontWidth(MOONHOUSE, t, size),
      upper,
      TEXT_WIDTH,
      SOCIAL.titleLines,
      "...",
    );
  const fits = SOCIAL.titleSizes.find(
    (size) => wrapTitle(size).join(" ") === upper,
  );
  const titleSize = fits ?? SOCIAL.titleMin;
  const titleRows = wrapTitle(titleSize);
  const fill = { fill: "#ffffff" };
  const parts: string[] = [el("defs", {}, art.defs), art.svg];
  const line = (
    x: number,
    y: number,
    family: string,
    size: number,
    attrs: Record<string, string>,
    ...content: string[]
  ): string =>
    el(
      "text",
      { x, y, "font-family": family, "font-size": size, ...attrs },
      ...content,
    );

  titleRows.forEach((row, i) => {
    const top = SOCIAL.pad + i * titleSize * SOCIAL.titleLead;
    parts.push(
      line(
        SOCIAL.pad,
        top + topBaseline(MOONHOUSE, titleSize),
        DISPLAY,
        titleSize,
        fill,
        text(row),
      ),
    );
  });

  const excerptTop =
    SOCIAL.pad +
    titleRows.length * titleSize * SOCIAL.titleLead +
    SOCIAL.excerptGap;
  wrapGreedy(
    (t) => fontWidth(UNBOUNDED, t, SOCIAL.excerptSize),
    excerpt ?? "",
    TEXT_WIDTH,
    SOCIAL.excerptLines,
    "…",
  ).forEach((row, i) => {
    parts.push(
      line(
        SOCIAL.pad,
        excerptTop +
          i * SOCIAL.excerptLead +
          topBaseline(UNBOUNDED, SOCIAL.excerptSize),
        SANS,
        SOCIAL.excerptSize,
        { "font-weight": "400", ...fill, "fill-opacity": "0.72" },
        text(row),
      ),
    );
  });

  // The bar: a rule, then the wordmark and the address centred on the bar's middle.
  const barTop = SOCIAL.height - SOCIAL.bar;
  const middle = barTop + SOCIAL.bar / 2;
  parts.push(
    el("rect", {
      x: SOCIAL.pad,
      y: barTop,
      width: TEXT_WIDTH,
      height: 1,
      ...fill,
      "fill-opacity": "0.14",
    }),
    line(
      SOCIAL.pad,
      middle + middleBaseline(MOONHOUSE, SOCIAL.wordmarkSize),
      DISPLAY,
      SOCIAL.wordmarkSize,
      fill,
      "DAGNAM",
      el("tspan", { fill: BRAND.red }, ".AI"),
    ),
    line(
      SOCIAL.width - SOCIAL.pad,
      middle + middleBaseline(UNBOUNDED, SOCIAL.addressSize),
      SANS,
      SOCIAL.addressSize,
      {
        "text-anchor": "end",
        "font-weight": "400",
        ...fill,
        "fill-opacity": "0.6",
      },
      "dagnam.ai/blog",
    ),
  );
  return svgDoc({ width: SOCIAL.width, height: SOCIAL.height }, ...parts);
}
