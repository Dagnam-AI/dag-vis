import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type * as Fs from "node:fs/promises";

import { VisError } from "../../src/core/index.js";
import type { FieldSpec } from "../../src/field/index.js";
import {
  ANIMATION_FORMATS,
  STATIC_FORMATS,
  exportAnimation,
  exportStatic,
} from "../../src/node/export.js";
import { frameSource } from "../../src/node/frames.js";

// Fails the rename that publishes a file when the hook says so (a full disk, a permission change).
const hook = vi.hoisted(() => ({
  failRename: undefined as undefined | ((to: string) => boolean),
}));
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof Fs>();
  return {
    ...real,
    rename: (from: string, to: string) =>
      hook.failRename?.(to) === true
        ? Promise.reject(new Error("disk full"))
        : real.rename(from, to),
  };
});

// A stand-in for ffmpeg: an executable that records its arguments, the number
// of bytes on stdin and the first pixel it was given into the output file (the
// last argument), exactly where the real one would write. STANDIN_MODE=fail
// writes part of the output and exits 1.
const STANDIN = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-version") process.exit(0);
let bytes = 0;
let head = Buffer.alloc(0);
process.stdin.on("data", (d) => {
  if (head.length < 4) head = Buffer.concat([head, d]).subarray(0, 4);
  bytes += d.length;
});
process.stdin.on("end", () => {
  const out = args[args.length - 1];
  fs.writeFileSync(out, JSON.stringify({ args, bytes, head: [...head] }));
  if (process.env.STANDIN_MODE === "fail") {
    console.error("encoder exploded");
    process.exit(1);
  }
});
`;

const flow: FieldSpec = { kind: "flow", palette: ["#000000", "#ffffff"] };
const ribbon = { kind: "ribbon", lines: 6, samples: 8 };
const work = mkdtempSync(join(tmpdir(), "dag-vis-export-"));
const previous = process.env.DAG_VIS_FFMPEG;
let n = 0;
/** A fresh empty folder per test. */
const fresh = (): string => {
  const dir = join(work, `t${++n}`);
  mkdirSync(dir);
  return dir;
};
const files = (dir: string): string[] => readdirSync(dir).sort();
const recorded = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as {
    args: string[];
    bytes: number;
    head: number[];
  };
/** The value after the LAST `flag` (the input and output sides both carry -pix_fmt). */
const after = (args: string[], flag: string): string | undefined =>
  args[args.lastIndexOf(flag) + 1];

beforeAll(() => {
  const bin = join(work, "ffmpeg-standin");
  writeFileSync(bin, STANDIN);
  chmodSync(bin, 0o755);
  process.env.DAG_VIS_FFMPEG = bin;
});
afterEach(() => {
  hook.failRename = undefined;
  delete process.env.STANDIN_MODE;
});
afterAll(() => {
  if (previous === undefined) delete process.env.DAG_VIS_FFMPEG;
  else process.env.DAG_VIS_FFMPEG = previous;
  rmSync(work, { recursive: true, force: true });
});

describe("exportStatic", () => {
  it("writes png and svg without ffmpeg, leaving no temporary file", async () => {
    const dir = fresh();
    process.env.DAG_VIS_FFMPEG = "/nonexistent/ffmpeg";
    try {
      await exportStatic(flow, {
        width: 8,
        height: 4,
        format: "png",
        out: join(dir, "a.png"),
      });
      await exportStatic(flow, {
        width: 8,
        height: 4,
        format: "svg",
        out: join(dir, "a.svg"),
        t: 1,
      });
    } finally {
      process.env.DAG_VIS_FFMPEG = join(work, "ffmpeg-standin");
    }
    const png = readFileSync(join(dir, "a.png"));
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([
      8, 4, 6,
    ]);
    const svg = readFileSync(join(dir, "a.svg"), "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(files(dir)).toEqual(["a.png", "a.svg"]);
  });

  it("png keeps transparency; the svg is the vector ribbon", async () => {
    const dir = fresh();
    await exportStatic(ribbon, {
      width: 16,
      height: 8,
      format: "png",
      out: join(dir, "r.png"),
    });
    expect(readFileSync(join(dir, "r.png"))[25]).toBe(6);
    await exportStatic(ribbon, {
      width: 16,
      height: 8,
      format: "svg",
      out: join(dir, "r.svg"),
    });
    expect(readFileSync(join(dir, "r.svg"), "utf8")).toContain("<path");
  });

  it("replaces an existing file, and resolves a relative path against the working directory", async () => {
    const dir = fresh();
    writeFileSync(join(dir, "a.svg"), "old");
    await exportStatic(flow, {
      width: 8,
      height: 4,
      format: "svg",
      out: join(dir, "a.svg"),
    });
    expect(readFileSync(join(dir, "a.svg"), "utf8")).not.toBe("old");
    const rel = `.dag-vis-rel-${process.pid}.svg`;
    try {
      await exportStatic(flow, {
        width: 8,
        height: 4,
        format: "svg",
        out: rel,
      });
      expect(readFileSync(join(process.cwd(), rel), "utf8")).toContain("<svg");
    } finally {
      rmSync(join(process.cwd(), rel), { force: true });
    }
  });

  it("jpeg, webp and avif pipe ONE frame to ffmpeg with the still arguments and land at out", async () => {
    const dir = fresh();
    await exportStatic(flow, {
      width: 8,
      height: 4,
      format: "webp",
      out: join(dir, "a.webp"),
      quality: 0.5,
    });
    const webp = recorded(join(dir, "a.webp"));
    expect(webp.bytes).toBe(8 * 4 * 4);
    expect(webp.args).toEqual(
      expect.arrayContaining([
        "-c:v",
        "libwebp",
        "-quality",
        "50",
        "-frames:v",
        "1",
      ]),
    );
    expect(after(webp.args, "-s")).toBe("8x4");
    // ffmpeg wrote a temporary file in the same folder, renamed into place afterwards.
    expect(webp.args.at(-1)).toMatch(/\.dag-vis-[0-9a-f]+\.tmp$/);
    expect(webp.args.at(-1)?.startsWith(dir)).toBe(true);
    await exportStatic(flow, {
      width: 8,
      height: 4,
      format: "jpeg",
      out: join(dir, "a.jpg"),
    });
    expect(recorded(join(dir, "a.jpg")).args).toEqual(
      expect.arrayContaining(["-c:v", "mjpeg", "-q:v", "8"]),
    );
    await exportStatic(flow, {
      width: 8,
      height: 4,
      format: "avif",
      out: join(dir, "a.avif"),
    });
    expect(recorded(join(dir, "a.avif")).args).toContain("-still-picture");
    expect(files(dir)).toEqual(["a.avif", "a.jpg", "a.webp"]);
  });

  it("flattens transparency onto the background for jpeg and avif, and keeps it for webp", async () => {
    const dir = fresh();
    const base = { width: 16, height: 8 };
    await exportStatic(ribbon, {
      ...base,
      format: "jpeg",
      out: join(dir, "a.jpg"),
    });
    expect(recorded(join(dir, "a.jpg")).head).toEqual([0, 0, 0, 255]);
    await exportStatic(ribbon, {
      ...base,
      format: "avif",
      out: join(dir, "a.avif"),
      background: "#102030",
    });
    expect(recorded(join(dir, "a.avif")).head).toEqual([16, 32, 48, 255]);
    await exportStatic(ribbon, {
      ...base,
      format: "webp",
      out: join(dir, "a.webp"),
      background: "#102030",
    });
    expect(recorded(join(dir, "a.webp")).head).toEqual([0, 0, 0, 0]);
  });

  it("t and loop select the frame the animated export would produce", async () => {
    const dir = fresh();
    const frame = async (o: object) => {
      await exportStatic(ribbon, {
        width: 16,
        height: 8,
        format: "svg",
        out: join(dir, "s.svg"),
        ...o,
      });
      return readFileSync(join(dir, "s.svg"), "utf8");
    };
    expect(await frame({ t: 4, loop: 4 })).toBe(await frame({ t: 0, loop: 4 }));
    expect(await frame({ t: 1 })).not.toBe(await frame({ t: 0 }));
  });

  it("checks everything before rendering or touching a file", async () => {
    const dir = fresh();
    const o = { width: 8, height: 4, out: join(dir, "x") };
    const bad = (extra: object, spec: unknown = flow) =>
      expect(exportStatic(spec, { ...o, format: "jpeg", ...extra } as never))
        .rejects;
    await expect(
      exportStatic(flow, { ...o, format: "bmp" as never }),
    ).rejects.toThrow(/format must be one of png\|svg\|jpeg\|webp\|avif/);
    await expect(exportStatic(flow, null as never)).rejects.toThrow(
      /options must be an object/,
    );
    await bad({ out: "" }).toThrow(/out must be a file path/);
    await bad({ out: "a\0b" }).toThrow(/out/);
    await bad({ out: 5 }).toThrow(/out/);
    await bad({ out: "x".repeat(5000) }).toThrow(/out/);
    await bad({ quality: 2 }).toThrow(/quality/);
    await bad({ width: 7.5 }).toThrow(/width/);
    await bad({ background: "rgba(0,0,0,0.5)" }).toThrow(
      /background must be an opaque/,
    );
    await bad({ background: "nope" }).toThrow(/background/);
    await bad({}, { kind: "nope" }).toThrow(VisError);
    expect(STATIC_FORMATS).toEqual(["png", "svg", "jpeg", "webp", "avif"]);
    expect(files(dir)).toEqual([]);
  });

  it("reports missing ffmpeg before rendering, creating nothing", async () => {
    const dir = fresh();
    process.env.DAG_VIS_FFMPEG = "/nonexistent/ffmpeg";
    try {
      await expect(
        exportStatic(flow, {
          width: 8,
          height: 4,
          format: "jpeg",
          out: join(dir, "a.jpg"),
        }),
      ).rejects.toThrow(/ffmpeg not found/);
    } finally {
      process.env.DAG_VIS_FFMPEG = join(work, "ffmpeg-standin");
    }
    expect(files(dir)).toEqual([]);
  });

  it("removes the partly written file when ffmpeg fails, and keeps the file that was there", async () => {
    const dir = fresh();
    writeFileSync(join(dir, "a.jpg"), "precious");
    process.env.STANDIN_MODE = "fail";
    await expect(
      exportStatic(flow, {
        width: 8,
        height: 4,
        format: "jpeg",
        out: join(dir, "a.jpg"),
      }),
    ).rejects.toThrow(/ffmpeg exited with 1: encoder exploded/);
    expect(files(dir)).toEqual(["a.jpg"]);
    expect(readFileSync(join(dir, "a.jpg"), "utf8")).toBe("precious");
  });

  it("names out when the file cannot be written", async () => {
    const dir = fresh();
    await expect(
      exportStatic(flow, {
        width: 8,
        height: 4,
        format: "png",
        out: join(dir, "missing", "a.png"),
      }),
    ).rejects.toThrow(/could not write out ".*"/);
    // out is a folder: the rename fails, the temporary file goes.
    mkdirSync(join(dir, "folder"));
    await expect(
      exportStatic(flow, {
        width: 8,
        height: 4,
        format: "svg",
        out: join(dir, "folder"),
      }),
    ).rejects.toThrow(/could not write out/);
    expect(files(dir)).toEqual(["folder"]);
  });
});

describe("exportAnimation", () => {
  const base = { width: 8, height: 4, fps: 4, duration: 1 } as const;

  it("gif: a looping file written without ffmpeg", async () => {
    const dir = fresh();
    process.env.DAG_VIS_FFMPEG = "/nonexistent/ffmpeg";
    try {
      await exportAnimation(flow, {
        ...base,
        format: "gif",
        loop: true,
        out: join(dir, "a.gif"),
      });
    } finally {
      process.env.DAG_VIS_FFMPEG = join(work, "ffmpeg-standin");
    }
    expect(
      readFileSync(join(dir, "a.gif")).subarray(0, 6).toString("latin1"),
    ).toBe("GIF89a");
    expect(files(dir)).toEqual(["a.gif"]);
  });

  it("gif flattens a transparent ribbon onto the background", async () => {
    const dir = fresh();
    await exportAnimation(ribbon, {
      ...base,
      width: 16,
      format: "gif",
      out: join(dir, "a.gif"),
      background: "#ffffff",
    });
    const gif = readFileSync(join(dir, "a.gif"));
    expect(gif.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    // The transparent area became white (and not the black an alpha-blind quantiser would give it).
    expect(gif.includes(Buffer.from([255, 255, 255]))).toBe(true);
  });

  it("png-seq: one zero-padded PNG per frame in the created folder, plus a poster", async () => {
    const dir = fresh();
    const seq = join(dir, "nested", "seq");
    await exportAnimation(flow, {
      ...base,
      fps: 2,
      duration: 1.5,
      format: "png-seq",
      out: seq,
      poster: join(dir, "poster.png"),
    });
    expect(files(seq)).toEqual([
      "frame-00000.png",
      "frame-00001.png",
      "frame-00002.png",
    ]);
    expect(
      readFileSync(join(dir, "poster.png")).subarray(1, 4).toString("latin1"),
    ).toBe("PNG");
    expect(
      readFileSync(join(seq, "frame-00000.png")).equals(
        readFileSync(join(dir, "poster.png")),
      ),
    ).toBe(true);
  });

  it.each(["mp4", "webm", "apng"] as const)(
    "%s streams every frame to ffmpeg",
    async (format) => {
      const dir = fresh();
      const out = join(dir, `a.${format}`);
      await exportAnimation(flow, {
        ...base,
        fps: 3,
        duration: 2,
        format,
        out,
      });
      const run = recorded(out);
      expect(run.bytes).toBe(6 * 8 * 4 * 4);
      expect(after(run.args, "-r")).toBe("3");
      expect(run.args).toContain(
        format === "apng"
          ? "apng"
          : format === "mp4"
            ? "libx264"
            : "libvpx-vp9",
      );
      expect(files(dir)).toEqual([`a.${format}`]);
    },
  );

  it("keeps transparency only when asked (webm, apng): otherwise flattens, with the matching pixel format", async () => {
    const dir = fresh();
    const o = { ...base, width: 16 };
    await exportAnimation(ribbon, {
      ...o,
      format: "webm",
      alpha: true,
      out: join(dir, "a.webm"),
    });
    const withAlpha = recorded(join(dir, "a.webm"));
    expect(withAlpha.args).toContain("yuva420p");
    expect(withAlpha.head).toEqual([0, 0, 0, 0]);
    await exportAnimation(ribbon, {
      ...o,
      format: "apng",
      alpha: true,
      out: join(dir, "a.apng"),
    });
    expect(after(recorded(join(dir, "a.apng")).args, "-pix_fmt")).toBe("rgba");
    await exportAnimation(ribbon, {
      ...o,
      format: "webm",
      out: join(dir, "b.webm"),
      background: "#102030",
    });
    expect(recorded(join(dir, "b.webm")).head).toEqual([16, 32, 48, 255]);
    await exportAnimation(ribbon, {
      ...o,
      format: "apng",
      out: join(dir, "b.apng"),
    });
    expect(after(recorded(join(dir, "b.apng")).args, "-pix_fmt")).toBe("rgb24");
    expect(recorded(join(dir, "b.apng")).head).toEqual([0, 0, 0, 255]);
    await exportAnimation(ribbon, {
      ...o,
      format: "mp4",
      out: join(dir, "a.mp4"),
    });
    expect(recorded(join(dir, "a.mp4")).head).toEqual([0, 0, 0, 255]);
  });

  it("png-seq keeps the transparency of every frame", async () => {
    const dir = fresh();
    await exportAnimation(ribbon, {
      ...base,
      width: 16,
      format: "png-seq",
      out: join(dir, "s"),
    });
    expect(readFileSync(join(dir, "s", "frame-00000.png"))[25]).toBe(6);
  });

  it("loop: the period is the whole clip, so frame count equals frame 0", async () => {
    const dir = fresh();
    // 0.25 s at 30 fps is 8 frames (7.5 rounded): the seamless period is 8 / 30 s, not 0.25.
    await exportAnimation(ribbon, {
      width: 16,
      height: 8,
      fps: 30,
      duration: 0.25,
      format: "png-seq",
      loop: true,
      out: join(dir, "s"),
    });
    expect(files(join(dir, "s"))).toHaveLength(8);
    const src = frameSource(ribbon, 16, 8, 8 / 30);
    expect(src.svg(8 / 30)).toBe(src.svg(0));
  });

  it("warns through the callback about a GIF wider than 800 px", async () => {
    const dir = fresh();
    const warn = vi.fn();
    await exportAnimation(flow, {
      width: 801,
      height: 2,
      format: "gif",
      fps: 1,
      duration: 1,
      out: join(dir, "a.gif"),
      warn,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("GIF wider than"),
    );
  });

  it("warns when a GIF is faster than 50 fps, through the callback or console.warn, and not at 50", async () => {
    const dir = fresh();
    const gif = (fps: number, warn?: (m: string) => void) =>
      exportAnimation(flow, {
        width: 8,
        height: 4,
        format: "gif",
        fps,
        duration: 0.1,
        out: join(dir, `${fps}.gif`),
        ...(warn === undefined ? {} : { warn }),
      });
    const warn = vi.fn();
    await gif(50, warn);
    expect(warn).not.toHaveBeenCalled();
    await gif(60, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/60 fps plays at 50; use mp4 or webm/),
    );
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await gif(55);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("55 fps"));
    } finally {
      spy.mockRestore();
    }
    // Other formats are not held to the GIF delay floor.
    await exportAnimation(flow, {
      width: 8,
      height: 4,
      format: "png-seq",
      fps: 60,
      duration: 0.05,
      out: join(dir, "seq"),
      warn,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("refuses a folder that already holds a frame sequence, touching nothing", async () => {
    const dir = fresh();
    const seq = join(dir, "seq");
    mkdirSync(seq);
    writeFileSync(join(seq, "frame-00000.png"), "old zero");
    writeFileSync(join(seq, "frame-00007.png"), "old seven");
    writeFileSync(join(dir, "poster.png"), "old poster");
    await expect(
      exportAnimation(flow, {
        ...base,
        format: "png-seq",
        out: seq,
        poster: join(dir, "poster.png"),
      }),
    ).rejects.toThrow(/out ".*" already contains a frame sequence/);
    expect(files(seq)).toEqual(["frame-00000.png", "frame-00007.png"]);
    expect(readFileSync(join(seq, "frame-00000.png"), "utf8")).toBe("old zero");
    expect(readFileSync(join(seq, "frame-00007.png"), "utf8")).toBe(
      "old seven",
    );
    expect(readFileSync(join(dir, "poster.png"), "utf8")).toBe("old poster");
  });

  it("accepts a folder with other files, even frame look-alikes, and failure removes only the frames it wrote", async () => {
    const dir = fresh();
    const seq = join(dir, "mine");
    mkdirSync(seq);
    const others = [
      "notes.txt",
      "frame-1.png",
      "frame-00000.jpg",
      "frames-00000.png",
    ];
    for (const name of others) writeFileSync(join(seq, name), name);
    hook.failRename = (to) => to.endsWith("frame-00002.png");
    await expect(
      exportAnimation(flow, { ...base, format: "png-seq", out: seq }),
    ).rejects.toThrow(/disk full/);
    expect(files(seq)).toEqual([...others].sort());
    for (const name of others)
      expect(readFileSync(join(seq, name), "utf8")).toBe(name);
    hook.failRename = undefined;
    await exportAnimation(flow, { ...base, format: "png-seq", out: seq });
    expect(files(seq)).toHaveLength(others.length + 4);
  });

  it("checks quality for every format, even where it is not used", async () => {
    const dir = fresh();
    for (const format of ["gif", "png-seq"] as const)
      await expect(
        exportAnimation(flow, {
          ...base,
          format,
          quality: 2,
          out: join(dir, "x"),
        }),
      ).rejects.toThrow(/quality/);
    for (const format of ["png", "svg"] as const)
      await expect(
        exportStatic(flow, {
          width: 8,
          height: 4,
          format,
          quality: NaN,
          out: join(dir, "x"),
        }),
      ).rejects.toThrow(/quality/);
    expect(files(dir)).toEqual([]);
  });

  it("defaults to 30 fps and 6 seconds", async () => {
    const dir = fresh();
    const frames = async (name: string, o: object) => {
      await exportAnimation(flow, {
        width: 8,
        height: 4,
        format: "png-seq",
        out: join(dir, name),
        ...o,
      });
      return files(join(dir, name)).length;
    };
    expect(await frames("fps", { duration: 0.1 })).toBe(3);
    expect(await frames("duration", { fps: 1 })).toBe(6);
  });

  it("checks everything before rendering or touching a file", async () => {
    const dir = fresh();
    const o = {
      width: 8,
      height: 4,
      format: "mp4",
      out: join(dir, "x"),
      fps: 4,
      duration: 1,
    };
    const bad = (extra: object, spec: unknown = flow) =>
      expect(exportAnimation(spec, { ...o, ...extra } as never)).rejects;
    await bad({ width: 7 }).toThrow(/even/);
    await bad({ height: 5 }).toThrow(/even/);
    await bad(
      { format: "gif" },
      { kind: "linear", angle: 0, stops: ["#000", "#fff"] },
    ).toThrow(/static/);
    await bad({ format: "gif", fps: 99 }).toThrow(VisError);
    await bad({ format: "gif", fps: 1.5 }).toThrow(/fps/);
    await bad({ format: "gif", duration: 61 }).toThrow(/duration/);
    await bad({ format: "bmp" }).toThrow(
      /format must be one of gif\|apng\|mp4\|webm\|png-seq/,
    );
    await bad({ alpha: true }).toThrow(/alpha is not supported by mp4/);
    await bad({ format: "gif", alpha: true }).toThrow(
      /alpha is not supported by gif/,
    );
    await bad({ alpha: "yes" }).toThrow(/alpha/);
    await bad({ loop: 1 }).toThrow(/loop/);
    await bad({ quality: -1 }).toThrow(/quality/);
    await bad({ out: "" }).toThrow(/out/);
    await bad({ poster: "" }).toThrow(/poster/);
    await bad({ poster: o.out }).toThrow(/poster must be a different path/);
    await bad({ warn: "loud" }).toThrow(/warn must be a function/);
    await bad({ background: "rgba(0,0,0,0.5)" }).toThrow(
      /background must be an opaque/,
    );
    await bad({}, { kind: "ribbon", lines: 0 }).toThrow(/lines/);
    await expect(exportAnimation(flow, undefined as never)).rejects.toThrow(
      /options/,
    );
    expect(ANIMATION_FORMATS).toEqual([
      "gif",
      "apng",
      "mp4",
      "webm",
      "png-seq",
    ]);
    expect(files(dir)).toEqual([]);
  });

  it("removes the temporary file when ffmpeg fails, keeps an existing file, writes no poster", async () => {
    const dir = fresh();
    writeFileSync(join(dir, "a.mp4"), "precious");
    process.env.STANDIN_MODE = "fail";
    await expect(
      exportAnimation(flow, {
        ...base,
        format: "mp4",
        out: join(dir, "a.mp4"),
        poster: join(dir, "p.png"),
      }),
    ).rejects.toThrow(/ffmpeg exited with 1/);
    expect(files(dir)).toEqual(["a.mp4"]);
    expect(readFileSync(join(dir, "a.mp4"), "utf8")).toBe("precious");
  });

  it("names the poster when it cannot be written, after the animation is complete", async () => {
    const dir = fresh();
    await expect(
      exportAnimation(flow, {
        ...base,
        format: "gif",
        out: join(dir, "a.gif"),
        poster: join(dir, "gone", "p.png"),
      }),
    ).rejects.toThrow(/could not write poster/);
    expect(files(dir)).toEqual(["a.gif"]);
  });

  it("png-seq failure removes the frames it wrote and the folder it made", async () => {
    const dir = fresh();
    hook.failRename = (to) => to.endsWith("frame-00002.png");
    await expect(
      exportAnimation(flow, {
        ...base,
        format: "png-seq",
        out: join(dir, "made"),
      }),
    ).rejects.toThrow(/could not write out .*disk full/);
    expect(files(dir)).toEqual([]);
  });

  it("png-seq failure leaves a folder it did not make, and what else is in it", async () => {
    const dir = fresh();
    const seq = join(dir, "mine");
    mkdirSync(seq);
    writeFileSync(join(seq, "notes.txt"), "keep");
    hook.failRename = (to) => to.endsWith("frame-00001.png");
    await expect(
      exportAnimation(flow, { ...base, format: "png-seq", out: seq }),
    ).rejects.toThrow(/disk full/);
    expect(files(seq)).toEqual(["notes.txt"]);
  });

  it("png-seq names out when the folder cannot be made", async () => {
    const dir = fresh();
    writeFileSync(join(dir, "file"), "x");
    await expect(
      exportAnimation(flow, {
        ...base,
        format: "png-seq",
        out: join(dir, "file", "seq"),
      }),
    ).rejects.toThrow(/could not write out/);
  });
});
