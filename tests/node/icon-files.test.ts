import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  parseOpaque,
  parseOutDir,
  writeIconFiles,
} from "../../src/node/icon-files.js";

describe("parseOutDir", () => {
  it("resolves a path and rejects anything that is not a plain directory string", () => {
    expect(parseOutDir("a/b")).toBe(resolve("a/b"));
    for (const bad of ["", "  ", 5, null, undefined, {}])
      expect(() => parseOutDir(bad)).toThrow(/outDir must be a non-empty/);
    expect(() => parseOutDir("a\0b")).toThrow(/NUL/);
    expect(() => parseOutDir("x".repeat(4097))).toThrow(/at most 4096/);
  });
});

describe("parseOpaque", () => {
  it("returns lowercase #rrggbb for an opaque colour and names the parameter otherwise", () => {
    expect(parseOpaque("color", "RGB(255, 0, 0)")).toBe("#ff0000");
    expect(parseOpaque("color", "oklch(52.768% 0.21534 29.097)")).toBe(
      "#ca0303",
    );
    expect(() => parseOpaque("color", "#ff000080")).toThrow(
      /color must be opaque/,
    );
    expect(() => parseOpaque("background", "nope")).toThrow(/background/);
  });
});

describe("writeIconFiles", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dag-vis-icon-files-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the directory, writes each file whole and returns the paths in order", async () => {
    const out = join(dir, "a", "b");
    const written = await writeIconFiles("thing", out, [
      ["two.txt", "2"],
      ["one.bin", Buffer.from([1])],
    ]);
    expect(written).toEqual([join(out, "two.txt"), join(out, "one.bin")]);
    expect(readdirSync(out).sort()).toEqual(["one.bin", "two.txt"]);
    expect(readFileSync(join(out, "one.bin"))).toEqual(Buffer.from([1]));
  });

  it("names the label and the file that failed, keeps the cause, leaves no temp file", async () => {
    mkdirSync(join(dir, "taken")); // a directory where the file must go
    const error = await writeIconFiles("thing", dir, [["taken", "x"]]).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(VisError);
    expect((error as VisError).message).toMatch(
      /^thing could not write taken: /,
    );
    expect((error as VisError).cause).toBeInstanceOf(Error);
    expect(readdirSync(dir)).toEqual(["taken"]);
  });

  it("names the label and the directory when it cannot be created", async () => {
    const file = join(dir, "file");
    writeFileSync(file, "x");
    const error = await writeIconFiles("thing", join(file, "sub"), []).catch(
      (e: unknown) => e,
    );
    expect((error as VisError).message).toMatch(
      /^thing could not create outDir \(/,
    );
    expect((error as VisError).cause).toBeInstanceOf(Error);
  });
});
