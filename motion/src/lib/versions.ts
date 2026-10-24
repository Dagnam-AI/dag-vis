const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `<base>-<yyyymmdd>-v<N><ext>`: N is one more than the highest N already in `existing`, so an earlier render is never overwritten. */
export function nextVersionedName(
  existing: readonly string[],
  base: string,
  date: string,
  ext: string,
): string {
  const re = new RegExp(`^${escapeRegExp(base)}-\\d{8}-v(\\d+)\\.`);
  let max = 0;
  for (const name of existing) {
    const m = re.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${base}-${date}-v${String(max + 1)}${ext}`;
}

export const utcDateStamp = (d: Date): string =>
  d.toISOString().slice(0, 10).replaceAll("-", "");
