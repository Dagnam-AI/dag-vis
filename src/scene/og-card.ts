import { LOGO } from "../brand/logo.js";
import { MOONHOUSE } from "../brand/moonhouse-metrics.js";
import { BRAND } from "../brand/tokens.js";
import { UNBOUNDED } from "../brand/unbounded-metrics.js";
import { parseColor, toHex } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el, svgDoc, text } from "../core/svg.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  orDefault,
  parseId,
  parseSeed,
  within,
} from "../core/validate.js";
import type { GradientSpec } from "../gradient/index.js";
import { brandBackgroundLayers } from "./brand-background.js";
import type { BrandBackgroundOptions } from "./brand-background.js";
import { socialCard } from "./og-social-card.js";
import {
  DISPLAY_FAMILY,
  SANS_FAMILY,
  middleBaseline,
  topBaseline,
  wrapFont,
} from "./text-fonts.js";
import { cleanText, optionalText } from "./text.js";

/** Overrides for the brand background layers; the card sets size, seed and id. */
export type OgBackground = Partial<
  Omit<BrandBackgroundOptions, "width" | "height" | "seed" | "idPrefix">
>;

export interface OgCardOptions {
  /** Px, 16..16384. Default 1200. */
  width?: number;
  /** Px, 16..16384. Default 630. */
  height?: number;
  /** Required. Whitespace and newlines collapse; at most 3 lines (2 with a subtitle), then "…", wrapped to even lines. Set in Unbounded 400. With `cover`: uppercase, in Moonhouse, 92 px stepping down to 52 to fit 3 lines. */
  title: string;
  /** At most 2 lines, wrapped to even lines, in Unbounded. Omitted when blank. */
  subtitle?: string;
  /** Small uppercase label above the title, in Unbounded; one line. Omitted when blank. */
  eyebrow?: string;
  /** One line along the bottom, in Unbounded; a "•" in it is drawn in the brand red. Omitted when blank. */
  footer?: string;
  /** Overrides for the brand background layers. */
  background?: OgBackground;
  /** Default "dark". */
  theme?: "dark" | "light";
  /** Safe integer, default 1; seeds the background. */
  seed?: number;
  /** `<defs>` id namespace (a letter or `_`, then up to 59 letters, digits, `_` or `-`). Default `"vis" + seed`. */
  idPrefix?: string;
  /**
   * Selects the SOCIAL layout (the per-post og:image): this gradient spec, drawn
   * at 1200x630, is the background; pass `coverSpec({ theme: "dark", variant:
   * "banner", ... })`. The social layout takes only `title`, `excerpt`, `seed`,
   * `idPrefix` and `cover` (its `seed`, default 1, and `idPrefix` override any inside the
   * spec; and a `width` of 1200, `height` of 630 and `theme` of
   * "dark", which are all it draws); `subtitle`, `eyebrow`, `footer` and
   * `background` throw. Its text is set in Moonhouse and Unbounded, which the PNG
   * pipeline bundles.
   */
  cover?: GradientSpec;
  /** The social layout's second text: at most 2 lines, omitted when blank. Needs `cover`. */
  excerpt?: string;
}

const MIN_SIDE = 16;

/**
 * A social-preview card: logo + wordmark (Moonhouse), wrapped title, accent rule,
 * subtitle, footer (Unbounded, the site's text face); or, with `cover`, the social
 * layout (title, excerpt and a Dagnam.AI bar over the cover's art). Every line is
 * wrapped by the advance widths of the font it is drawn in, so Node and a browser
 * wrap alike.
 */
