import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import { MAX_T, renderField } from "../../src/field/index.js";
import type { FieldSpec } from "../../src/field/index.js";
import { frameSource, rasterSvg } from "../../src/node/frames.js";
import { renderPng } from "../../src/node/render-png.js";
import { ribbon } from "../../src/scene/index.js";

const flow: FieldSpec = { kind: "flow", palette: ["#000000", "#ffffff"] };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const alphaAt = (rgba: Uint8Array, px: number): number =>
  Number(rgba[px * 4 + 3]);

describe("frameSource: field kinds", () => {
  it("render on the CPU as opaque straight RGBA, PNG and raster-in-SVG", async () => {
    const src = frameSource(flow, 8, 4, 2);
    expect(src.animated).toBe(true);
    const rgba = await src.rgba(0.5);
    expect(rgba.length).toBe(8 * 4 * 4);
    expect(
      Buffer.from(rgba).equals(
        Buffer.from(
          renderField(flow, { width: 8, height: 4, t: 0.5, loop: 2 }).data,
        ),
      ),
    ).toBe(true);
    for (let i = 0; i < 32; i++) expect(alphaAt(rgba, i)).toBe(255);
    const png = await src.png(0.5);
    expect(png.subarray(0, 4).equals(PNG)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(8);
    expect(png.readUInt32BE(20)).toBe(4);
    const svg = src.svg(0.5);
    expect(svg).toContain('data-dag-vis="raster-in-svg"');
    expect(svg).toContain(`data:image/png;base64,${png.toString("base64")}`);
    expect(svg).toContain('width="8" height="4"');
  });

  it("repeat after one loop and are deterministic; a background changes nothing", async () => {
    const src = frameSource(flow, 8, 4, 2);
    const at0 = Buffer.from(await src.rgba(0));
    expect(Buffer.from(await src.rgba(2)).equals(at0)).toBe(true);
    expect(Buffer.from(await src.rgba(0)).equals(at0)).toBe(true);
    expect(Buffer.from(await src.rgba(0, "#ff0000")).equals(at0)).toBe(true);
    expect((await src.png(0, "#ff0000")).equals(await src.png(0))).toBe(true);
    expect(Buffer.from(await src.rgba(0.5)).equals(at0)).toBe(false);
  });

  it("route a fluted spec over a flow or fluid source to the field, not the gradient", () => {
    const fluted = { kind: "fluted", source: flow, reeds: 4 };
    expect(frameSource(fluted, 8, 4).animated).toBe(true);
    expect(
      frameSource(
        {
          ...fluted,
          source: {
            kind: "fluid",
            points: [{ at: [0.5, 0.5], color: "#336699" }],
          },
        },
        8,
        4,
      ).animated,
    ).toBe(true);
  });

  it("validate the spec before any frame", () => {
    expect(() => frameSource({ kind: "flow", palette: "x" }, 8, 4)).toThrow(
      VisError,
    );
  });

  it("reject a time outside the supported range, naming t", async () => {
    const src = frameSource(flow, 8, 4);
    await expect(src.rgba(MAX_T + 1)).rejects.toThrow(/t must/);
    expect(() => src.svg(NaN)).toThrow(/t must/);
  });
});

describe("frameSource: ribbons", () => {
  const spec = { kind: "ribbon", lines: 10, samples: 12, seed: 3 };
  const options = { lines: 10, samples: 12, seed: 3, width: 16, height: 8 };

  it("draw the ribbon at a phase that closes over a loop", () => {
    const src = frameSource(spec, 16, 8, 4);
    expect(src.animated).toBe(true);
    expect(src.svg(0)).toBe(ribbon(options, 0));
    expect(src.svg(1)).toBe(ribbon(options, Math.PI / 2));
    expect(src.svg(4)).toBe(ribbon(options, 0));
    expect(src.svg(-1)).toBe(ribbon(options, (3 * Math.PI) / 2));
  });

  it("advance 0.5 rad/s without a loop", () => {
    const src = frameSource(spec, 16, 8);
    expect(src.svg(2)).toBe(ribbon(options, 1));
  });

  it("rasterise through resvg at exactly the requested size, transparent by default", async () => {
    const src = frameSource(spec, 16, 8);
    const rgba = await src.rgba(0);
    expect(rgba.length).toBe(16 * 8 * 4);
    expect(alphaAt(rgba, 0)).toBe(0);
    const png = await src.png(0);
    expect(png.subarray(0, 4).equals(PNG)).toBe(true);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([16, 8]);
    expect(png.equals(await renderPng(src.svg(0), { width: 16 }))).toBe(true);
  });

  it("flatten onto a background when asked: every pixel opaque", async () => {
    const src = frameSource(spec, 16, 8);
    const rgba = await src.rgba(0, "#102030");
    for (let i = 0; i < 16 * 8; i++) expect(alphaAt(rgba, i)).toBe(255);
    expect(Array.from(rgba.subarray(0, 3))).toEqual([0x10, 0x20, 0x30]);
    const png = await src.png(0, "#102030");
    expect(png.equals(await src.png(0))).toBe(false);
  });

  it("moves at the spec's drift, and a loop overrides it", () => {
    const fast = frameSource({ ...spec, drift: 2 }, 16, 8);
    expect(fast.svg(1.5)).toBe(ribbon(options, 3));
    expect(frameSource({ ...spec, drift: 0 }, 16, 8).svg(9)).toBe(
      ribbon(options, 0),
    );
    expect(frameSource({ ...spec, drift: 2 }, 16, 8, 4).svg(1)).toBe(
      ribbon(options, Math.PI / 2),
    );
  });

  it("rejects a drift that is not a finite number", () => {
    for (const bad of [NaN, Infinity, "1", null])
      expect(() => frameSource({ ...spec, drift: bad }, 16, 8)).toThrow(
        /drift/,
      );
  });

  it("validate the options up front", () => {
    expect(() => frameSource({ kind: "ribbon", lines: 0 }, 16, 8)).toThrow(
      /lines/,
    );
  });
});

describe("frameSource: gradients", () => {
  const spec = { kind: "linear", angle: 90, stops: ["#000000", "#ffffff"] };

  it("are static vector SVG at the requested size", async () => {
    const src = frameSource(spec, 8, 4);
    expect(src.animated).toBe(false);
    expect(src.svg(5)).toBe(src.svg(0));
    expect(src.svg(0)).toContain("<svg");
    const rgba = await src.rgba(7);
    expect(rgba.length).toBe(8 * 4 * 4);
    expect(alphaAt(rgba, 0)).toBe(255);
    const png = await src.png(0);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([8, 4]);
  });

  it("take a background that changes nothing under an opaque fill, and route a fluted gradient to the gradient", async () => {
    const src = frameSource(spec, 8, 4);
    expect(
      Buffer.from(await src.rgba(0, "#ff0000")).equals(
        Buffer.from(await src.rgba(0)),
      ),
    ).toBe(true);
    expect((await src.png(0, "#ff0000")).equals(await src.png(0))).toBe(true);
    const fluted = frameSource({ kind: "fluted", source: spec }, 8, 4);
    expect(fluted.animated).toBe(false);
  });
});

describe("frameSource: validation", () => {
  it.each([null, undefined, 3, "flow", [], {}, { kind: 3 }])(
    "rejects %j as a spec",
    (spec) => {
      expect(() => frameSource(spec, 8, 4)).toThrow(VisError);
    },
  );
  it("rejects an unknown kind", () => {
    expect(() => frameSource({ kind: "nope" }, 8, 4)).toThrow(VisError);
  });
  it.each([0, -1, 1.5, NaN, 16385, "8"])("rejects width %j", (w) => {
    expect(() => frameSource(flow, w as number, 4)).toThrow(/width/);
  });
  it.each([0, 2.5, 16385])("rejects height %j", (h) => {
    expect(() => frameSource(flow, 8, h)).toThrow(/height/);
  });
  it("rejects more than 2^25 pixels, for every family", () => {
    expect(() => frameSource(flow, 8192, 8192)).toThrow(
      /at most 33554432 pixels/,
    );
    expect(() => frameSource({ kind: "ribbon" }, 8192, 8192)).toThrow(/pixels/);
  });
  it.each([0, -2, NaN, Infinity, "2", MAX_T + 1])("rejects loop %j", (loop) => {
    expect(() => frameSource(flow, 8, 4, loop as number)).toThrow(/loop/);
  });
});

describe("rasterSvg", () => {
  it("embeds the PNG at the given size", () => {
    const svg = rasterSvg(Buffer.from("abc"), 3, 2);
    expect(svg).toContain('viewBox="0 0 3 2"');
    expect(svg).toContain("YWJj");
  });
});
