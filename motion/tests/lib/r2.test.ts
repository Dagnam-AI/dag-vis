import { describe, expect, it } from "vitest";

import { putIfAbsent, type HttpRequest } from "../../src/lib/r2.ts";
import { md5Hex, sha256Hex } from "../../src/lib/sigv4.ts";

const TARGET = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "AKIAFAKEFAKEFAKE",
  secretAccessKey: "fake-secret-value",
  bucket: "fake-bucket",
};
const KEY = "videos/a/a-20261023-v1.mp4";
const BYTES = new TextEncoder().encode("hello");
const SHA = sha256Hex(BYTES);
const MD5 = md5Hex(BYTES);
const NOW = () => new Date("2026-10-23T12:00:00Z");

interface Call {
  url: string;
  init: HttpRequest;
}
/** A stand-in for the network: answers in order, records what would have been sent. Nothing leaves the process. */
function fakeNetwork(...answers: Response[]) {
  const calls: Call[] = [];
  const send = (url: string, init: HttpRequest): Promise<Response> => {
    calls.push({ url, init });
    const answer = answers[calls.length - 1];
    if (!answer) throw new Error("unexpected extra request");
    return Promise.resolve(answer);
  };
  return { calls, send };
}
const head = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });
const run = (...answers: Response[]) => {
  const net = fakeNetwork(...answers);
  return {
    net,
    result: putIfAbsent(TARGET, KEY, BYTES, "video/mp4", net.send, NOW),
  };
};

describe("putIfAbsent", () => {
  it("treats 404 as absent: HEAD, then a PUT carrying the body, its type and its sha256 as signed metadata", async () => {
    const { net, result } = run(head(404), new Response(null, { status: 200 }));
    expect(await result).toBe("uploaded");
    expect(net.calls.map((c) => c.init.method)).toEqual(["HEAD", "PUT"]);
    const [h, p] = net.calls as [Call, Call];
    expect(h.url).toBe(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/fake-bucket/videos/a/a-20261023-v1.mp4",
    );
    expect(h.init.body).toBeUndefined();
    expect(h.init.headers["x-amz-meta-sha256"]).toBeUndefined();
    expect(h.init.headers["x-amz-content-sha256"]).toBe(sha256Hex(""));
    expect(p.init.body).toBe(BYTES);
    expect(p.init.headers["content-type"]).toBe("video/mp4");
    expect(p.init.headers["x-amz-meta-sha256"]).toBe(SHA);
    expect(p.init.headers["x-amz-content-sha256"]).toBe(SHA);
    expect(p.init.headers.authorization).toMatch(
      /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-meta-sha256, Signature=[0-9a-f]{64}$/,
    );
  });

  it("reports a failed PUT with the status and the start of the body", async () => {
    const { result } = run(
      head(404),
      new Response("x".repeat(400), { status: 500 }),
    );
    await expect(result).rejects.toThrow(/PUT .*HTTP 500 x{300}$/);
  });

  it("leaves an existing object alone when its sha256 metadata matches", async () => {
    const { net, result } = run(head(200, { "x-amz-meta-sha256": SHA }));
    expect(await result).toBe("exists");
    expect(net.calls).toHaveLength(1);
  });

  it("refuses an existing object whose sha256 metadata differs", async () => {
    const { net, result } = run(
      head(200, { "x-amz-meta-sha256": "00".repeat(32) }),
    );
    await expect(result).rejects.toThrow(
      /already exists and is not this file: .*different sha256/,
    );
    expect(net.calls).toHaveLength(1);
  });

  it("refuses an existing object whose sha256 metadata differs even when its size and plain MD5 ETag match this file", async () => {
    const { net, result } = run(
      head(200, {
        "x-amz-meta-sha256": "00".repeat(32),
        etag: `"${MD5}"`,
        "content-length": String(BYTES.byteLength),
      }),
    );
    await expect(result).rejects.toThrow(/different sha256/);
    expect(net.calls).toHaveLength(1);
  });

  it("refuses an existing object with no metadata and no usable ETag", async () => {
    const { result } = run(head(200));
    await expect(result).rejects.toThrow(/no sha256 metadata/);
  });

  it("accepts an object without metadata when its size and plain MD5 ETag match, quoted or not", async () => {
    for (const etag of [`"${MD5}"`, MD5.toUpperCase()]) {
      const { result } = run(
        head(200, { etag, "content-length": String(BYTES.byteLength) }),
      );
      expect(await result).toBe("exists");
    }
  });

  it("refuses a matching ETag when the size differs or is missing", async () => {
    for (const headers of [
      { etag: `"${MD5}"`, "content-length": "999" },
      { etag: `"${MD5}"` },
    ]) {
      const { result } = run(head(200, headers));
      await expect(result).rejects.toThrow(/no sha256 metadata/);
    }
  });

  it("never trusts a multipart ETag, nor an ETag of another file", async () => {
    for (const etag of [`"${MD5}-3"`, `"${"0".repeat(32)}"`]) {
      const { result } = run(
        head(200, { etag, "content-length": String(BYTES.byteLength) }),
      );
      await expect(result).rejects.toThrow(/not this file/);
    }
  });

  it("keeps a 403 on HEAD a hard error and says what the owner should grant", async () => {
    const { net, result } = run(head(403));
    await expect(result).rejects.toThrow(
      /HTTP 403; grant the token Object Read & Write/,
    );
    expect(net.calls).toHaveLength(1);
  });

  it("keeps any other status on HEAD a hard error", async () => {
    const { net, result } = run(head(500));
    await expect(result).rejects.toThrow(/HEAD .*HTTP 500$/);
    expect(net.calls).toHaveLength(1);
  });
});
