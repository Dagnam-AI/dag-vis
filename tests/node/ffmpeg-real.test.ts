import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { fieldPresets } from "../../src/field/index.js";
import { exportAnimation, exportStatic } from "../../src/node/export.js";
import { ffmpegPath } from "../../src/node/ffmpeg.js";
import { messageOf } from "../../src/node/util.js";

// The only test that needs a real ffmpeg, and the only conditional skip in the
// repo. Locally it skips (with the reason printed) when ffmpeg is absent, and a
// format skips when this build lacks its encoder. On CI nothing ever skips: the
// workflow installs ffmpeg, so a missing binary or encoder there is a failure.

const onCi =
  Boolean(process.env.CI) && !["false", "0"].includes(process.env.CI ?? "");
let bin: string | undefined;
let missing: string | undefined;
try {
  bin = ffmpegPath();
} catch (error) {
  missing = messageOf(error);
}
if (bin === undefined && !onCi)
  console.warn(
    `skipping the real-ffmpeg integration test (CI always runs it): ${missing ?? ""}`,
  );

const encoders =
  bin === undefined
    ? ""
    : spawnSync(bin, ["-hide_banner", "-encoders"], { encoding: "utf8" })
        .stdout;
const hasEncoder = (name: string): boolean =>
  onCi || encoders.includes(` ${name} `);

