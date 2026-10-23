import { LOGO } from "../brand/logo.js";
import { BRAND } from "../brand/tokens.js";
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
import { FONT_FAMILY, cleanText, optionalText, wrapText } from "./text.js";

/** Overrides for the brand background layers; the card sets size, seed and id. */
export type OgBackground = Partial<
  Omit<BrandBackgroundOptions, "width" | "height" | "seed" | "idPrefix">
>;

export interface OgCardOptions {
  /** Px, 16..16384. Default 1200. */
  width?: number;
  /** Px, 16..16384. Default 630. */
  height?: number;
  /** Required. Whitespace and newlines collapse; at most 3 lines (2 with a subtitle), then "…". With `cover`: uppercase, in Moonhouse, 92 px stepping down to 52 to fit 3 lines. */
  title: string;
  /** At most 2 lines. Omitted when blank. */
  subtitle?: string;
  /** Small uppercase label above the title; one line. Omitted when blank. */
  eyebrow?: string;
  /** One line along the bottom. Omitted when blank. */
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
/** Inter's cap height as a fraction of the em. */
const CAP = 0.7275;

/**
 * A social-preview card: logo + wordmark, wrapped title, accent rule, subtitle,
 * footer; or, with `cover`, the social layout (title, excerpt and a Dagnam.AI bar
 * over the cover's art).
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
  const bg = within("background", () =>
    brandBackgroundLayers({
      ...(dark
        ? {}
        : {
            base: BRAND.background.light,
            band: 0.18,
            glow: 0.25,
            vignette: 0.12,
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
  const text0 = (
    size: number,
    extra: Record<string, string | number | undefined>,
  ) => ({ "font-family": FONT_FAMILY, "font-size": size, fill: fg, ...extra });
  const parts: string[] = [bg.body];

  // Logo mark + wordmark
  const logoSize = 0.09 * u;
  const k = logoSize / LOGO.height;
  parts.push(
    el(
      "g",
      {
        transform: `translate(${fmt(pad)} ${fmt(pad)}) scale(${fmt(k)}) translate(${fmt(-LOGO.x)} ${fmt(-LOGO.y)})`,
      },
      el("path", { d: LOGO.path, fill: BRAND.red }),
    ),
  );
  const wordSize = 0.07 * u;
  parts.push(
    el(
      "text",
      {
        x: pad + logoSize + 0.04 * u,
        y: pad + logoSize / 2 + (CAP / 2) * wordSize,
        ...text0(wordSize, { "font-weight": "700" }),
      },
      "Dagnam",
      el("tspan", { fill: BRAND.red }, "."),
      "AI",
    ),
  );

  // Text blocks, measured first so the group can be centred between the header and footer.
  const titleSize = 0.11 * u;
  const subSize = 0.045 * u;
  const eyebrowSize = 0.035 * u;
  const footerSize = 0.03 * u;
  const titleLines = wrapText(title, {
    maxWidth: 0.6 * width,
    maxLines: subtitle === undefined ? 3 : 2,
    size: titleSize,
    weight: "bold",
  });
  const subLines =
    subtitle === undefined
      ? []
      : wrapText(subtitle, {
          maxWidth: 0.55 * width,
          maxLines: 2,
          size: subSize,
        });
  const eyebrowSpacing = 0.004 * u;
  const eyebrowLines =
    eyebrow === undefined
      ? []
      : wrapText(eyebrow, {
          maxWidth: 0.6 * width,
          maxLines: 1,
          size: eyebrowSize,
          letterSpacing: eyebrowSpacing,
        });
  const footerLines =
    footer === undefined
      ? []
      : wrapText(footer, {
          maxWidth: width - 2 * pad,
          maxLines: 1,
          size: footerSize,
        });

  const titleLead = 1.1 * titleSize;
  const subLead = 1.35 * subSize;
  const gap = 0.04 * u;
  const rule = 0.006 * u;
  const eyebrowBlock =
    eyebrowLines.length > 0 ? 1.1 * eyebrowSize + 0.03 * u : 0;
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

  if (eyebrowLines.length > 0) {
    for (const line of eyebrowLines) {
      parts.push(
        el(
          "text",
          {
            x: pad,
            y: top + 0.88 * eyebrowSize,
            ...text0(eyebrowSize, {
              "font-weight": "400",
              "letter-spacing": eyebrowSpacing,
              fill: BRAND.red,
            }),
          },
          text(line),
        ),
      );
    }
    top += eyebrowBlock;
  }
  for (const line of titleLines) {
    parts.push(
      el(
        "text",
        {
          x: pad,
          y: top + 0.88 * titleSize,
          ...text0(titleSize, { "font-weight": "700" }),
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
      fill: BRAND.red,
    }),
  );
  top += rule + gap;
  for (const line of subLines) {
    parts.push(
      el(
        "text",
        {
          x: pad,
          y: top + (0.88 + 0.175) * subSize,
          ...text0(subSize, { "font-weight": "400", opacity: 0.72 }),
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
          ...text0(footerSize, { "font-weight": "400", opacity: 0.6 }),
        },
        text(line),
      ),
    );
  }

  return svgDoc({ width, height }, el("defs", {}, bg.defs), ...parts);
}
