import { describe, expect, it } from "vitest";
import { sha256Hex, signRequest, signingKey } from "../../src/lib/sigv4.ts";

/*
 * Known answers, computed independently of sigv4.ts (Python stdlib, the SigV4 steps written out one by one) and
 * checked against two values AWS publishes: the Python reference below reproduces
 *   - the signing key for secret wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, 20120215, us-east-1, iam:
 *     f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d (AWS IAM docs, "Derive a signing key"), and
 *   - the S3 "PUT Object" example signature 98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd
 *     (AWS S3 docs, "Authenticating requests: using the Authorization header"),
 * so its R2 vectors below are trustworthy. Derivation for the R2 PUT (region auto, service s3, payload "hello"):
 *   canonical request = PUT \n /dagnam-videos/videos/pipeline-proof/pipeline-proof-20261023-v1.mp4 \n <empty query> \n
 *     content-type:video/mp4 \n host:0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com \n
 *     x-amz-content-sha256:<sha256("hello")> \n x-amz-date:20261023T120000Z \n \n
 *     content-type;host;x-amz-content-sha256;x-amz-date \n <sha256("hello")>
 *   string to sign    = AWS4-HMAC-SHA256 \n 20261023T120000Z \n 20261023/auto/s3/aws4_request \n sha256(canonical request)
 *                     (sha256(canonical request) = 9c951ebd16d5bd762a7fd42b81f526b4bbfb83a65647f0122fa9bdfb2a671e36)
 *   signature         = hex(HMAC(kSigning, string to sign)), kSigning = HMAC chain "AWS4"+secret, date, region, service, "aws4_request":
 *     import hashlib, hmac
 *     H = lambda k, m: hmac.new(k, m.encode(), hashlib.sha256).digest()
 *     k = H(H(H(H(b"AWS4" + SECRET.encode(), "20261023"), "auto"), "s3"), "aws4_request")
 *     sig = hmac.new(k, string_to_sign.encode(), hashlib.sha256).hexdigest()
 */
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const BASE = {
  accountId: "0123456789abcdef0123456789abcdef",
  bucket: "dagnam-videos",
  key: "videos/pipeline-proof/pipeline-proof-20261023-v1.mp4",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: SECRET,
  now: new Date("2026-10-23T12:00:00Z"),
};
const HELLO =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

describe("sha256Hex", () => {
  it("hashes strings and bytes", () => {
    expect(sha256Hex("hello")).toBe(HELLO);
    expect(sha256Hex(new TextEncoder().encode("hello"))).toBe(HELLO);
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("signingKey", () => {
  it("matches the key AWS publishes for its IAM example", () => {
    expect(
      signingKey(
        "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        "20120215",
        "us-east-1",
        "iam",
      ).toString("hex"),
    ).toBe("f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
  });
});

describe("signRequest", () => {
  it("signs an R2 PUT with a content type (known answer)", () => {
    const s = signRequest({
      ...BASE,
      method: "PUT",
      payloadSha256: HELLO,
      contentType: "video/mp4",
    });
    expect(s.url).toBe(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/dagnam-videos/videos/pipeline-proof/pipeline-proof-20261023-v1.mp4",
    );
    expect(s.headers).toEqual({
      "x-amz-content-sha256": HELLO,
      "x-amz-date": "20261023T120000Z",
      "content-type": "video/mp4",
      authorization:
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261023/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=4f35b29eb618cbf12753046dc89c8ea52f5399036890a6ba878abc23da09de9f",
    });
  });
  it("signs an R2 HEAD without a content type (known answer)", () => {
    const s = signRequest({
      ...BASE,
      method: "HEAD",
      payloadSha256: sha256Hex(""),
    });
    expect(s.headers["content-type"]).toBeUndefined();
    expect(s.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261023/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=3d348028cdc62fe2fdfdb07631475866038540907886e2a38678d815561d2186",
    );
  });
  it("percent-encodes each path segment per RFC 3986 and keeps the slashes", () => {
    const s = signRequest({
      ...BASE,
      key: "a b/(c)/d'e",
      method: "GET",
      payloadSha256: sha256Hex(""),
    });
    expect(s.url.endsWith("/dagnam-videos/a%20b/%28c%29/d%27e")).toBe(true);
  });
});
