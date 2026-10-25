import { describe, expect, it } from "vitest";
import {
  R2_ENDPOINT_VAR,
  contentTypeFor,
  endpointProblem,
  existingObjectProblem,
  ledgerNames,
  ledgerRow,
  localCopyAction,
  markUploaded,
  newStored,
  readR2,
  redact,
  uploadProblem,
  videoKey,
} from "../../src/lib/store.ts";

const ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_VIDEOS_BUCKET: "bucket",
};

describe("videoKey", () => {
  it("prefixes videos/<video>/ and keeps the versioned file name exactly", () => {
    expect(videoKey("pipeline-proof", "pipeline-proof-20261023-v1.mp4")).toBe(
      "videos/pipeline-proof/pipeline-proof-20261023-v1.mp4",
    );
    expect(
      videoKey("pipeline-proof", "pipeline-proof-20261023-v12.props.json"),
    ).toBe("videos/pipeline-proof/pipeline-proof-20261023-v12.props.json");
    expect(videoKey("a", "a-20261023-v1.check.json")).toBe(
      "videos/a/a-20261023-v1.check.json",
    );
  });
  it.each([
    ["Bad Name", "Bad Name-20261023-v1.mp4"],
    ["../a", "x"],
    ["a", "b-20261023-v1.mp4"],
    ["a", "a-20261023-v1.mov"],
    ["a", "../a-20261023-v1.mp4"],
    ["a", "a-2026-v1.mp4"],
  ])("rejects video %j with file %j", (video, file) => {
    expect(() => videoKey(video, file)).toThrow(/video|file/);
  });
});

describe("newStored", () => {
  it("records the folder-relative local path and no R2 key yet", () => {
    expect(newStored("a", "a-20261023-v1.mp4")).toEqual({
      local: "a/a-20261023-v1.mp4",
      r2: null,
    });
  });
});

describe("contentTypeFor", () => {
  it("maps the three stored kinds", () => {
    expect(contentTypeFor("a-20261023-v1.mp4")).toBe("video/mp4");
    expect(contentTypeFor("a-20261023-v1.props.json")).toBe("application/json");
    expect(contentTypeFor("a-20261023-v1.check.json")).toBe("application/json");
  });
});

