import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  numeric,
  readSpec,
  required,
  requiredNumeric,
  writeOut,
} from "../../src/node/cli-support.js";
import { useTempDir } from "./cli-helpers.js";

const opts = (o: Record<string, string>) => new Map(Object.entries(o));

describe("option readers", () => {
  it("required rejects a missing or empty value", () => {
    expect(required(opts({ out: "a" }), "out")).toBe("a");
    expect(() => required(opts({}), "out")).toThrow("--out is required");
    expect(() => required(opts({ out: "" }), "out")).toThrow(
      "--out must not be empty",
    );
  });

  it("numeric and requiredNumeric read plain decimals", () => {
    expect(numeric(opts({ w: "0.5" }), "w")).toBe(0.5);
    expect(numeric(opts({}), "w")).toBeUndefined();
    expect(requiredNumeric(opts({ w: "7" }), "w")).toBe(7);
    expect(() => requiredNumeric(opts({}), "w")).toThrow("--w is required");
    expect(() => numeric(opts({ w: "1e3" }), "w")).toThrow(
      "--w must be a plain decimal",
    );
  });
});

describe("spec files and output files", () => {
  const tmp = useTempDir();

  it("readSpec returns a JSON object, with or without a byte order mark", async () => {
    const file = join(tmp(), "s.json");
    writeFileSync(file, '﻿{"kind":"dots"}');
    expect(await readSpec(file)).toEqual({ kind: "dots" });
    writeFileSync(file, "7");
    await expect(readSpec(file)).rejects.toThrow(/must contain a JSON object/);
    await expect(readSpec(tmp())).rejects.toThrow(/not a regular file/);
  });

  it("writeOut creates folders, replaces atomically and refuses a directory", async () => {
    const file = join(tmp(), "a", "b", "f.txt");
    await writeOut(file, "one");
    await writeOut(file, "two");
    expect(readFileSync(file, "utf8")).toBe("two");
    expect(readdirSync(join(tmp(), "a", "b"))).toEqual(["f.txt"]);
    mkdirSync(join(tmp(), "dir"));
    await expect(writeOut(join(tmp(), "dir"), "x")).rejects.toThrow(
      new VisError(`could not write ${join(tmp(), "dir")}: it is a directory`),
    );
  });
});
