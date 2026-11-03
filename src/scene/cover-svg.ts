import type { Size } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { parseId, parseSize } from "../core/validate.js";
import { gradient, grainLayer } from "../gradient/index.js";
import { pattern } from "../pattern/index.js";
import { BANNER_SIZE, CARD_SIZE, SCRIM_SOLID } from "./cover-contrast.js";
import { coverLook } from "./cover-look.js";
import { assertLook } from "./cover-validate.js";
import type {
  CoverLook,
  CoverLookInput,
  CoverScrim,
} from "./cover-look-types.js";

export interface CoverSvgOptions {
  /** Px. Default 1600x512 for a banner and 400x225 for a card. */
  size?: Size;
  /** `<defs>` id namespace: a letter or `_`, then up to 55 letters, digits, `_` or `-`. Default `"cover"`. */
  idPrefix?: string;
}

const MAX_PREFIX = 56;

/** A radial gradient that is `inner` at the centre of an ellipse of the given radii (percent of the box). */
function ellipseGradient(
  id: string,
  at: readonly [number, number],
  radius: readonly [number, number],
  size: Size,
  stops: string,
): string {
  const rx = (radius[0] / 100) * size.width;
  const ry = (radius[1] / 100) * size.height;
  return el(
    "radialGradient",
    {
      id,
      gradientUnits: "userSpaceOnUse",
      cx: 0,
      cy: 0,
      r: 1,
      gradientTransform: `translate(${fmt((at[0] / 100) * size.width)} ${fmt((at[1] / 100) * size.height)}) scale(${fmt(rx)} ${fmt(ry)})`,
    },
    stops,
  );
}

const stop = (offset: number, colour: string, opacity?: number): string =>
  el("stop", { offset, "stop-color": colour, "stop-opacity": opacity });

/**
 * The look as `<defs>` and body markup for composition: the gradient, the masked texture,
 * the scrim, and the grain on top of all three (so the grain dithers the scrim's own
 * steps too). `scrim` defaults to the look's own; the social card passes one made for
 * its title block.
 */
export function coverSvgParts(
  look: CoverLook,
  opts: { size: Size; idPrefix: string; scrim?: CoverScrim | null },
): { defs: string; body: string } {
  const { size } = opts;
  const id = parseId("idPrefix", opts.idPrefix, MAX_PREFIX);
  const scrim = opts.scrim === undefined ? look.scrim : opts.scrim;
  assertLook(look, scrim);
  const { grain, grainBlend, ...rest } = look.spec;
  const art = gradient({ ...rest, size, idPrefix: id });
  const defs = [art.defs];
  const body = [art.svg];

  const tx = look.texture;
  if (tx) {
    const pat = pattern({
      ...tx.pattern,
      idPrefix: `${id}-tx`,
      ...(tx.pattern.kind === "contours" ? { size } : {}),
    });
    const maskId = `${id}-mask`;
    const ramp = `${id}-ramp`;
    const level = Math.round(tx.mask.floor * 255);
    defs.push(
      pat.defs,
      ellipseGradient(
        ramp,
        tx.mask.at,
        tx.mask.radius,
        size,
        stop(0, "#fff") + stop(1, `rgb(${level},${level},${level})`),
      ),
      el(
        "mask",
        {
          id: maskId,
          maskUnits: "userSpaceOnUse",
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
        },
        el("rect", {
          width: size.width,
          height: size.height,
          fill: `url(#${ramp})`,
        }),
      ),
    );
    body.push(
      el("rect", {
        width: size.width,
        height: size.height,
        fill: pat.fill,
        opacity: tx.opacity,
        mask: `url(#${maskId})`,
      }),
    );
  }

  if (scrim && scrim.alpha > 0) {
    const sid = `${id}-scrim`;
    defs.push(
      ellipseGradient(
        sid,
        scrim.at,
        scrim.radius,
        size,
        stop(0, scrim.color, scrim.alpha) +
          stop(SCRIM_SOLID, scrim.color, scrim.alpha) +
          stop(1, scrim.color, 0),
      ),
    );
    body.push(
      el("rect", {
        width: size.width,
        height: size.height,
        fill: `url(#${sid})`,
      }),
    );
  }

  if (grain !== undefined && grain > 0) {
    const g = grainLayer(id, grain, size, look.spec.seed, grainBlend);
    defs.push(g.defs);
    body.push(g.svg);
  }
  return { defs: defs.join(""), body: body.join("") };
}

/**
 * The whole cover as one standalone `<svg>` (`preserveAspectRatio` slice, so it fills a
 * box of any shape): the look's gradient, its masked texture, the scrim of a banner and
 * the grain. Deterministic, and well under 40 KB.
 */
export function coverSvg(
  input: CoverLookInput,
  opts: CoverSvgOptions = {},
): string {
  const look = coverLook(input);
  const size = parseSize(
    "size",
    opts.size ?? (look.variant === "banner" ? BANNER_SIZE : CARD_SIZE),
  );
  const { defs, body } = coverSvgParts(look, {
    size,
    idPrefix: opts.idPrefix ?? "cover",
  });
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size.width,
      height: size.height,
      viewBox: `0 0 ${fmt(size.width)} ${fmt(size.height)}`,
      preserveAspectRatio: "xMidYMid slice",
    },
    el("defs", {}, defs),
    body,
  );
}
