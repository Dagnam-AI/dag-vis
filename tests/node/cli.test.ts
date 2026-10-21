import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { USAGE, run } from "../../src/node/cli.js";
import type { CliIo } from "../../src/node/cli.js";
import { FAVICON_FILES } from "../../src/node/favicons.js";
import { capture, useTempDir } from "./cli-helpers.js";
import { PNG_SIG, dims } from "./png-helpers.js";

const NAMED_ERROR = /^dag-vis: [^\n]+\n$/;

describe("dag-vis CLI", () => {
  const tmp = useTempDir();

  it("prints usage on help (0) and on no command (1)", async () => {
    for (const argv of [["--help"], ["-h"], ["help"], ["og", "--help"]]) {
      const h = capture();
      expect(await run(argv, h.io)).toBe(0);
      expect(h.out.join("")).toBe(USAGE);
      expect(h.err).toEqual([]);
    }
    const none = capture();
    expect(await run([], none.io)).toBe(1);
    expect(none.err.join("")).toBe(USAGE);
    expect(none.out).toEqual([]);
  });

  it("documents the PNG rules in the usage text", () => {
    expect(USAGE).toContain("data: URI");
    expect(USAGE).toContain("@resvg/resvg-js");
    expect(USAGE).toContain("--name=value");
  });

  it("og writes SVG or PNG by extension and reports the path", async () => {
    const svgPath = join(tmp(), "og.svg");
    const pngPath = join(tmp(), "og.png");
    const t = capture();
    expect(
      await run(
        ["og", "--title", "Hello", "--subtitle", "World", "--out", svgPath],
        t.io,
      ),
    ).toBe(0);
    expect(readFileSync(svgPath, "utf8")).toContain(">Hello<");
    expect(t.out.join("")).toBe(`wrote ${svgPath}\n`);
    expect(
      await run(
        [
          "og",
          "--title",
          "Hello",
          "--theme",
          "light",
          "--w",
          "600",
          "--h",
          "315",
          `--out=${pngPath}`,
        ],
        t.io,
      ),
    ).toBe(0);
    const png = readFileSync(pngPath);
    expect(png.subarray(0, 8)).toEqual(PNG_SIG);
    expect(dims(png)).toEqual([600, 315]);
    expect(t.err).toEqual([]);
  });

  it("og passes eyebrow and footer through", async () => {
    const p = join(tmp(), "og.svg");
    const argv = ["og", "--title", "T", "--eyebrow", "Launch", "--footer"];
    expect(await run([...argv, "dagnam.ai", "--out", p], capture().io)).toBe(0);
    const svg = readFileSync(p, "utf8");
    expect(svg).toContain(">LAUNCH<");
    expect(svg).toContain(">dagnam.ai<");
  });

  it("background honours focus, scale and palette", async () => {
    const p = join(tmp(), "bg.svg");
    expect(
      await run(
        [
          "background",
          "--w",
          "300",
          "--h",
          "100",
          "--focus",
          "0.5,0.5",
          "--scale",
          "1",
          "--palette",
          "ocean",
          "--out",
          p,
        ],
        capture().io,
      ),
    ).toBe(0);
    expect(readFileSync(p, "utf8")).toContain('stop-color="#10abba"');
    const plain = join(tmp(), "plain.svg");
    expect(
      await run(
        ["background", "--w", "300", "--h", "100", "--out", plain],
        capture().io,
      ),
    ).toBe(0);
    expect(readFileSync(plain, "utf8")).toContain('width="300" height="100"');
  });

  it("gradient and pattern read a JSON spec", async () => {
    const spec = join(tmp(), "spec.json");
    writeFileSync(
      spec,
      JSON.stringify({ kind: "linear", angle: 90, stops: ["#000", "#fff"] }),
    );
    const g = join(tmp(), "g.svg");
    expect(
      await run(
        ["gradient", "--spec", spec, "--w", "50", "--h", "20", "--out", g],
        capture().io,
      ),
    ).toBe(0);
    expect(readFileSync(g, "utf8")).toContain('width="50" height="20"');
    const own = join(tmp(), "own.svg");
    expect(
      await run(["gradient", "--spec", spec, "--out", own], capture().io),
    ).toBe(0);
    expect(readFileSync(own, "utf8")).toContain("<svg");
    writeFileSync(spec, JSON.stringify({ kind: "dots", spacing: 10 }));
    const p = join(tmp(), "p.svg");
    expect(
      await run(["pattern", "--spec", spec, "--out", p], capture().io),
    ).toBe(0);
    expect(readFileSync(p, "utf8")).toContain("<circle");
    const pPng = join(tmp(), "p.png");
    expect(
      await run(["pattern", "--spec", spec, "--out", pPng], capture().io),
    ).toBe(0);
    expect(readFileSync(pPng).subarray(0, 8)).toEqual(PNG_SIG);
  });

  it("gradient renders a data: URI overlay image to PNG", async () => {
    const spec = join(tmp(), "spec.json");
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    writeFileSync(
      spec,
      JSON.stringify({
        kind: "linear",
        stops: ["#000", "#fff"],
        overlay: { image: pixel },
      }),
    );
    const out = join(tmp(), "g.png");
    const t = capture();
    expect(
      await run(
        ["gradient", "--spec", spec, "--w", "40", "--h", "30", "--out", out],
        t.io,
      ),
    ).toBe(0);
    expect(dims(readFileSync(out))).toEqual([40, 30]);
  });

  it("gradient with a non-data: overlay image fails for PNG with renderPng's reason, and still writes SVG", async () => {
    const spec = join(tmp(), "spec.json");
    writeFileSync(
      spec,
      JSON.stringify({
        kind: "linear",
        stops: ["#000", "#fff"],
        overlay: { image: "overlay.png" },
      }),
    );
    const png = join(tmp(), "g.png");
    const t = capture();
    expect(await run(["gradient", "--spec", spec, "--out", png], t.io)).toBe(1);
    const message = t.err.join("");
    expect(message).toMatch(NAMED_ERROR);
    expect(message).toContain("cannot render PNG");
    expect(message).toContain("data: URIs");
    expect(readdirSync(tmp())).toEqual(["spec.json"]);
    const svg = join(tmp(), "g.svg");
    expect(
      await run(["gradient", "--spec", spec, "--out", svg], capture().io),
    ).toBe(0);
    expect(readFileSync(svg, "utf8")).toContain("overlay.png");
  });

  it("favicons writes the set into a directory", async () => {
    const out = join(tmp(), "icons");
    const t = capture();
    expect(
      await run(
        [
          "favicons",
          "--out",
          out,
          "--color",
          "#ffffff",
          "--background",
          "#000",
        ],
        t.io,
      ),
    ).toBe(0);
    expect(readFileSync(join(out, "favicon.svg"), "utf8")).toContain(
      'fill="#ffffff"',
    );
    expect(t.out.join("")).toBe(
      FAVICON_FILES.map((f) => `wrote ${join(out, f)}\n`).join(""),
    );
    const defaults = join(tmp(), "defaults");
    expect(await run(["favicons", "--out", defaults], capture().io)).toBe(0);
    expect(readdirSync(defaults).sort()).toEqual([...FAVICON_FILES].sort());
  });

  // [argv, text the one-line stderr message contains]
  it.each([
    [["nope"], "unknown command: nope"],
    [["constructor"], "unknown command: constructor"],
    [["__proto__"], "unknown command: __proto__"],
    [["toString", "--out", "x"], "unknown command: toString"],
    [["og", "--out", "x.svg"], "--title is required"],
    [["og", "--title", "", "--out", "x.svg"], "--title must not be empty"],
    [["og", "--title", "t"], "--out is required"],
    [["og", "--title", "t", "--out", ""], "--out must not be empty"],
    [
      ["og", "--title", "t", "--bogus", "1", "--out", "x.svg"],
      "unknown option",
    ],
    [
      ["og", "--title", "t", "--title", "u", "--out", "x.svg"],
      "duplicate option: --title",
    ],
    [["og", "--title", "t", "--out"], "missing value for --out"],
    [["og", "--title", "--out", "x.svg"], "missing value for --title"],
    [
      ["og", "--title", "t", "--out", "x.svg", "extra"],
      'unexpected argument: "extra"',
    ],
    [
      ["og", "--title", "t", "--w", "abc", "--out", "x.svg"],
      "--w must be a plain decimal",
    ],
    [
      ["og", "--title", "t", "--w", "1e3x", "--out", "x.svg"],
      "--w must be a plain decimal",
    ],
    [
      ["og", "--title", "t", "--w", "", "--out", "x.svg"],
      "--w must be a plain decimal",
    ],
    [
      ["og", "--title", "t", "--w", "0x10", "--out", "x.svg"],
      "--w must be a plain decimal",
    ],
    [
      ["og", "--title", "t", "--w", "5", "--out", "x.svg"],
      "width must be a number in 16..16384",
    ],
    [
      ["og", "--title", "t", "--h", "99999", "--out", "x.svg"],
      "height must be a number in 16..16384",
    ],
    [
      ["og", "--title", "t", "--theme", "blue", "--out", "x.svg"],
      "--theme must be dark or light",
    ],
    [["background", "--h", "10", "--out", "x.svg"], "--w is required"],
    [["background", "--w", "10", "--out", "x.svg"], "--h is required"],
    [
      [
        "background",
        "--w",
        "10",
        "--h",
        "10",
        "--focus",
        "1",
        "--out",
        "x.svg",
      ],
      "--focus must be x,y",
    ],
    [
      [
        "background",
        "--w",
        "10",
        "--h",
        "10",
        "--focus",
        "2,0",
        "--out",
        "x.svg",
      ],
      "focus",
    ],
    [
      [
        "background",
        "--w",
        "10",
        "--h",
        "10",
        "--scale",
        "1e3x",
        "--out",
        "x.svg",
      ],
      "--scale must be a plain decimal",
    ],
    [
      [
        "background",
        "--w",
        "10",
        "--h",
        "10",
        "--scale",
        "999",
        "--out",
        "x.svg",
      ],
      "scale",
    ],
    [
      [
        "background",
        "--w",
        "10",
        "--h",
        "10",
        "--palette",
        "neon",
        "--out",
        "x.svg",
      ],
      "unknown palette: neon",
    ],
    [["gradient", "--out", "x.svg"], "--spec is required"],
    [["gradient", "--spec", "s.json"], "--out is required"],
    [
      ["gradient", "--spec", "s.json", "--w", "10", "--out", "x.svg"],
      "--w and --h must be given together",
    ],
    [
      ["gradient", "--spec", "s.json", "--h", "10", "--out", "x.svg"],
      "--w and --h must be given together",
    ],
    [["pattern", "--out", "x.svg"], "--spec is required"],
    [
      ["pattern", "--spec", "s.json", "--w", "5", "--out", "x.svg"],
      'unknown option: "--w"',
    ],
    [["favicons"], "--out is required"],
    [["favicons", "--out", "d", "--w", "5"], 'unknown option: "--w"'],
  ])(
    "fails with exit 1 and a one-line message for %j",
    async (argv, message) => {
      const t = capture();
      // Table paths are placeholders resolved under the temp dir, so even a case
      // that wrongly succeeded could not write into the repo or the cwd.
      const real = argv.map((a) =>
        ["x.svg", "s.json", "d"].includes(a) ? join(tmp(), a) : a,
      );
      expect(await run(real, t.io)).toBe(1);
      const text = t.err.join("");
      expect(text).toMatch(NAMED_ERROR);
      expect(text).toContain(message);
      expect(t.out).toEqual([]);
      expect(readdirSync(tmp())).toEqual([]);
    },
  );

  it("reports a generator's VisError, naming the parameter", async () => {
    const spec = join(tmp(), "spec.json");
    for (const [json, message, command] of [
      [{ kind: "plaid" }, "unknown gradient kind: plaid", "gradient"],
      [
        { kind: "linear", stops: ["#000", "#fff"], overlay: {} },
        "overlay.image must be a string",
        "gradient",
      ],
      [
        { kind: "mesh", points: [{ at: [0.5, 0.5], color: "#fff" }] },
        "mesh base must be a colour string",
        "gradient",
      ],
      [
        { kind: "radial", stops: ["#000", "#fff"], at: {} },
        "radial `at` must be [x, y]",
        "gradient",
      ],
      [{ kind: "dots", spacing: -1 }, "spacing must be", "pattern"],
      [{ kind: "nope" }, "kind", "pattern"],
    ] as const) {
      writeFileSync(spec, JSON.stringify(json));
      const t = capture();
      expect(
        await run(
          [command, "--spec", spec, "--out", join(tmp(), "x.svg")],
          t.io,
        ),
      ).toBe(1);
      expect(t.err.join("")).toMatch(NAMED_ERROR);
      expect(t.err.join("")).toContain(message);
    }
    expect(readdirSync(tmp())).toEqual(["spec.json"]);
  });

  it("favicons failures surface as one line (outDir is a file)", async () => {
    const file = join(tmp(), "file.txt");
    writeFileSync(file, "x");
    const t = capture();
    expect(await run(["favicons", "--out", file], t.io)).toBe(1);
    expect(t.err.join("")).toMatch(NAMED_ERROR);
    expect(t.err.join("")).toContain("favicons could not");
  });

  it("an unexpected error is one line 'unexpected error: ...', exit 1, no stack", async () => {
    const out = join(tmp(), "x.svg");
    const t = capture();
    const failing: CliIo = {
      stdout: () => {
        throw new Error("stdout closed\nsecond line");
      },
      stderr: (s) => t.err.push(s),
    };
    expect(await run(["og", "--title", "t", "--out", out], failing)).toBe(1);
    expect(t.err).toEqual([
      "dag-vis: unexpected error: stdout closed second line\n",
    ]);
    const odd: CliIo = {
      stdout: () => {
        throw "disk on fire" as unknown as Error;
      },
      stderr: (s) => t.err.push(s),
    };
    expect(await run(["og", "--title", "t", "--out", out], odd)).toBe(1);
    expect(t.err[1]).toBe("dag-vis: unexpected error: disk on fire\n");
  });
});
