import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  fieldPresets,
  renderField,
  type FieldPresetName,
  type FieldSpec,
} from "../../src/field/index.js";
import { renderSheet, type SheetOptions } from "../../src/node/sheet.js";

const GOLDEN = fileURLToPath(
  new URL("../goldens/field-sheet.sha256", import.meta.url),
);
const NAMES = Object.keys(fieldPresets) as FieldPresetName[];
const sha256 = (data: Uint8ClampedArray): string =>
  createHash("sha256").update(data).digest("hex");
/** A real preset by name (every name here comes from `fieldPresets`). */
const preset = (name: FieldPresetName): FieldSpec => fieldPresets[name];
/** `renderSheet` with options a JS caller could pass but the types refuse. */
const call = (o: unknown): ReturnType<typeof renderSheet> =>
  renderSheet(o as SheetOptions);
const rowsOf = (n: number, columns: number): number => Math.ceil(n / columns);

describe("renderSheet layout", () => {
  const tile = { width: 20, height: 10 };

  it("lays every preset out in a 4-column grid on the background", () => {
    const rows = rowsOf(NAMES.length, 4);
    const f = renderSheet({ tile, gap: 4 });
    expect(f.width).toBe(4 * 20 + 5 * 4);
    expect(f.height).toBe(rows * 10 + (rows + 1) * 4);
    expect(f.data.length).toBe(f.width * f.height * 4);
    // A gap pixel is the background, and so is the whole top margin.
    expect(Array.from(f.data.subarray(0, 4))).toEqual([0x06, 0x06, 0x1a, 255]);
    // The first tile starts after one gap in both directions.
    const first = (4 * f.width + 4) * 4;
    expect(f.data[first + 3]).toBe(255);
  });

  it("puts each preset's own render at its own position, row by row", () => {
    const f = renderSheet({ tile, gap: 3, columns: 3, t: 2 });
    NAMES.forEach((name, k) => {
      const tileFrame = renderField(preset(name), {
        ...tile,
        t: 2,
      });
      const x0 = 3 + (k % 3) * (20 + 3);
      const y0 = 3 + Math.floor(k / 3) * (10 + 3);
      for (let y = 0; y < 10; y++) {
        const from = ((y0 + y) * f.width + x0) * 4;
        expect(Array.from(f.data.subarray(from, from + 80))).toEqual(
          Array.from(tileFrame.data.subarray(y * 80, (y + 1) * 80)),
        );
      }
    });
    // Gaps between tiles stay background.
    const gapPixel = (3 * f.width + 3 + 20) * 4;
    expect(Array.from(f.data.subarray(gapPixel, gapPixel + 4))).toEqual([
      0x06, 0x06, 0x1a, 255,
    ]);
  });

  it("takes the background, the preset subset and a zero gap", () => {
    const f = renderSheet({
      tile,
      gap: 0,
      columns: 2,
      background: "#ff0000",
      presets: { a: preset("fluid-dawn") },
    });
    expect(f.width).toBe(40);
    expect(f.height).toBe(10);
    // The second column is empty: the background shows.
    expect(Array.from(f.data.subarray(20 * 4, 20 * 4 + 4))).toEqual([
      255, 0, 0, 255,
    ]);
    const alone = renderSheet({
      tile,
      presets: { a: preset("fluid-dawn") },
    });
    expect(alone.height).toBe(10 + 2 * 32);
  });

  it("uses the 300 x 170 tile, gap 32 and 4 columns by default", () => {
    // Geometry only: one preset keeps it cheap (a single row, 4 columns wide).
    const f = renderSheet({
      presets: { a: preset("fluid-dawn") },
    });
    expect(f.width).toBe(4 * 300 + 5 * 32);
    expect(f.height).toBe(170 + 2 * 32);
  });

  it("accepts a plain or a prototype-free presets record", () => {
    const spec = preset("fluid-dawn");
    const bare = Object.assign(Object.create(null) as object, { a: spec });
    expect(renderSheet({ tile, presets: bare }).height).toBe(10 + 2 * 32);
    expect(renderSheet({ tile, presets: { a: spec } }).height).toBe(
      10 + 2 * 32,
    );
  });
});

