import {
  chmodSync,
  existsSync,
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

import { VisError } from "../../src/core/index.js";
import { fieldPresets } from "../../src/field/index.js";
import { USAGE, run } from "../../src/node/cli.js";
import { formatFor, loadSpec } from "../../src/node/cli-export.js";
import { capture, useTempDir } from "./cli-helpers.js";
import { PNG_SIG, dims } from "./png-helpers.js";

// A stand-in for ffmpeg (as in export.test.ts): records its arguments and the
// bytes it was fed into the output file, the last argument.
const STANDIN = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-version") process.exit(0);
let bytes = 0;
process.stdin.on("data", (d) => { bytes += d.length; });
process.stdin.on("end", () => {
  fs.writeFileSync(args[args.length - 1], JSON.stringify({ args, bytes }));
});
`;

const NAMED_ERROR = /^dag-vis: [^\n]+\n$/;
const GRADIENT = { kind: "linear", angle: 90, stops: ["#000000", "#ffffff"] };
const work = mkdtempSync(join(tmpdir(), "dag-vis-cli-export-"));
const previous = process.env.DAG_VIS_FFMPEG;
beforeAll(() => {
  const bin = join(work, "ffmpeg-standin");
  writeFileSync(bin, STANDIN);
  chmodSync(bin, 0o755);
  process.env.DAG_VIS_FFMPEG = bin;
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => {
  if (previous === undefined) delete process.env.DAG_VIS_FFMPEG;
  else process.env.DAG_VIS_FFMPEG = previous;
  rmSync(work, { recursive: true, force: true });
});

const recorded = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as { args: string[]; bytes: number };

/** Runs the CLI and returns its exit code with what it wrote. */
async function cli(...argv: string[]) {
  const t = capture();
  const code = await run(argv, t.io);
  return { code, out: t.out.join(""), err: t.err.join("") };
}

/** A failed run: exit 1, nothing on stdout, exactly one `dag-vis: ...` line on stderr. */
async function fails(argv: string[], message: RegExp | string) {
  const r = await cli(...argv);
  expect(r.code).toBe(1);
  expect(r.out).toBe("");
  expect(r.err).toMatch(NAMED_ERROR);
  expect(r.err).toMatch(message);
}

describe("loadSpec", () => {
  const tmp = useTempDir();

  it("returns a preset by name", async () => {
    expect(await loadSpec("lunar")).toBe(fieldPresets.lunar);
  });

  it("does not take inherited names for presets", async () => {
    for (const name of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ])
      await expect(loadSpec(name)).rejects.toThrow(/unknown preset/);
  });

  it("names the target in the unknown-preset error without echoing a long one whole", async () => {
    await expect(loadSpec("lunr")).rejects.toThrow(
      'unknown preset "lunr" (run `dag-vis presets`) and not a .json file',
    );
    const error = await loadSpec("x".repeat(5000)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisError);
    expect((error as Error).message.length).toBeLessThan(300);
  });

  it("reads a JSON spec file (any case of the extension)", async () => {
    const file = join(tmp(), "s.JSON");
    writeFileSync(file, JSON.stringify(GRADIENT));
    expect(await loadSpec(file)).toEqual(GRADIENT);
  });

  it("reports an unreadable, oversized, invalid or non-object file as a VisError naming it", async () => {
    const missing = join(tmp(), "missing.json");
    await expect(loadSpec(missing)).rejects.toThrow(
      new RegExp(`could not read ${missing}`),
    );
    const bad = join(tmp(), "bad.json");
    writeFileSync(bad, "{");
    await expect(loadSpec(bad)).rejects.toThrow(
      new RegExp(`invalid JSON in ${bad}`),
    );
    const big = join(tmp(), "big.json");
    writeFileSync(big, " ".repeat(1024 * 1024 + 1));
    await expect(loadSpec(big)).rejects.toThrow(/larger than 1 MiB/);
    const list = join(tmp(), "list.json");
    writeFileSync(list, "[1]");
    await expect(loadSpec(list)).rejects.toThrow(/must contain a JSON object/);
    await expect(loadSpec(tmp() + ".json")).rejects.toThrow(VisError);
  });
});

describe("formatFor", () => {
  it("takes the format from the extension in any case; jpg is jpeg", () => {
    expect(formatFor("a.png")).toEqual({ animated: false, format: "png" });
    expect(formatFor("a.JPG")).toEqual({ animated: false, format: "jpeg" });
    expect(formatFor("dir.v2/a.JPEG").format).toBe("jpeg");
    expect(formatFor("a.mp4")).toEqual({ animated: true, format: "mp4" });
  });

  it("lets --format win and accepts png-seq only that way", () => {
    expect(formatFor("a.mp4", "WEBM")).toEqual({
      animated: true,
      format: "webm",
    });
    expect(formatFor("frames", "png-seq")).toEqual({
      animated: true,
      format: "png-seq",
    });
    expect(formatFor("a.png", "jpg").format).toBe("jpeg");
  });

  it("refuses a missing, empty or unknown format, listing the valid ones", () => {
    expect(() => formatFor("a")).toThrow(/cannot infer.*--format/);
    expect(() => formatFor("a.")).toThrow(/cannot infer/);
    expect(() => formatFor("a.png", "")).toThrow("--format must not be empty");
    expect(() => formatFor("a.bmp")).toThrow(
      /unknown format "bmp".*--out extension.*use png\|svg\|jpeg\|webp\|avif\|jpg\|gif\|apng\|mp4\|webm\|png-seq/,
    );
    expect(() => formatFor("a.png", "bmp")).toThrow(/^(?!.*extension).*bmp/);
    for (const name of ["constructor", "__proto__", "toString"]) {
      expect(() => formatFor(`a.${name}`)).toThrow(/unknown format/);
      expect(() => formatFor("a.png", name)).toThrow(/unknown format/);
    }
  });
});

describe("dag-vis export", () => {
  const tmp = useTempDir();
  const gradientFile = (): string => {
    const file = join(tmp(), "gradient.json");
    writeFileSync(file, JSON.stringify(GRADIENT));
    return file;
  };

  it("writes a PNG for a preset and reports the absolute path", async () => {
    const out = join(tmp(), "a.png");
    const r = await cli(
      "export",
      "lunar",
      "--out",
      out,
      "--w",
      "16",
      "--h",
      "9",
    );
    expect(r).toEqual({ code: 0, out: `wrote ${out}\n`, err: "" });
    const png = readFileSync(out);
    expect(png.subarray(0, 8)).toEqual(PNG_SIG);
    expect(dims(png)).toEqual([16, 9]);
  });

  it("resolves --out against the working directory, including a name starting with a dash", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tmp());
    const r = await cli(
      "export",
      "lunar",
      "--out",
      "-x.png",
      "--w",
      "8",
      "--h",
      "4",
    );
    expect(r.out).toBe(`wrote ${join(tmp(), "-x.png")}\n`);
    expect(readdirSync(tmp())).toEqual(["-x.png"]);
  });

  it("defaults to the og size and takes --size names", async () => {
    const spec = gradientFile();
    const svg = (name: string) => readFileSync(join(tmp(), name), "utf8");
    await cli("export", spec, "--out", join(tmp(), "og.svg"));
    expect(svg("og.svg")).toContain('width="1200" height="630"');
    await cli(
      "export",
      spec,
      "--out",
      join(tmp(), "sq.svg"),
      "--size",
      "square",
    );
    expect(svg("sq.svg")).toContain('width="1080" height="1080"');
    await cli(
      "export",
      spec,
      "--out",
      join(tmp(), "wh.svg"),
      "--w=300",
      "--h=200",
    );
    expect(svg("wh.svg")).toContain('width="300" height="200"');
  });

  it("refuses a bad size at the boundary, naming the flag", async () => {
    const base = ["export", "lunar", "--out", join(tmp(), "x.png")];
    await fails(
      [...base, "--size", "giant"],
      /--size must be one of og\|square.*"giant"/,
    );
    await fails([...base, "--size", "constructor"], /--size must be one of/);
    await fails(
      [...base, "--size", "og", "--w", "9"],
      "--size cannot be combined with --w or --h",
    );
    await fails([...base, "--w", "9"], "--w and --h must be given together");
    await fails([...base, "--h", "9"], "--w and --h must be given together");
    await fails(
      [...base, "--w", "abc", "--h", "9"],
      /--w must be a plain decimal number/,
    );
    await fails(
      [...base, "--w", "1.5", "--h", "9"],
      /--w must be a whole number of pixels, got "1.5"/,
    );
    await fails(
      [...base, "--w", "0", "--h", "9"],
      /width must be an integer in 1\.\.16384/,
    );
    await fails(
      [...base, "--w", "99999", "--h", "9"],
      /width must be an integer in 1\.\.16384/,
    );
    expect(readdirSync(tmp())).toEqual([]);
  });

  it("checks numbers as plain decimals and lets the exporters range-check them", async () => {
    const out = join(tmp(), "x.gif");
    const base = ["export", "lunar", "--w", "8", "--h", "8", "--out", out];
    await fails(
      [...base, "--fps", "1e1"],
      /--fps must be a plain decimal number/,
    );
    await fails(
      [...base, "--fps", "-5"],
      /--fps must be a plain decimal number/,
    );
    await fails([...base, "--fps", "0"], /fps/);
    await fails([...base, "--duration", "61"], /duration/);
    await fails(
      [...base, "--duration", ""],
      /--duration must be a plain decimal number/,
    );
    await fails([...base, "--quality", "2"], /quality/);
    await fails(
      [...base, "--quality", "0x1"],
      /--quality must be a plain decimal number/,
    );
    expect(readdirSync(tmp())).toEqual([]);
  });

  it("writes a GIF with the requested frames and prints the poster too", async () => {
    const out = join(tmp(), "a.gif");
    const poster = join(tmp(), "p.png");
    const r = await cli(
      "export",
      "fluted-ember",
      "--out",
      out,
      "--w",
      "16",
      "--h",
      "9",
      "--fps",
      "2",
      "--duration",
      "1",
      "--loop",
      "--poster",
      poster,
    );
    expect(r).toEqual({
      code: 0,
      out: `wrote ${out}\nwrote ${poster}\n`,
      err: "",
    });
    expect(readFileSync(out).subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(readFileSync(poster).subarray(0, 8)).toEqual(PNG_SIG);
  });

  it("writes a png sequence into the folder named by --out", async () => {
    const out = join(tmp(), "frames");
    const r = await cli(
      "export",
      "lunar",
      "--format",
      "png-seq",
      "--out",
      out,
      "--w",
      "8",
      "--h",
      "4",
      "--fps",
      "2",
      "--duration",
      "1",
    );
    expect(r.code).toBe(0);
    expect(readdirSync(out)).toEqual(["frame-00000.png", "frame-00001.png"]);
  });

  it("sends 30 fps for 6 s to ffmpeg by default, and the frames asked for otherwise", async () => {
    const out = join(tmp(), "a.mp4");
    const base = ["export", "lunar", "--w", "8", "--h", "4", "--out", out];
    expect((await cli(...base)).code).toBe(0);
    const frame = 8 * 4 * 4;
    expect(recorded(out).bytes).toBe(180 * frame);
    expect(recorded(out).args).toContain("30");
    await cli(...base, "--fps", "10", "--duration", "2", "--quality", "0.3");
    expect(recorded(out).bytes).toBe(20 * frame);
    expect(recorded(out).args).toContain("10");
  });

  it("passes --alpha to a webm export and refuses it for a GIF", async () => {
    const webm = join(tmp(), "a.webm");
    const base = ["--w", "8", "--h", "4", "--fps", "2", "--duration", "1"];
    const plain = await cli("export", "lunar", "--out", webm, ...base);
    expect(plain.code).toBe(0);
    const flat = recorded(webm).args.join(" ");
    await cli("export", "lunar", "--out", webm, ...base, "--alpha");
    expect(recorded(webm).args.join(" ")).not.toBe(flat);
    await fails(
      ["export", "lunar", "--out", join(tmp(), "a.gif"), ...base, "--alpha"],
      /alpha is not supported by gif/,
    );
  });

  it("encodes a still through ffmpeg for jpg and a looping still lands on the loop frame", async () => {
    const jpg = join(tmp(), "a.jpg");
    expect(
      (
        await cli(
          "export",
          "lunar",
          "--out",
          jpg,
          "--w",
          "8",
          "--h",
          "4",
          "--quality",
          "0.5",
        )
      ).code,
    ).toBe(0);
    expect(recorded(jpg).bytes).toBe(8 * 4 * 4);
    const png = (name: string, ...rest: string[]) => {
      const out = join(tmp(), name);
      return cli(
        "export",
        "lunar",
        "--out",
        out,
        "--w",
        "16",
        "--h",
        "9",
        ...rest,
      ).then(() => readFileSync(out));
    };
    const start = await png("t0.png", "--loop", "--duration", "4");
    expect(
      (await png("t4.png", "--loop", "--duration", "4", "--t", "4")).equals(
        start,
      ),
    ).toBe(true);
    expect(
      (await png("t1.png", "--loop", "--duration", "4", "--t", "1")).equals(
        start,
      ),
    ).toBe(false);
    expect((await png("n4.png", "--t", "4")).equals(await png("n0.png"))).toBe(
      false,
    );
  });

  it("loops a still over 6 seconds when --loop has no --duration", async () => {
    const png = async (name: string, ...rest: string[]) => {
      const out = join(tmp(), name);
      await cli(
        "export",
        "lunar",
        "--out",
        out,
        "--w",
        "8",
        "--h",
        "4",
        ...rest,
      );
      return readFileSync(out);
    };
    const start = await png("a.png", "--loop");
    expect((await png("b.png", "--loop", "--t", "6")).equals(start)).toBe(true);
    expect((await png("c.png", "--loop", "--t", "1.5")).equals(start)).toBe(
      false,
    );
  });

  it("refuses an option that does not apply to the chosen format", async () => {
    const still = ["export", "lunar", "--out", join(tmp(), "a.png")];
    await fails(
      [...still, "--fps", "5"],
      "--fps applies to animations, not png",
    );
    await fails(
      [...still, "--alpha"],
      "--alpha applies to animations, not png",
    );
    await fails(
      [...still, "--poster", "p.png"],
      "--poster applies to animations, not png",
    );
    await fails(
      [...still, "--duration", "2"],
      /--duration applies to png only with --loop/,
    );
    const moving = ["export", "lunar", "--out", join(tmp(), "a.gif")];
    await fails([...moving, "--t", "1"], /--t applies to stills, not gif/);
    expect(readdirSync(tmp())).toEqual([]);
  });

  it("gives usage errors as one line: missing target or --out, stray or repeated arguments", async () => {
    await fails(
      ["export", "--out", "x.png"],
      /^dag-vis: usage: dag-vis export <preset\|spec\.json> --out FILE/,
    );
    await fails(["export", "lunar"], "--out is required");
    await fails(["export", "lunar", "--out", ""], "--out must not be empty");
    await fails(
      ["export", "lunar", "rose", "--out", "x.png"],
      'unexpected argument: "rose"',
    );
    await fails(
      ["export", "lunar", "--out", "a.png", "--out", "b.png"],
      "duplicate option: --out",
    );
    await fails(
      ["export", "lunar", "--loop", "--loop", "--out", "a.png"],
      "duplicate option: --loop",
    );
    await fails(
      ["export", "lunar", "--loop=1", "--out", "a.png"],
      "--loop takes no value",
    );
    await fails(
      ["export", "lunar", "--bogus", "--out", "a.png"],
      'unknown option: "--bogus"',
    );
    await fails(["export", "lunar", "--out"], "missing value for --out");
    await fails(["export", "lunr", "--out", "a.png"], /unknown preset "lunr"/);
    await fails(["export", "lunar", "--out", "a.bmp"], /unknown format "bmp"/);
    await fails(
      ["export", "lunar", "--out", "frames"],
      /cannot infer the format/,
    );
    await fails(
      ["export", join(tmp(), "none.json"), "--out", "a.png"],
      /could not read/,
    );
  });

  it("surfaces the exporters' own errors on the usual path, never a stack", async () => {
    const odd = join(tmp(), "odd.mp4");
    await fails(
      ["export", "lunar", "--out", odd, "--w", "7", "--h", "4"],
      /width|even/,
    );
    const bad = join(tmp(), "bad.json");
    writeFileSync(bad, JSON.stringify({ kind: "flow", palette: ["#000"] }));
    await fails(
      ["export", bad, "--out", join(tmp(), "x.png"), "--w", "8", "--h", "4"],
      /palette/,
    );
    writeFileSync(bad, JSON.stringify({ kind: "nope" }));
    await fails(
      ["export", bad, "--out", join(tmp(), "x.png"), "--w", "8", "--h", "4"],
      /nope|kind/,
    );
    await fails(
      [
        "export",
        gradientFile(),
        "--out",
        join(tmp(), "g.gif"),
        "--w",
        "8",
        "--h",
        "4",
      ],
      /static/,
    );
    // the folder of --out is not created by export
    await fails(
      [
        "export",
        "lunar",
        "--out",
        join(tmp(), "missing", "a.png"),
        "--w",
        "8",
        "--h",
        "4",
      ],
      /could not write out/,
    );
    expect(existsSync(join(tmp(), "missing"))).toBe(false);
  });

  it("reports a missing ffmpeg as one line", async () => {
    vi.stubEnv("DAG_VIS_FFMPEG", join(tmp(), "no-such-ffmpeg"));
    await fails(
      [
        "export",
        "lunar",
        "--out",
        join(tmp(), "a.mp4"),
        "--w",
        "8",
        "--h",
        "4",
      ],
      /ffmpeg not found/,
    );
    vi.unstubAllEnvs();
  });

  it("sends a GIF speed warning to the injected stderr and still succeeds", async () => {
    const stderr = vi.spyOn(process.stderr, "write");
    const consoleWarn = vi.spyOn(console, "warn");
    const r = await cli(
      "export",
      "lunar",
      "--out",
      join(tmp(), "fast.gif"),
      "--w",
      "8",
      "--h",
      "4",
      "--fps",
      "60",
      "--duration",
      "0.1",
    );
    expect(r.code).toBe(0);
    expect(r.err).toMatch(
      /^dag-vis: warning: GIF delays are whole centiseconds[^\n]*\n$/,
    );
    expect(r.out).toBe(`wrote ${join(tmp(), "fast.gif")}\n`);
    expect(stderr).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("treats a flag as consuming nothing when looking for help", async () => {
    for (const argv of [
      ["export", "--help"],
      ["export", "lunar", "--loop", "-h"],
      ["export", "lunar", "--alpha", "--out", "a.webm", "-h"],
    ])
      expect(await cli(...argv)).toEqual({ code: 0, out: USAGE, err: "" });
    // an option still consumes its value, so -h there is a value
    await fails(["og", "--title", "--loop", "-h"], "missing value for --title");
  });

  it("leaves the older commands as they were: no flags, no positionals", async () => {
    await fails(
      ["og", "--title", "T", "--loop", "--out", "a.svg"],
      'unknown option: "--loop"',
    );
    await fails(
      ["og", "stray", "--title", "T", "--out", "a.svg"],
      'unexpected argument: "stray"',
    );
    await fails(
      ["favicons", "--out", tmp(), "--alpha"],
      'unknown option: "--alpha"',
    );
  });
});

describe("dag-vis presets", () => {
  it("lists every preset with its kind in sheet order, in one deterministic block", async () => {
    const r = await cli("presets");
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    const lines = r.out.split("\n");
    expect(lines.pop()).toBe("");
    expect(lines).toEqual(
      Object.entries(fieldPresets).map(
        ([name, spec]) => `${name}\t${spec.kind}`,
      ),
    );
    expect(lines).toHaveLength(19);
    expect(lines[0]).toBe("violet-dusk\tflow");
    expect(lines.at(-1)).toBe("fluted-ember\tfluted");
    expect(await cli("presets")).toEqual(r);
  });

  it("takes no arguments", async () => {
    await fails(["presets", "lunar"], 'unexpected argument: "lunar"');
    await fails(["presets", "--out", "x"], 'unknown option: "--out"');
  });
});

describe("dag-vis sheet", () => {
  const tmp = useTempDir();

  it("writes the contact sheet as a PNG at the size the options give", async () => {
    const out = join(tmp(), "nested", "dir", "sheet.png");
    const r = await cli(
      "sheet",
      "--out",
      out,
      "--tile",
      "8x4",
      "--gap",
      "1",
      "--columns",
      "5",
    );
    expect(r).toEqual({ code: 0, out: `wrote ${out}\n`, err: "" });
    const png = readFileSync(out);
    expect(png.subarray(0, 8)).toEqual(PNG_SIG);
    // 19 presets in 5 columns: 4 rows
    expect(dims(png)).toEqual([5 * 8 + 6, 4 * 4 + 5]);
  });

  it(
    "draws 300 x 170 tiles, four across, with a 32 pixel gap by default",
    { timeout: 60_000 },
    async () => {
      const out = join(tmp(), "default.png");
      expect((await cli("sheet", "--out", out)).code).toBe(0);
      expect(dims(readFileSync(out))).toEqual([
        4 * 300 + 5 * 32,
        5 * 170 + 6 * 32,
      ]);
    },
  );

  it("reads --tile, --gap and --columns as plain digits", async () => {
    const out = join(tmp(), "s.png");
    const base = ["sheet", "--out", out];
    await fails(
      [...base, "--tile", "40"],
      /--tile must look like 300x170, got "40"/,
    );
    await fails([...base, "--tile", "40x"], /--tile must look like/);
    await fails([...base, "--tile", "-4x4"], /--tile must look like/);
    await fails([...base, "--tile", "4X4"], /--tile must look like/);
    await fails([...base, "--tile", "0x4"], /tile\.width/);
    await fails([...base, "--tile", "8x4", "--gap", "1.5"], /gap/);
    await fails(
      [...base, "--tile", "8x4", "--gap", "x"],
      /--gap must be a plain decimal number/,
    );
    await fails([...base, "--tile", "8x4", "--columns", "0"], /columns/);
    await fails(
      [...base, "--tile", "8x4", "--columns", "1e1"],
      /--columns must be a plain decimal number/,
    );
    expect(existsSync(out)).toBe(false);
  });

  it("needs a .png --out and takes nothing else", async () => {
    await fails(["sheet"], "--out is required");
    await fails(
      ["sheet", "--out", join(tmp(), "s.jpg")],
      /--out must end in \.png/,
    );
    await fails(
      ["sheet", "--out", join(tmp(), "s.png"), "lunar"],
      'unexpected argument: "lunar"',
    );
    await fails(
      ["sheet", "--out", join(tmp(), "s.png"), "--t", "1"],
      'unknown option: "--t"',
    );
    expect(readdirSync(tmp())).toEqual([]);
    mkdirSync(join(tmp(), "d.png"));
    await fails(
      ["sheet", "--out", join(tmp(), "d.png"), "--tile", "8x4"],
      /is a directory/,
    );
  });
});

describe("usage text", () => {
  it("documents the three commands and the rules of export", () => {
    for (const line of [
      "dag-vis export <preset|spec.json> --out FILE",
      "dag-vis presets",
      "dag-vis sheet --out f.png",
    ])
      expect(USAGE).toContain(line);
    for (const text of [
      "png-seq",
      "DAG_VIS_FFMPEG",
      "--poster",
      "does not apply",
      "does not create the folder",
    ])
      expect(USAGE).toContain(text);
  });

  it("names no internal project", () => {
    expect(USAGE).not.toMatch(/\b(mvp-|info\/|task|plan)\b/i);
  });
});
