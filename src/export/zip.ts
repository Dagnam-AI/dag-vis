import { VisError } from "../core/index.js";
import { crc32 } from "./crc32.js";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const DOS_DATE_1980 = 0x21; // 1980-01-01, so the archive is reproducible

interface EncodedEntry {
  name: Uint8Array;
  data: Uint8Array;
}

const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const NO_ZIP64 = "this writer has no ZIP64 support";

/**
 * The classic format stores counts in 16 bits and sizes and offsets in 32. The
 * DataView setters would wrap silently into a corrupt archive, so every limit
 * is checked, from lengths alone, before any byte is written.
 */
function checkLimits(items: readonly EncodedEntry[]): void {
  if (items.length > MAX_16)
    throw new VisError(
      `zipStore entries has ${items.length} items; a ZIP holds at most ${MAX_16} (${NO_ZIP64})`,
    );
  let offset = 0;
  let directory = 0;
  for (const [i, { name, data }] of items.entries()) {
    if (name.length > MAX_16)
      throw new VisError(
        `zipStore entries[${i}].name is ${name.length} UTF-8 bytes; the limit is ${MAX_16} (${NO_ZIP64})`,
      );
    const size = data.length;
    if (size > MAX_32)
      throw new VisError(
        `zipStore entries[${i}].data is ${size} bytes; the limit is 4 GiB minus 1 (${NO_ZIP64})`,
      );
    if (offset > MAX_32)
      throw new VisError(
        `zipStore entries[${i}] would start at offset ${offset}, past 4 GiB (${NO_ZIP64})`,
      );
    offset += LOCAL_HEADER + name.length + size;
    directory += CENTRAL_HEADER + name.length;
  }
  if (offset > MAX_32)
    throw new VisError(
      `zipStore central directory starts at offset ${offset}, past 4 GiB (${NO_ZIP64})`,
    );
  if (offset + directory > MAX_32)
    throw new VisError(
      `zipStore central directory ends at ${offset + directory}, past 4 GiB (${NO_ZIP64})`,
    );
}

/** Minimal PKZIP writer, method 0 (store). PNG frames are already compressed; deflating again buys nothing. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const items = entries.map((e) => ({
    name: enc.encode(e.name),
    data: e.data,
  }));
  checkLimits(items);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data } of items) {
    const crc = crc32(data);
    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, DOS_DATE_1980, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    parts.push(local, name, data);
    const cd = new Uint8Array(46);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, DOS_DATE_1980, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