describe("renderSheet validation", () => {
  const spec = preset("fluid-dawn");
  const ok = { tile: { width: 4, height: 4 }, gap: 1, presets: { a: spec } };
  const bad = (patch: object, pattern: RegExp): void => {
    expect(() => renderSheet({ ...ok, ...patch })).toThrow(VisError);
    expect(() => renderSheet({ ...ok, ...patch })).toThrow(pattern);
  };

  it("rejects an options bag that is not an object", () => {
    expect(() => call(null)).toThrow(/options/);
    expect(() => call(3)).toThrow(VisError);
  });

  it("checks the tile: an object of whole pixels within one frame", () => {
    bad({ tile: null }, /tile must be an object/);
    bad({ tile: [4, 4] }, /tile must be an object/);
    bad({ tile: { width: 4.5, height: 4 } }, /tile\.width/);
    bad({ tile: { width: 4, height: 0 } }, /tile\.height/);
    bad({ tile: { width: 4, height: "4" } }, /tile\.height/);
    bad(
      { tile: { width: 16384, height: 16384 } },
      /tile\.width x tile\.height/,
    );
    bad({ tile: {} }, /tile\.width/);
  });

  it("checks gap and columns as integers", () => {
    bad({ gap: -1 }, /gap/);
    bad({ gap: 1.5 }, /gap/);
    bad({ gap: null }, /gap/);
    bad({ columns: 0 }, /columns/);
    bad({ columns: 2.5 }, /columns/);
    bad({ columns: "4" }, /columns/);
  });

  it("checks the background: a valid, opaque colour", () => {
    bad({ background: "nope" }, /background/);
    bad({ background: 5 }, /background/);
    bad({ background: "#ff000080" }, /background must be an opaque colour/);
  });

  it("checks t: a finite number within the render limit", () => {
    bad({ t: Number.NaN }, /^t must/);
    bad({ t: Infinity }, /^t must/);
    bad({ t: "1" }, /^t must/);
    bad({ t: 2e6 }, /^t must/);
  });

  it("checks presets: a plain, non-empty record of valid field specs", () => {
    bad({ presets: null }, /presets must be a plain object/);
    bad({ presets: [spec] }, /presets must be a plain object/);
    bad({ presets: new Map() }, /presets must be a plain object/);
    bad({ presets: 1 }, /presets must be a plain object/);
    bad({ presets: {} }, /presets must hold at least one/);
    bad({ presets: { a: spec, b: { kind: "bogus" } } }, /presets\.b: /);
    bad({ presets: { odd: null } }, /presets\.odd/);
  });

  it("ignores inherited presets: only own properties count", () => {
    const inherited = Object.create({ a: spec }) as object;
    expect(() => call({ ...ok, presets: inherited })).toThrow(/plain object/);
    const shadow = Object.assign(Object.create(null) as object, {
      ["__proto__"]: 1,
    });
    bad({ presets: shadow }, /presets\.__proto__/);
  });

  it("checks the whole sheet against one frame's limits before rendering", () => {
    bad({ columns: 16384, tile: { width: 2, height: 2 } }, /the sheet must be/);
    bad({ gap: 16384 }, /the sheet must be/);
    // Each side within 16384 and the tile within budget, the sheet (5794 x 5794) over it.
    bad(
      { tile: { width: 5792, height: 5792 }, gap: 1, columns: 1 },
      /the sheet must be/,
    );
  });

  it("is a pure function of its options", () => {
    const opts = { tile: { width: 24, height: 14 }, gap: 2, t: 1.5 };
    expect(sha256(renderSheet(opts).data)).toBe(sha256(renderSheet(opts).data));
  });
});

describe("renderSheet presets (tolerance-based, independent of the golden hash)", () => {
  // These hold on every Node major: a golden-hash mismatch that leaves these
  // green is a last-bit transcendental difference, not a regression.
  const tile = { width: 40, height: 24 };

  it.each(NAMES)("%s renders a tile that is not blank or uniform", (name) => {
    const f = renderSheet({
      tile,
      gap: 0,
      columns: 1,
      presets: { [name]: preset(name) },
    });
    const seen = new Set<number>();
    for (let i = 0; i < f.data.length; i += 4)
      seen.add(f.data[i]! * 65536 + f.data[i + 1]! * 256 + f.data[i + 2]!);
    // Many distinct colours: a blank tile (or a missing blit, leaving the background) has one.
    expect(seen.size).toBeGreaterThan(40);
  });

  it.each(NAMES)("%s renders byte-identically twice", (name) => {
    const opts = {
      tile,
      gap: 2,
      presets: { [name]: preset(name) },
    };
    const a = renderSheet(opts).data;
    const b = renderSheet(opts).data;
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });
});

describe("renderSheet golden", () => {
  // Policy: the SHA-256 of the raw RGBA of a small sheet. The CPU path uses
  // Math.floor/sqrt/sin/cos/exp/cbrt/pow, which V8 implements itself, so the
  // hash is stable within one V8 libm implementation. A Node-major change that
  // flips a transcendental's last bit is a legitimate UPDATE_GOLDENS=1
  // regeneration, recorded in the commit message; the per-preset invariant
  // tests above tell that case apart from a real regression. Any preset or
  // maths change also changes the hash, which is the point.
  it("matches the golden hash (UPDATE_GOLDENS=1 to regenerate)", () => {
    const f = renderSheet({ tile: { width: 120, height: 68 }, gap: 8 });
    const hash = sha256(f.data);
    if (process.env.UPDATE_GOLDENS === "1") writeFileSync(GOLDEN, `${hash}\n`);
    // A missing golden fails: a test must never create the expectation it checks.
    expect(
      existsSync(GOLDEN),
      "tests/goldens/field-sheet.sha256 is missing: create it with UPDATE_GOLDENS=1",
    ).toBe(true);
    expect(
      hash,
      `field sheet hash is ${hash} on Node ${process.version}, ${process.platform}/${process.arch}. ` +
        `If the per-preset invariant tests pass, only a libm last bit differs: regenerate with UPDATE_GOLDENS=1.`,
    ).toBe(readFileSync(GOLDEN, "utf8").trim());
  });
});
