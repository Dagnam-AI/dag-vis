// AWS Signature V4 for Cloudflare R2's S3 endpoint, node:crypto only (no dependency).
// The ONE lib file with a node: import: it is only imported by scripts/, never by the Remotion bundle (tests/structure.test.ts).
import { createHash, createHmac } from "node:crypto";

export interface SignInput {
  method: "GET" | "HEAD" | "PUT";
  accountId: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Hex SHA-256 of the body (of "" for GET/HEAD). */
  payloadSha256: string;
  contentType?: string | undefined;
  /** Further headers to sign and send, lower-case names (e.g. `x-amz-meta-sha256`). */
  extraHeaders?: Readonly<Record<string, string>> | undefined;
  now: Date;
}
export interface Signed {
  url: string;
  /** Send these; `host` is added by fetch. */
  headers: Record<string, string>;
}

const REGION = "auto";
const SERVICE = "s3";
const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

export const md5Hex = (data: string | Uint8Array): string =>
  createHash("md5").update(data).digest("hex");

export const signingKey = (
  secret: string,
  date: string,
  region: string,
  service: string,
): Buffer =>
  hmac(
    hmac(hmac(hmac(`AWS4${secret}`, date), region), service),
    "aws4_request",
  );

// RFC 3986 per path segment; "/" stays. S3 does not double-encode the path.
const encodeSegment = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function signRequest(i: SignInput): Signed {
  const amzDate = i.now.toISOString().replace(/[-:]|\.\d{3}/g, ""); // 20261023T120000Z
  const date = amzDate.slice(0, 8);
  const host = `${i.accountId}.r2.cloudflarestorage.com`;
  const path = `/${[i.bucket, ...i.key.split("/")].map(encodeSegment).join("/")}`;
  const sent: Record<string, string> = {
    ...(i.contentType === undefined ? {} : { "content-type": i.contentType }),
    ...i.extraHeaders,
    "x-amz-content-sha256": i.payloadSha256,
    "x-amz-date": amzDate,
  };
  // SigV4 wants the signed headers sorted by name; `host` is signed but added by fetch.
  const entries = Object.entries({ ...sent, host }).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  const signedHeaders = entries.map(([name]) => name).join(";");
  const canonical = [
    i.method,
    path,
    "",
    entries.map(([n, v]) => `${n}:${v.trim()}\n`).join(""),
    signedHeaders,
    i.payloadSha256,
  ].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonical),
  ].join("\n");
  const signature = hmac(
    signingKey(i.secretAccessKey, date, REGION, SERVICE),
    toSign,
  ).toString("hex");
  return {
    url: `https://${host}${path}`,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