export function ogCard(opts: OgCardOptions): string {
  const input: unknown = opts;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `options must be an object, got ${describeValue(input)}`,
    );
  if (opts.cover !== undefined) return socialCard(opts);
  if (opts.excerpt !== undefined)
    throw new VisError(
      "excerpt is only supported with cover: it is the social layout's second text",
    );
  const width = bounded(
    "width",
    orDefault<unknown>(opts.width, 1200),
    MIN_SIDE,
    MAX_DIMENSION,
  );
  const height = bounded(
    "height",
    orDefault<unknown>(opts.height, 630),
    MIN_SIDE,
    MAX_DIMENSION,
  );
  const title = cleanText("title", opts.title);
  if (title === "") throw new VisError("title must not be empty");
  const subtitle = optionalText("subtitle", opts.subtitle);
  const eyebrow = optionalText("eyebrow", opts.eyebrow)?.toUpperCase();
  const footer = optionalText("footer", opts.footer);
  const theme = orDefault<unknown>(opts.theme, "dark");
  if (theme !== "dark" && theme !== "light")
    throw new VisError(
      `theme must be "dark" or "light", got ${describeValue(theme)}`,
    );
  const seed = parseSeed(opts.seed);
  const idPrefix = parseId(
    "idPrefix",
    orDefault<unknown>(opts.idPrefix, `vis${seed}`),
    60,
  );
  const overrides = orDefault<unknown>(opts.background, {});
  if (
    typeof overrides !== "object" ||
    overrides === null ||
    Array.isArray(overrides)
  )
    throw new VisError(
      `background must be an object, got ${describeValue(overrides)}`,
    );

  const dark = theme === "dark";
  const fg = dark ? BRAND.foreground.dark : BRAND.foreground.light;
  // On white the bright BRAND.red is a pale 3.8:1; the deep mark red is 6.0:1.
  const red = dark ? BRAND.red : toHex(parseColor(BRAND.mark));
  const bg = within("background", () =>
    brandBackgroundLayers({
      ...(dark
        ? {}
        : {
            // Crisp, not a wash: on white a wide glow or a band reads as pink fog and a
            // vignette as grey, so the light card keeps the hairlines and the outline
            // (a bit heavier than the dark card's) and only a tight glow at the right edge.
            base: BRAND.background.light,
            band: 0.04,
            glow: 0.35,
            glowRadius: 0.22,
            hairlineWidth: 2.4,
            vignette: 0,
          }),
      ...(overrides as OgBackground),
      width,
      height,
      seed,
      idPrefix,
    }),
  );

  // Everything scales with `u`, so the card keeps its proportions on any
  // aspect ratio and only the crop and margins change (1200x630 gives u = 630).
  const u = Math.min(height, 0.525 * width);
  const pad = u / 7;
  const sans = (
    size: number,
    extra: Record<string, string | number | undefined>,
  ) => ({
    "font-family": SANS_FAMILY,
    "font-size": size,
    "font-weight": "400",
    fill: fg,
    ...extra,
  });
  const parts: string[] = [bg.body];

  // Logo mark + wordmark (Moonhouse, uppercase, the site's wordmark)
  const logoSize = 0.09 * u;
  const k = logoSize / LOGO.height;
  parts.push(
    el(
      "g",
      {
        transform: `translate(${fmt(pad)} ${fmt(pad)}) scale(${fmt(k)}) translate(${fmt(-LOGO.x)} ${fmt(-LOGO.y)})`,
      },
      el("path", { d: LOGO.path, fill: red }),
    ),
  );
  const wordSize = 0.055 * u;
  parts.push(
    el(
      "text",
      {
        x: pad + logoSize + 0.04 * u,
        y: pad + logoSize / 2 + middleBaseline(MOONHOUSE, wordSize),
        "font-family": DISPLAY_FAMILY,
        "font-size": wordSize,
        fill: fg,
      },
      "DAGNAM",
      el("tspan", { fill: red }, ".AI"),
    ),
  );

  // Text blocks, measured first so the group can be centred between the header and footer.
  const titleSize = 0.09 * u;
  const subSize = 0.04 * u;
  const eyebrowSize = 0.028 * u;
  const footerSize = 0.028 * u;
  const wrap = (
    value: string,
    size: number,
    maxWidth: number,
    maxLines: number,
    extra: { letterSpacing?: number; balance?: boolean } = {},
  ): string[] =>
    wrapFont(UNBOUNDED, value, { size, maxWidth, maxLines, ...extra });
  const titleLines = wrap(
    title,
    titleSize,
    0.6 * width,
    subtitle === undefined ? 3 : 2,
    { balance: true },
  );
  const subLines =
    subtitle === undefined
      ? []
      : wrap(subtitle, subSize, 0.55 * width, 2, { balance: true });
  const eyebrowSpacing = 0.006 * u;
  const eyebrowLines =
    eyebrow === undefined
      ? []
      : wrap(eyebrow, eyebrowSize, 0.6 * width, 1, {
          letterSpacing: eyebrowSpacing,
        });
  const footerLines =
    footer === undefined ? [] : wrap(footer, footerSize, width - 2 * pad, 1);

  const titleLead = 1.15 * titleSize;
  const subLead = 1.5 * subSize;
  const gap = 0.04 * u;
  const rule = 0.006 * u;
  const eyebrowBlock =
    eyebrowLines.length > 0 ? 1.4 * eyebrowSize + 0.03 * u : 0;
  const subBlock =
    subLines.length > 0
      ? gap + rule + gap + subLines.length * subLead
      : gap + rule;
  const blockHeight = eyebrowBlock + titleLines.length * titleLead + subBlock;

  const footerBase = height - 0.6 * pad;
  const regionTop = pad + logoSize + 0.04 * u;
  const regionBottom =
    footerLines.length > 0 ? footerBase - footerSize - 0.04 * u : footerBase;
  let top =
    regionTop + Math.max(0, (regionBottom - regionTop - blockHeight) / 2);

  for (const line of eyebrowLines) {
    parts.push(
      el(
        "text",
        {
          x: pad,
          y: top + topBaseline(UNBOUNDED, eyebrowSize),
          ...sans(eyebrowSize, {
            "letter-spacing": eyebrowSpacing,
            fill: red,
          }),
        },
        text(line),
      ),
    );
  }
  if (eyebrowLines.length > 0) top += eyebrowBlock;
  for (const line of titleLines) {
    parts.push(
      el(
        "text",
        {
          x: pad,
          y: top + topBaseline(UNBOUNDED, titleSize),
          ...sans(titleSize, {}),
        },
        text(line),
      ),
    );
    top += titleLead;
  }
  top += gap;
  parts.push(
    el("rect", {
      x: pad,
      y: top,
      width: 0.085 * width,
      height: rule,
      fill: red,
    }),
  );
  top += rule + gap;
  for (const line of subLines) {
    parts.push(
      el(
        "text",
        {
          x: pad,
          y: top + topBaseline(UNBOUNDED, subSize),
          ...sans(subSize, { opacity: 0.72 }),
        },
        text(line),
      ),
    );
    top += subLead;
  }
  for (const line of footerLines) {
    parts.push(
      el(
        "text",
        {
          x: pad,
          y: footerBase,
          ...sans(footerSize, { opacity: 0.6 }),
        },
        ...line
          .split("•")
          .flatMap((piece, i) => [
            ...(i > 0 ? [el("tspan", { fill: red }, "•")] : []),
            text(piece),
          ]),
      ),
    );
  }

  return svgDoc({ width, height }, el("defs", {}, bg.defs), ...parts);
}