const dir = await mkdtemp(join(tmpdir(), "dag-vis-ffmpeg-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

const cobalt = fieldPresets.cobalt;
/** Ribbon strokes at half opacity in pure red: every drawn pixel is straight (255, 0, 0) at some alpha <= 128. */
const red = {
  kind: "ribbon",
  lines: 8,
  samples: 16,
  colors: ["#ff0000", "#ff0000"],
  opacity: 0.5,
};
const size = { width: 64, height: 36 } as const;

/** What ffmpeg says about a file: its `-i` banner. */
function info(file: string): string {
  return spawnSync(bin ?? "", ["-hide_banner", "-i", file], {
    encoding: "utf8",
  }).stderr;
}

/** The first frame as 8-bit RGBA, YUV read with the BT.709 matrix the files are tagged with. */
function firstFrame(file: string, decoder: string[] = []): Buffer {
  const run = spawnSync(
    bin ?? "",
    [
      "-v",
      "error",
      ...decoder,
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgba",
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: 1 << 24 },
  );
  expect(run.status, String(run.stderr)).toBe(0);
  return run.stdout;
}

const alphas = (rgba: Buffer): number[] =>
  Array.from({ length: rgba.length / 4 }, (_, i) => rgba[i * 4 + 3] ?? 0);

it.runIf(onCi)("ffmpeg is installed on CI", () => {
  expect(missing, "the CI workflow must install ffmpeg").toBeUndefined();
});

describe.skipIf(bin === undefined && !onCi)("real ffmpeg", () => {
  it.skipIf(!hasEncoder("mjpeg"))(
    "jpeg still from the cobalt preset",
    async () => {
      await exportStatic(cobalt, {
        ...size,
        format: "jpeg",
        out: join(dir, "a.jpg"),
      });
      const jpg = await readFile(join(dir, "a.jpg"));
      expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
      expect(info(join(dir, "a.jpg"))).toMatch(/Video: mjpeg.* 64x36/);
    },
    60_000,
  );

  it.skipIf(!hasEncoder("libwebp"))(
    "webp still keeps transparency",
    async () => {
      await exportStatic(red, {
        ...size,
        format: "webp",
        out: join(dir, "a.webp"),
      });
      const webp = await readFile(join(dir, "a.webp"));
      expect([
        webp.subarray(0, 4).toString("latin1"),
        webp.subarray(8, 12).toString("latin1"),
      ]).toEqual(["RIFF", "WEBP"]);
      const a = alphas(firstFrame(join(dir, "a.webp")));
      expect(a.some((v) => v === 0)).toBe(true);
      expect(a.some((v) => v > 0)).toBe(true);
    },
    60_000,
  );

  it.skipIf(!hasEncoder("libaom-av1"))(
    "avif still",
    async () => {
      await exportStatic(cobalt, {
        ...size,
        format: "avif",
        out: join(dir, "a.avif"),
      });
      const avif = await readFile(join(dir, "a.avif"));
      expect(avif.subarray(4, 8).toString("latin1")).toBe("ftyp");
      expect(avif.subarray(8, 12).toString("latin1")).toBe("avif");
    },
    60_000,
  );

  it.skipIf(!hasEncoder("libx264"))(
    "mp4 with faststart, BT.709 tags and the colours that were drawn",
    async () => {
      await exportAnimation(cobalt, {
        ...size,
        fps: 4,
        duration: 1,
        format: "mp4",
        out: join(dir, "a.mp4"),
        loop: true,
      });
      const mp4 = await readFile(join(dir, "a.mp4"));
      expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
      expect(mp4.indexOf("moov")).toBeLessThan(mp4.indexOf("mdat")); // +faststart
      expect(info(join(dir, "a.mp4"))).toMatch(
        /Video: h264.*yuv420p\(tv, bt709.*64x36.* 4 fps/,
      );

      // A flat colour must survive the trip: untagged BT.601 output read as BT.709 shifts #ef4444 to about #fb533f.
      const flat = { kind: "flow", palette: ["#ef4444", "#ef4444"], grain: 0 };
      await exportAnimation(flat, {
        ...size,
        fps: 2,
        duration: 1,
        format: "mp4",
        quality: 1,
        out: join(dir, "flat.mp4"),
      });
      const px = firstFrame(join(dir, "flat.mp4"));
      expect(
        Array.from(px.subarray(0, 3))
          .map((c, i) => Math.abs(c - [0xef, 0x44, 0x44][i]!))
          .every((d) => d <= 4),
      ).toBe(true);
    },
    60_000,
  );

  it.skipIf(!hasEncoder("libvpx-vp9"))(
    "webm, with and without transparency",
    async () => {
      await exportAnimation(cobalt, {
        ...size,
        fps: 4,
        duration: 1,
        format: "webm",
        out: join(dir, "a.webm"),
      });
      expect(info(join(dir, "a.webm"))).toMatch(
        /Video: vp9.*yuv420p\(tv, bt709.*64x36/,
      );
      await exportAnimation(red, {
        ...size,
        fps: 4,
        duration: 1,
        format: "webm",
        alpha: true,
        out: join(dir, "alpha.webm"),
      });
      // The stock decoder drops the alpha plane; libvpx reads it.
      const a = alphas(
        firstFrame(join(dir, "alpha.webm"), ["-c:v", "libvpx-vp9"]),
      );
      expect(a.some((v) => v === 0)).toBe(true);
      expect(a.some((v) => v > 0)).toBe(true);
    },
    60_000,
  );

  it.skipIf(!hasEncoder("apng"))(
    "apng keeps straight alpha when asked, and is opaque otherwise",
    async () => {
      await exportAnimation(red, {
        ...size,
        fps: 4,
        duration: 1,
        format: "apng",
        alpha: true,
        out: join(dir, "alpha.apng"),
      });
      expect(info(join(dir, "alpha.apng"))).toMatch(/Video: apng.*rgba/);
      const raw = spawnSync(
        bin ?? "",
        [
          "-v",
          "error",
          "-i",
          join(dir, "alpha.apng"),
          "-frames:v",
          "1",
          "-pix_fmt",
          "rgba",
          "-f",
          "rawvideo",
          "-",
        ],
        { maxBuffer: 1 << 24 },
      ).stdout;
      const drawn = Array.from({ length: raw.length / 4 }, (_, i) =>
        raw.subarray(i * 4, i * 4 + 4),
      ).filter((p) => (p[3] ?? 0) > 0);
      expect(drawn.length).toBeGreaterThan(0);
      // Straight alpha: the red is still full red under a half-transparent stroke (premultiplied bytes would show it dimmed).
      for (const p of drawn)
        expect([p[0]! >= 250, p[1]! <= 3, p[2]! <= 3]).toEqual([
          true,
          true,
          true,
        ]);
      await exportAnimation(red, {
        ...size,
        fps: 4,
        duration: 1,
        format: "apng",
        out: join(dir, "a.apng"),
      });
      expect(info(join(dir, "a.apng"))).toMatch(/Video: apng.*rgb24/);
    },
    60_000,
  );
});
