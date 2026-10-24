// The upload of one object to the owner's R2 bucket, never overwriting.
// Only scripts/ imports this file (it signs through sigv4.ts).
import { md5Hex, sha256Hex, signRequest } from "./sigv4.ts";
import { existingObjectProblem, type RemoteObject } from "./store.ts";

export interface R2Target {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}
export interface HttpRequest {
  method: "HEAD" | "PUT";
  headers: Record<string, string>;
  body?: Uint8Array<ArrayBuffer>;
}
/** The global fetch, or a stand-in with the same shape. */
export type Send = (url: string, init: HttpRequest) => Promise<Response>;

const DENIED =
  "grant the token Object Read & Write on the videos bucket (a token that cannot read cannot upload: the upload starts by looking whether the object exists)";

/**
 * HEAD, then PUT only when the key is absent (404). An object that exists is left
 * untouched and counts as uploaded only if it is this file (see
 * existingObjectProblem). Any other status is an error, a 403 included.
 */
export async function putIfAbsent(
  target: R2Target,
  key: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  send: Send,
  now: () => Date,
): Promise<"uploaded" | "exists"> {
  const sha256 = sha256Hex(bytes);
  const request = (
    method: "HEAD" | "PUT",
    payload: Uint8Array<ArrayBuffer> | undefined,
  ): Promise<Response> => {
    const signed = signRequest({
      method,
      ...target,
      key,
      payloadSha256: method === "PUT" ? sha256 : sha256Hex(""),
      contentType: method === "PUT" ? contentType : undefined,
      extraHeaders:
        method === "PUT" ? { "x-amz-meta-sha256": sha256 } : undefined,
      now: now(),
    });
    return send(signed.url, {
      method,
      headers: signed.headers,
      ...(payload ? { body: payload } : {}),
    });
  };

  const head = await request("HEAD", undefined);
  if (head.status === 200) {
    const length = head.headers.get("content-length");
    const remote: RemoteObject = {
      sha256: head.headers.get("x-amz-meta-sha256"),
      etag: head.headers.get("etag"),
      bytes: length === null ? null : Number(length),
    };
    const problem = existingObjectProblem(remote, {
      sha256,
      md5: md5Hex(bytes),
      bytes: bytes.byteLength,
    });
    if (problem !== null)
      throw new Error(
        `r2 ${key} already exists and is not this file: ${problem}`,
      );
    return "exists";
  }
  if (head.status === 403)
    throw new Error(`r2 HEAD ${key}: HTTP 403; ${DENIED}`);
  if (head.status !== 404)
    throw new Error(`r2 HEAD ${key}: HTTP ${String(head.status)}`);

  const put = await request("PUT", bytes);
  if (!put.ok)
    throw new Error(
      `r2 PUT ${key}: HTTP ${String(put.status)} ${(await put.text()).slice(0, 300)}`,
    );
  return "uploaded";
}
