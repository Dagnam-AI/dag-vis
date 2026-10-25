import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { signRequest } from "../../src/lib/sigv4.ts";
import { runScript, writeRender, type Render } from "./harness.ts";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/store.ts", import.meta.url),
);

// `store --upload` against a server on 127.0.0.1 that stands in for R2. Nothing
// here can reach the real bucket: the credentials are made up, the endpoint is the
// loopback override (MOTION_R2_ENDPOINT), and the global fetch is wrapped to
// refuse any other host. The server checks each request's signature.
const h = vi.hoisted(() => ({ motion: "" }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));

const CREDENTIALS = {
  R2_ACCOUNT_ID: "fakeaccount0000",
  R2_ACCESS_KEY_ID: "FAKEKEYID-TEST",
  R2_SECRET_ACCESS_KEY: "fake-secret-NOT-REAL-0000",
  R2_VIDEOS_BUCKET: "fake-bucket",
};
const SECRETS = Object.values(CREDENTIALS);

interface Seen {
  method: string;
  key: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
  /** The Authorization header equals the one signRequest makes for this very request. */
  signed: boolean;
}
interface Stored {
  body: Buffer;
  /** x-amz-meta-sha256, when the object has it. */
  sha256?: string;
}

let server: Server;
let origin: string;
const seen: Seen[] = [];
const objects = new Map<string, Stored>();
/** Per method, a status to answer with instead of the normal behaviour. */
const forced = new Map<
  string,
  { status: number; body?: string; headers?: Record<string, string> }
>();

const md5 = (b: Buffer): string => createHash("md5").update(b).digest("hex");
const sha256 = (b: Buffer | string): string =>
  createHash("sha256").update(b).digest("hex");

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const method = req.method ?? "";
      const path = decodeURIComponent(req.url ?? "");
      const key = path.replace(`/${CREDENTIALS.R2_VIDEOS_BUCKET}/`, "");
      const h = req.headers;
      const expected = signRequest({
        method: method as "HEAD" | "PUT",
        accountId: CREDENTIALS.R2_ACCOUNT_ID,
        bucket: CREDENTIALS.R2_VIDEOS_BUCKET,
        key,
        accessKeyId: CREDENTIALS.R2_ACCESS_KEY_ID,
        secretAccessKey: CREDENTIALS.R2_SECRET_ACCESS_KEY,
        payloadSha256: String(h["x-amz-content-sha256"]),
        contentType: h["content-type"],
        extraHeaders:
          h["x-amz-meta-sha256"] === undefined
            ? undefined
            : { "x-amz-meta-sha256": String(h["x-amz-meta-sha256"]) },
        now: new Date(
          String(h["x-amz-date"]).replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            "$1-$2-$3T$4:$5:$6Z",
          ),
        ),
        endpoint: origin,
      });
      seen.push({
        method,
        key,
        headers: h,
        body,
        signed: h.authorization === expected.headers.authorization,
      });
      const force = forced.get(method);
      if (force) {
        res.writeHead(force.status, force.headers);
        res.end(force.body ?? "");
        return;
      }
      if (method === "PUT") {
        const meta = h["x-amz-meta-sha256"];
        objects.set(key, {
          body,
          ...(typeof meta === "string" ? { sha256: meta } : {}),
        });
        res.writeHead(200);
        res.end();
        return;
      }
      const found = objects.get(key);
      if (!found) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-length": found.body.length,
        etag: `"${md5(found.body)}"`,
        ...(found.sha256 === undefined
          ? {}
          : { "x-amz-meta-sha256": found.sha256 }),
      });
      res.end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

let tmp: string;
let videos: string;
let render: Render;
const realFetch = globalThis.fetch;
beforeEach(() => {
  seen.length = 0;
  objects.clear();
  forced.clear();
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "store-upload-")));
  h.motion = join(tmp, "motion");
  mkdirSync(h.motion);
  videos = join(tmp, "videos");
  render = writeRender(h.motion, "demo");
  vi.stubEnv("DAG_VIDEOS_DIR", videos);
  for (const [name, value] of Object.entries(CREDENTIALS))
    vi.stubEnv(name, value);
  vi.stubEnv("MOTION_R2_ENDPOINT", origin);
  // Belt and braces: whatever the code does, only this machine can be reached.
  vi.stubGlobal(
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const host = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      ).hostname;
      if (host !== "127.0.0.1") throw new Error(`refused a request to ${host}`);
      return realFetch(input, init);
    },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(tmp, { recursive: true, force: true });
});

const upload = (...extra: string[]) =>
  runScript(SCRIPT, [render.mp4, "--upload", ...extra]);
