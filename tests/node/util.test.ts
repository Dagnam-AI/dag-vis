import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { messageOf, writeAtomic } from "../../src/node/util.js";
import { useTempDir } from "./cli-helpers.js";

describe("messageOf", () => {
  it("reads Errors and stringifies anything else", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf("plain")).toBe("plain");
    expect(messageOf(42)).toBe("42");
  });
});

describe("writeAtomic", () => {
  const tmp = useTempDir();
  const wrap = (error: unknown): Error =>
    new VisError(`wrapped: ${messageOf(error)}`);

  it("writes text and bytes whole, replacing what was there, with no temp file left", async () => {
    const path = join(tmp(), "out.txt");
    writeFileSync(path, "old");
    await writeAtomic(path, "new", wrap);
    expect(readFileSync(path, "utf8")).toBe("new");
    await writeAtomic(path, Buffer.from([1, 2, 3]), wrap);
    expect([...readFileSync(path)]).toEqual([1, 2, 3]);
    expect(readdirSync(tmp())).toEqual(["out.txt"]);
  });

  it("throws what `wrap` makes of a failure and removes its temp file", async () => {
    // The directory is missing, so the temp file cannot be created.
    const missing = join(tmp(), "nope", "out.txt");
    const failure = writeAtomic(missing, "x", wrap);
    await expect(failure).rejects.toThrow(VisError);
    await expect(failure).rejects.toThrow(/^wrapped: ENOENT/);
    // A directory at the target: the temp file is written, the rename fails, the temp goes.
    const dir = join(tmp(), "dir");
    mkdirSync(join(dir, "inner"), { recursive: true });
    await expect(writeAtomic(dir, "x", wrap)).rejects.toThrow(/^wrapped: /);
    expect(readdirSync(tmp())).toEqual(["dir"]);
  });
});
