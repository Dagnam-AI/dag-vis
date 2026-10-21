import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { run } from "../../src/node/cli.js";
import { PNG_SIG } from "./png-helpers.js";
import { capture, useTempDir } from "./cli-helpers.js";

const sha = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

describe("dag-vis CLI files", () => {
  const tmp = useTempDir();
  const og = (out: string): string[] => ["og", "--title", "Hi", "--out", out];

  describe("--out", () => {
    it("decides svg vs png by extension, case-insensitively; anything else is SVG", async () => {
      for (const [name, png] of [
        ["a.png", true],
        ["b.PNG", true],
        ["c.Png", true],
        ["d.svg", false],
        ["e.SVG", false],
        ["f.txt", false],
        ["g", false],
      ] as const) {
        const path = join(tmp(), name);
        expect(await run(og(path), capture().io)).toBe(0);
        const head = readFileSync(path).subarray(0, 8);
        if (png) expect(head).toEqual(PNG_SIG);
        else expect(head.toString("utf8", 0, 4)).toBe("<svg");
      }
    });

    it("creates missing parent directories", async () => {
      const path = join(tmp(), "a", "b", "c", "og.svg");
      expect(await run(og(path), capture().io)).toBe(0);
      expect(readFileSync(path, "utf8")).toContain("<svg");
    });

    it("overwrites an existing file and leaves no temp file behind", async () => {
      const path = join(tmp(), "og.svg");
      writeFileSync(path, "old");
      expect(await run(og(path), capture().io)).toBe(0);
      expect(readFileSync(path, "utf8")).toContain("<svg");
      expect(readdirSync(tmp())).toEqual(["og.svg"]);
    });

    it("replaces a symlink instead of writing through it", async () => {
      const target = join(tmp(), "target.txt");
      const link = join(tmp(), "link.svg");
      writeFileSync(target, "keep");
      symlinkSync(target, link);
      expect(await run(og(link), capture().io)).toBe(0);
      expect(readFileSync(target, "utf8")).toBe("keep");
      expect(readFileSync(link, "utf8")).toContain("<svg");
    });

    it("replaces a read-only file (the new file gets the default mode)", async () => {
      const path = join(tmp(), "ro.svg");
      writeFileSync(path, "old", { mode: 0o444 });
      expect(await run(og(path), capture().io)).toBe(0);
      expect(readFileSync(path, "utf8")).toContain("<svg");
      expect(statSync(path).mode & 0o200).toBe(0o200);
    });

    it("refuses to write over a directory", async () => {
      const dir = join(tmp(), "out.svg");
      mkdirSync(dir);
      const t = capture();
      expect(await run(og(dir), t.io)).toBe(1);
      expect(t.err.join("")).toContain("it is a directory");
      expect(t.err).toHaveLength(1);
      expect(readdirSync(dir)).toEqual([]);
    });

    it("reports a parent that is a file, with no stray files", async () => {
      const file = join(tmp(), "file.txt");
      writeFileSync(file, "x");
      const t = capture();
      expect(await run(og(join(file, "og.svg")), t.io)).toBe(1);
      expect(t.err.join("")).toMatch(/^dag-vis: could not write .*og\.svg: /);
      expect(readdirSync(tmp())).toEqual(["file.txt"]);
    });

    it("cleans up its temp file when the final rename fails", async () => {
      // A name over NAME_MAX: the (short-named) temp file is written, the rename
      // to the real name fails with ENAMETOOLONG, and the temp file must go.
      const t = capture();
      const path = join(tmp(), `${"n".repeat(300)}.svg`);
      expect(await run(og(path), t.io)).toBe(1);
      expect(t.err.join("")).toContain("could not write");
      expect(t.err).toHaveLength(1);
      expect(readdirSync(tmp())).toEqual([]);
    });
  });

  describe("--spec", () => {
    const spec = (): string => join(tmp(), "spec.json");
    const gradient = (out = join(tmp(), "g.svg")): string[] => [
      "gradient",
      "--spec",
      spec(),
      "--out",
      out,
    ];
    const fails = async (argv: string[], text: string): Promise<void> => {
      const t = capture();
      expect(await run(argv, t.io)).toBe(1);
      expect(t.err).toHaveLength(1);
      expect(t.err[0]).toMatch(/^dag-vis: [^\n]+\n$/);
      expect(t.err[0]).toContain(text);
    };
    const GOOD = JSON.stringify({ kind: "linear", stops: ["#000", "#fff"] });

    it("reports a missing file", async () => {
      await fails(gradient(), "could not read");
    });

    it("rejects a directory, naming it", async () => {
      mkdirSync(spec());
      await fails(gradient(), `${spec()} is not a regular file`);
    });

    it("reads a spec through a symlink to a regular file", async () => {
      const real = join(tmp(), "real.json");
      writeFileSync(real, GOOD);
      symlinkSync(real, spec());
      expect(await run(gradient(), capture().io)).toBe(0);
    });

    it("rejects a spec larger than 1 MiB and accepts one at exactly 1 MiB", async () => {
      const pad = (n: number): string =>
        `{"kind":"linear","stops":["#000","#fff"],"x":"${"a".repeat(n)}"}`;
      const fixed = pad(0).length;
      writeFileSync(spec(), pad(1024 * 1024 - fixed + 1));
      await fails(gradient(), "larger than 1 MiB");
      writeFileSync(spec(), pad(1024 * 1024 - fixed));
      expect(await run(gradient(), capture().io)).toBe(0);
    });

    it("reports invalid JSON and never evaluates it", async () => {
      writeFileSync(spec(), "{not json");
      await fails(gradient(), "invalid JSON");
      // JSON.parse only: code-like content is just a syntax error.
      writeFileSync(spec(), "(() => { throw new Error('ran') })()");
      await fails(gradient(), "invalid JSON");
      writeFileSync(spec(), "");
      await fails(gradient(), "invalid JSON");
    });

    it("says an array is an array, not an object", async () => {
      writeFileSync(spec(), "[]");
      await fails(gradient(), "got an array");
      writeFileSync(spec(), "null");
      await fails(gradient(), "got null");
      writeFileSync(spec(), "5");
      await fails(gradient(), "got 5");
    });

    it.runIf(process.platform !== "win32")(
      "rejects a FIFO without blocking on it",
      async () => {
        execFileSync("mkfifo", [spec()]);
        await fails(gradient(), `${spec()} is not a regular file`);
      },
    );

    it.each(["null", "[]", "5", '"text"', "true"])(
      "rejects a top-level %s: the spec must be a JSON object",
      async (json) => {
        writeFileSync(spec(), json);
        await fails(gradient(), "must contain a JSON object");
        await fails(
          ["pattern", "--spec", spec(), "--out", join(tmp(), "p.svg")],
          "must contain a JSON object",
        );
      },
    );

    it("ignores a leading byte-order mark", async () => {
      writeFileSync(spec(), "\uFEFF" + GOOD);
      expect(await run(gradient(), capture().io)).toBe(0);
    });

    it("hands a hostile-looking spec to the generator, which rejects it by name", async () => {
      writeFileSync(
        spec(),
        JSON.stringify({ __proto__: { kind: "x" }, kind: "constructor" }),
      );
      await fails(gradient(), "unknown gradient kind: constructor");
    });
  });

  describe("determinism", () => {
    it("the same argv gives byte-identical files (svg, png, favicons)", async () => {
      const spec = join(tmp(), "spec.json");
      writeFileSync(spec, JSON.stringify({ kind: "dagMesh", seed: 7 }));
      const commands = (n: string): string[][] => [
        ["og", "--title", "Hello", "--out", join(tmp(), `og${n}.svg`)],
        ["og", "--title", "Hello", "--out", join(tmp(), `og${n}.png`)],
        [
          "background",
          "--w",
          "400",
          "--h",
          "200",
          "--out",
          join(tmp(), `bg${n}.svg`),
        ],
        [
          "background",
          "--w",
          "400",
          "--h",
          "200",
          "--out",
          join(tmp(), `bg${n}.png`),
        ],
        ["pattern", "--spec", spec, "--out", join(tmp(), `p${n}.svg`)],
        ["favicons", "--out", join(tmp(), `icons${n}`)],
      ];
      for (const n of ["1", "2"])
        for (const argv of commands(n))
          expect(await run(argv, capture().io)).toBe(0);
      for (const f of ["og", "bg", "p"])
        for (const ext of f === "p" ? ["svg"] : ["svg", "png"])
          expect(sha(join(tmp(), `${f}1.${ext}`))).toBe(
            sha(join(tmp(), `${f}2.${ext}`)),
          );
      for (const name of readdirSync(join(tmp(), "icons1")))
        expect(sha(join(tmp(), "icons1", name))).toBe(
          sha(join(tmp(), "icons2", name)),
        );
    });
  });
});