const names = (): string[] => render.files.map((f) => f.split("/").at(-1)!);
const keys = (): string[] => names().map((n) => `videos/demo/${n}`);
const ledgerRow = (): { stored: { r2: string | null } } =>
  JSON.parse(readFileSync(join(h.motion, "RENDERS.jsonl"), "utf8")) as {
    stored: { r2: string | null };
  };
const leaks = (r: { out: string; err: string }): string[] =>
  SECRETS.filter((s) => `${r.out}\n${r.err}`.includes(s));

describe("store --upload against a local stand-in for R2", () => {
  it("asks whether each object exists (HEAD), then puts it (PUT), file by file, and records the key", async () => {
    const r = await upload();
    expect(r.code).toBe(0);
    expect(seen.map((s) => `${s.method} ${s.key}`)).toEqual(
      keys().flatMap((k) => [`HEAD ${k}`, `PUT ${k}`]),
    );
    expect(r.out).toContain(`r2: videos/demo/${render.name} uploaded`);
    expect(r.out).toContain("RENDERS.jsonl: stored.r2 recorded (commit it)");
    expect(ledgerRow().stored.r2).toBe(`videos/demo/${render.name}`);
    // The local copy is made first, as without --upload.
    expect(readdirSync(join(videos, "demo")).sort()).toEqual(names().sort());
  });

  it("signs every request (SigV4, host and payload included) and sends each file's own sha256 as metadata", async () => {
    await upload();
    for (const s of seen) {
      expect(s.signed, `${s.method} ${s.key} signature`).toBe(true);
      expect(s.headers.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=FAKEKEYID-TEST\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]*host;[a-z0-9;-]*, Signature=[0-9a-f]{64}$/,
      );
      expect(s.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
      expect(s.headers.host).toBe(origin.replace("http://", ""));
    }
    const heads = seen.filter((s) => s.method === "HEAD");
    for (const s of heads) {
      expect(s.headers["x-amz-meta-sha256"]).toBeUndefined();
      expect(s.headers["x-amz-content-sha256"]).toBe(sha256(""));
    }
    const puts = seen.filter((s) => s.method === "PUT");
    expect(puts).toHaveLength(3);
    for (const s of puts) {
      expect(s.headers["x-amz-meta-sha256"]).toBe(sha256(s.body));
      expect(s.headers["x-amz-content-sha256"]).toBe(sha256(s.body));
      expect(s.headers.authorization).toContain("x-amz-meta-sha256");
    }
    const [mp4, props, check] = puts as [Seen, Seen, Seen];
    expect(mp4.headers["content-type"]).toBe("video/mp4");
    expect(props.headers["content-type"]).toBe("application/json");
    expect(check.headers["content-type"]).toBe("application/json");
    expect(mp4.body.toString()).toBe("pretend mp4 of demo");
    expect(mp4.headers["x-amz-meta-sha256"]).toBe(render.sha256);
  });

  it("prints no credential, account id or bucket, and the ledger holds none", async () => {
    const r = await upload();
    expect(leaks(r)).toEqual([]);
    expect(readFileSync(join(h.motion, "RENDERS.jsonl"), "utf8")).not.toMatch(
      /FAKEKEYID|fake-secret|fakeaccount|fake-bucket/,
    );
  });

  it("does not overwrite an object that is already this file: HEAD only, no PUT, and says so", async () => {
    await upload();
    seen.length = 0;
    const again = await upload();
    expect(again.code).toBe(0);
    expect(seen.map((s) => s.method)).toEqual(["HEAD", "HEAD", "HEAD"]);
    for (const k of keys())
      expect(again.out).toContain(
        `r2: ${k} already exists and is this file, left untouched`,
      );
    expect(again.out).not.toContain("uploaded");
    expect(ledgerRow().stored.r2).toBe(`videos/demo/${render.name}`);
  });

  it("accepts an object with no sha256 metadata only when its size and MD5 ETag match", async () => {
    for (const [i, f] of render.files.entries())
      objects.set(keys()[i]!, { body: readFileSync(f) });
    const r = await upload();
    expect(r.code).toBe(0);
    expect(seen.every((s) => s.method === "HEAD")).toBe(true);
  });

  it("fails on an object under the same name with a different sha256, and sends no PUT at all", async () => {
    objects.set(keys()[0]!, {
      body: Buffer.from("other bytes"),
      sha256: "00".repeat(32),
    });
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      `r2 videos/demo/${render.name} already exists and is not this file: the object there has a different sha256`,
    );
    expect(seen.map((s) => s.method)).toEqual(["HEAD"]);
    expect(ledgerRow().stored.r2).toBeNull();
    expect(leaks(r)).toEqual([]);
  });

  it("fails on an unmarked object whose bytes differ", async () => {
    objects.set(keys()[0]!, { body: Buffer.from("other bytes") });
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "carries no sha256 metadata and its size and MD5 ETag do not match",
    );
    expect(seen.some((s) => s.method === "PUT")).toBe(false);
  });

  it("stops after a file that fails: later files are not sent, nothing is recorded", async () => {
    objects.set(keys()[1]!, {
      body: Buffer.from("other"),
      sha256: "11".repeat(32),
    });
    const r = await upload();
    expect(r.code).toBe(1);
    expect(seen.map((s) => `${s.method} ${s.key}`)).toEqual([
      `HEAD ${keys()[0]!}`,
      `PUT ${keys()[0]!}`,
      `HEAD ${keys()[1]!}`,
    ]);
    expect(ledgerRow().stored.r2).toBeNull();
  });

  it("fails on a 403 from HEAD, naming the permission the token needs, and never reads it as absent", async () => {
    forced.set("HEAD", { status: 403 });
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain("HTTP 403");
    expect(r.err).toContain("Object Read & Write");
    expect(seen.map((s) => s.method)).toEqual(["HEAD"]);
  });

  it("fails on any other HEAD status", async () => {
    forced.set("HEAD", { status: 500 });
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain(`r2 HEAD videos/demo/${render.name}: HTTP 500`);
  });

  it.each(["HEAD", "PUT"])(
    "fails on a 302 to %s without following it, and records nothing",
    async (method) => {
      forced.set(method, {
        status: 302,
        headers: { location: `${origin}/elsewhere/${method}` },
      });
      const r = await upload();
      expect(r.code).toBe(1);
      expect(r.err).toContain(`r2 ${method} failed: `);
      expect(r.err).toContain("redirect");
      expect(r.err).toContain(
        "a redirect is never followed; nothing was recorded",
      );
      // The redirect target is never asked, and no later file is tried.
      expect(seen.map((s) => s.method)).toEqual(
        method === "HEAD" ? ["HEAD"] : ["HEAD", "PUT"],
      );
      expect(seen.every((s) => !s.key.startsWith("elsewhere"))).toBe(true);
      expect(ledgerRow().stored.r2).toBeNull();
      expect(leaks(r)).toEqual([]);
    },
  );

  it("names a connection failure by its reason, without the redirect note", async () => {
    // A port nothing listens on: the stand-in's own, after it has closed.
    const dead = createServer();
    await new Promise<void>((resolve) => {
      dead.listen(0, "127.0.0.1", resolve);
    });
    const port = (dead.address() as AddressInfo).port;
    await new Promise((resolve) => dead.close(resolve));
    vi.stubEnv("MOTION_R2_ENDPOINT", `http://127.0.0.1:${String(port)}`);
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain("r2 HEAD failed: ");
    expect(r.err).not.toContain("redirect");
    expect(ledgerRow().stored.r2).toBeNull();
  });

  it("fails on a PUT the server refuses and records nothing; a credential the server echoes is redacted", async () => {
    forced.set("PUT", {
      status: 500,
      body: `denied for ${CREDENTIALS.R2_ACCESS_KEY_ID} with ${CREDENTIALS.R2_SECRET_ACCESS_KEY} in ${CREDENTIALS.R2_VIDEOS_BUCKET}`,
    });
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "HTTP 500 denied for [redacted] with [redacted] in [redacted]",
    );
    expect(leaks(r)).toEqual([]);
    expect(ledgerRow().stored.r2).toBeNull();
  });

  it("will not upload a file that differs from its ledger line, and sends nothing", async () => {
    // A ledger line with another hash: the mp4 on disk is not the one that was recorded.
    const ledger = join(h.motion, "RENDERS.jsonl");
    writeFileSync(
      ledger,
      readFileSync(ledger, "utf8").replace(render.sha256, "ab".repeat(32)),
    );
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "differs from its ledger line (sha256); not uploading",
    );
    expect(seen).toEqual([]);
    expect(ledgerRow().stored.r2).toBeNull();
  });

  it("refuses an endpoint that is not on this machine before any request, naming the rule and not the value", async () => {
    vi.stubEnv("MOTION_R2_ENDPOINT", "http://example.com:9");
    const r = await upload();
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "R2 upload: MOTION_R2_ENDPOINT must be http://127.0.0.1:<port>",
    );
    expect(r.err).not.toContain("example.com");
    expect(seen).toEqual([]);
    expect(readdirSync(tmp)).not.toContain("videos");
  });

  it("without the override, would build the account's R2 host: the loopback server is not asked", async () => {
    vi.stubEnv("MOTION_R2_ENDPOINT", "");
    const r = await upload();
    // The guard around fetch refuses the real host: nothing leaves this machine.
    expect(r.code).toBe(1);
    expect(r.err).toContain("refused a request to [redacted].r2.");
    expect(seen).toEqual([]);
  });
});
