import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, vi } from "vitest";

import { measureText } from "../../src/scene/text.js";
import { rasterize } from "../helpers/render.js";
import type { Raster } from "../helpers/render.js";

export const NS = 'xmlns="http://www.w3.org/2000/svg"';
export const PNG_SIG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
export const dims = (png: Buffer): [number, number] => [
  png.readUInt32BE(16),
  png.readUInt32BE(20),
];
export const sized = (w: number, h: number, body = ""): string =>
  `<svg ${NS} width="${w}" height="${h}">${body}</svg>`;

/** Decode a PNG back to premultiplied RGBA by drawing it, unscaled, through resvg. */
export function decode(png: Buffer): Raster {
  const [w, h] = dims(png);
  return rasterize(
    sized(
      w,
      h,
      `<image width="${w}" height="${h}" href="data:image/png;base64,${png.toString("base64")}"/>`,
    ),
  );
}
export const pixel = (r: Raster, x: number, y: number): number[] =>
  Array.from(
    r.pixels.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
  );

/** Width in px between the leftmost and rightmost non-transparent columns. */
export function inkWidth(r: Raster): number {
  let lo = r.width;
  let hi = -1;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      if (pixel(r, x, y)[3] !== 0) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
  return hi - lo + 1;
}

export const textSvg = (
  text: string,
  size: number,
  weight: number,
  family = "Inter",
  width = Math.ceil(
    measureText(text, { size, weight: weight === 700 ? "bold" : "regular" }),
  ) + 60,
): string =>
  sized(
    width,
    Math.ceil(size * 1.6),
    `<text x="20" y="${size * 1.2}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="#fff">${text}</text>`,
  );

/** A scratch directory per test file, removed when the file's tests are done. */
export const scratch = mkdtempSync(join(tmpdir(), "dag-vis-render-png-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** Constructor arguments of every fake Resvg built by `fake`; tests clear it in afterEach. */
export const seen: unknown[] = [];

/** Loads a fresh copy of render-png.ts whose `@resvg/resvg-js` is whatever `factory` returns (or throws). */
export const fresh = async (factory: () => Record<string, unknown>) => {
  vi.resetModules();
  vi.doMock("@resvg/resvg-js", factory);
  return import("../../src/node/render-png.js");
};

/** A stand-in for the Resvg class reporting the given size. */
export const fake = (
  width: number,
  height: number,
  render: () => { asPng: () => Buffer } = () => ({
    asPng: () => Buffer.from("png"),
  }),
) =>
  class {
    width = width;
    height = height;
    constructor(...args: unknown[]) {
      seen.push(args);
    }
    render = render;
  };
