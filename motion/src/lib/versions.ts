const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `<base>-<yyyymmdd>-v<N><ext>`: N is one more than the highest N already in `existing`, so an earlier render is never overwritten. */
export function nextVersionedName(
  existing: readonly string[],
  base: string,
  date: string,
  ext: string,
): string {
  if (!ext.startsWith("."))
    throw new Error(`ext must start with a dot, got ${JSON.stringify(ext)}`);
  const re = new RegExp(`^${escapeRegExp(base)}-\\d{8}-v(\\d+)\\.`);
  let max = 0;
  for (const name of existing) {
    const m = re.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  // Past 2^53 the next number is not a number any more (`1e+23`): refuse rather than name a file with it.
  if (!Number.isSafeInteger(max + 1))
    throw new Error(`version ${String(max)} is too large to continue`);
  return `${base}-${date}-v${String(max + 1)}${ext}`;
}

export const utcDateStamp = (d: Date): string =>
  d.toISOString().slice(0, 10).replaceAll("-", "");