describe("readR2", () => {
  it("is absent when none of the four variables is set (empty counts as unset)", () => {
    expect(readR2({})).toEqual({ kind: "absent" });
    expect(readR2({ R2_ACCOUNT_ID: "" })).toEqual({ kind: "absent" });
  });
  it("is partial, naming what is missing in a fixed order, when only some are set", () => {
    expect(
      readR2({ R2_ACCOUNT_ID: "acct", R2_VIDEOS_BUCKET: "bucket" }),
    ).toEqual({
      kind: "partial",
      missing: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
    });
  });
  it("is ready with all four", () => {
    expect(readR2(ENV)).toEqual({
      kind: "ready",
      accountId: "acct",
      accessKeyId: "id",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
  });
});

describe("the test-double endpoint", () => {
  it("is named MOTION_R2_ENDPOINT", () => {
    expect(R2_ENDPOINT_VAR).toBe("MOTION_R2_ENDPOINT");
  });

  it.each([
    "http://127.0.0.1:8123",
    "http://127.0.0.1:8123/",
    "http://127.0.0.1",
    "http://[::1]:8123",
  ])("accepts %s", (value) => {
    expect(endpointProblem(value)).toBeNull();
  });

  it.each([
    "https://127.0.0.1:8123",
    "http://localhost:8123",
    "http://127.0.0.1.example.com:8123",
    "http://example.com:8123",
    "http://192.168.1.5:8123",
    "http://0.0.0.0:8123",
    "http://[::2]:8123",
    "http://user:pw@127.0.0.1:8123",
    "http://user@127.0.0.1:8123",
    "http://127.0.0.1:8123/bucket",
    "http://127.0.0.1:8123/?x=1",
    "http://127.0.0.1:8123/#x",
    "http://example.com\\@127.0.0.1:8123",
    "127.0.0.1:8123",
    "not a url",
    "",
  ])(
    "refuses %j: it could send the signed upload to another machine",
    (value) => {
      expect(endpointProblem(value)).toBe(
        "MOTION_R2_ENDPOINT must be http://127.0.0.1:<port> or http://[::1]:<port> (a test double on this machine) and nothing more",
      );
    },
  );

  it("is carried by readR2 as the bare origin, and left undefined when unset or empty", () => {
    expect(
      readR2({ ...ENV, MOTION_R2_ENDPOINT: "http://127.0.0.1:8123/" }),
    ).toMatchObject({
      kind: "ready",
      endpoint: "http://127.0.0.1:8123",
    });
    expect(readR2(ENV)).toHaveProperty("endpoint", undefined);
    expect(readR2({ ...ENV, MOTION_R2_ENDPOINT: "" })).toHaveProperty(
      "endpoint",
      undefined,
    );
  });

  it("makes readR2 not ready, with the rule and no value, when it names another machine", () => {
    const status = readR2({
      ...ENV,
      MOTION_R2_ENDPOINT: "http://example.com:1",
    });
    expect(status).toMatchObject({ kind: "endpoint" });
    const problem = uploadProblem(status);
    expect(problem).toMatch(
      /^R2 upload: MOTION_R2_ENDPOINT must be http:\/\/127\.0\.0\.1:<port>/,
    );
    expect(problem).not.toContain("example.com");
  });

  it("is not looked at while the credentials are incomplete (they are named first)", () => {
    expect(
      readR2({ R2_ACCOUNT_ID: "a", MOTION_R2_ENDPOINT: "http://example.com" }),
    ).toMatchObject({
      kind: "partial",
    });
    expect(readR2({ MOTION_R2_ENDPOINT: "http://example.com" })).toEqual({
      kind: "absent",
    });
  });
});

describe("uploadProblem", () => {
  it("is null when all four variables are set", () => {
    expect(uploadProblem(readR2(ENV))).toBeNull();
  });
  it("names every variable when none is set", () => {
    expect(uploadProblem(readR2({}))).toBe(
      "R2 upload: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_VIDEOS_BUCKET (none is set)",
    );
  });
  it("names only the missing ones, and never a value that is set", () => {
    const problem = uploadProblem(
      readR2({ R2_ACCOUNT_ID: "acct-value", R2_VIDEOS_BUCKET: "bucket-value" }),
    );
    expect(problem).toBe(
      "R2 upload: also set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
    expect(problem).not.toMatch(/acct-value|bucket-value/);
  });
});

describe("localCopyAction", () => {
  it("copies a file that is not stored, leaves an identical one, refuses a different one", () => {
    expect(localCopyAction(null, "ab")).toBe("copy");
    expect(localCopyAction("ab", "ab")).toBe("skip");
    expect(localCopyAction("cd", "ab")).toBe("conflict");
  });
});

describe("markUploaded", () => {
  const row = (n: number, r2: string | null) => ({
    video: "a",
    file: `out/a/a-20261023-v${String(n)}.mp4`,
    stored: { local: `a/a-20261023-v${String(n)}.mp4`, r2 },
  });
  const ledger = (rows: object[]) =>
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
  it("sets stored.r2 on the matching line only and keeps every other byte", () => {
    const out = markUploaded(
      ledger([row(1, null), row(2, null)]),
      "out/a/a-20261023-v2.mp4",
      "videos/a/a-20261023-v2.mp4",
    );
    expect(out).toBe(
      ledger([row(1, null), row(2, "videos/a/a-20261023-v2.mp4")]),
    );
  });
  it("is idempotent for the same key and refuses a different one", () => {
    const done = ledger([row(1, "videos/a/a-20261023-v1.mp4")]);
    expect(
      markUploaded(
        done,
        "out/a/a-20261023-v1.mp4",
        "videos/a/a-20261023-v1.mp4",
      ),
    ).toBe(done);
    expect(() =>
      markUploaded(done, "out/a/a-20261023-v1.mp4", "videos/a/other.mp4"),
    ).toThrow(/already recorded/);
  });
  it("refuses a file with no ledger line", () => {
    expect(() =>
      markUploaded(ledger([row(1, null)]), "out/a/a-20261023-v9.mp4", "k"),
    ).toThrow(/no ledger line/);
  });
});

describe("ledgerRow", () => {
  const line = (file: string) =>
    JSON.stringify({
      video: "a",
      file,
      sha256: "ab",
      stored: { local: "a/x", r2: null },
    });
  it("returns the one line for the file, ignoring blank lines", () => {
    const ledger = `${line("out/a/a-20261023-v1.mp4")}\n\n${line("out/a/a-20261023-v2.mp4")}\n`;
    expect(ledgerRow(ledger, "out/a/a-20261023-v2.mp4").file).toBe(
      "out/a/a-20261023-v2.mp4",
    );
  });
  it("refuses a file with no line and a file with two", () => {
    expect(() => ledgerRow("", "out/a/a-20261023-v1.mp4")).toThrow(
      /no ledger line/,
    );
    const twice = `${line("out/a/a-20261023-v1.mp4")}\n${line("out/a/a-20261023-v1.mp4")}\n`;
    expect(() => ledgerRow(twice, "out/a/a-20261023-v1.mp4")).toThrow(
      /2 ledger lines/,
    );
  });
});

describe("redact", () => {
  it("removes every secret everywhere, longest first, and ignores empty ones", () => {
    expect(redact("key abc and abcdef, abc", ["abc", "", "abcdef"])).toBe(
      "key [redacted] and [redacted], [redacted]",
    );
    expect(redact("nothing here", ["zzz"])).toBe("nothing here");
  });
  it("does not alter its input list", () => {
    const secrets = ["a", "bb"];
    redact("a bb", secrets);
    expect(secrets).toEqual(["a", "bb"]);
  });
});

describe("existingObjectProblem", () => {
  const local = { sha256: "aa", md5: "b".repeat(32), bytes: 5 };
  it("accepts our own metadata, or a matching size and plain MD5 ETag", () => {
    expect(
      existingObjectProblem({ sha256: "aa", etag: null, bytes: null }, local),
    ).toBeNull();
    expect(
      existingObjectProblem(
        { sha256: null, etag: `"${"B".repeat(32)}"`, bytes: 5 },
        local,
      ),
    ).toBeNull();
  });
  it("treats any other sha256 metadata as a different file, even when size and plain MD5 ETag match", () => {
    expect(
      existingObjectProblem(
        { sha256: "zz", etag: "b".repeat(32), bytes: 5 },
        local,
      ),
    ).toMatch(/different sha256/);
  });
  it("says whether the metadata differs or is missing", () => {
    expect(
      existingObjectProblem({ sha256: "zz", etag: null, bytes: 5 }, local),
    ).toMatch(/different sha256/);
    expect(
      existingObjectProblem({ sha256: null, etag: null, bytes: 5 }, local),
    ).toMatch(/no sha256 metadata/);
  });
  it("rejects multipart, short, wrong or size-mismatched ETags", () => {
    for (const etag of [
      `"${"b".repeat(32)}-2"`,
      "b".repeat(31),
      "c".repeat(32),
    ])
      expect(
        existingObjectProblem({ sha256: null, etag, bytes: 5 }, local),
      ).not.toBeNull();
    expect(
      existingObjectProblem(
        { sha256: null, etag: "b".repeat(32), bytes: 6 },
        local,
      ),
    ).not.toBeNull();
  });
});

describe("ledgerNames", () => {
  it("lists the file names the ledger holds for one video", () => {
    const line = (video: string, name: string) =>
      JSON.stringify({ video, file: `out/${video}/${name}` });
    const ledger = `${line("a", "a-20261023-v1.mp4")}\n\n${line("b", "b-20261023-v7.mp4")}\n${line("a", "a-20261023-v2.mp4")}\n`;
    expect(ledgerNames(ledger, "a")).toEqual([
      "a-20261023-v1.mp4",
      "a-20261023-v2.mp4",
    ]);
    expect(ledgerNames("", "a")).toEqual([]);
  });
});
