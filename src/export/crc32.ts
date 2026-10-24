// Read through a DataView so an in-range lookup is a plain number (no `| undefined`).
const TABLE = new DataView(new ArrayBuffer(256 * 4));
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE.setUint32(n * 4, c >>> 0, true);
}

/** CRC-32 (IEEE 802.3), as used by PNG chunks and ZIP entries. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes)
    c = TABLE.getUint32(((c ^ b) & 0xff) * 4, true) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
