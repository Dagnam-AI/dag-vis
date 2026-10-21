import { Resvg } from "@resvg/resvg-js";

export interface Raster {
  width: number;
  height: number;
  /** PREMULTIPLIED RGBA bytes, as resvg-js returns them (#ef4444 at alpha 64 is [60, 17, 17, 64]). */
  pixels: Uint8Array;
}

export function rasterize(svg: string): Raster {
  const img = new Resvg(svg).render();
  return { width: img.width, height: img.height, pixels: img.pixels };
}

/** [r, g, b, a] at integer pixel (x, y). */
export function pixelAt(
  r: Raster,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * r.width + x) * 4;
  return [
    Number(r.pixels[i]),
    Number(r.pixels[i + 1]),
    Number(r.pixels[i + 2]),
    Number(r.pixels[i + 3]),
  ];
}
