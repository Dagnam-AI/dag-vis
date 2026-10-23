/** Longest string an error message quotes, and the longest colour accepted. */
export const QUOTE_LIMIT = 80;

/** A value for an error message. Never throws and never runs long, whatever the caller passed. */
export function describeValue(v: unknown): string {
  switch (typeof v) {
    case "string":
      return JSON.stringify(
        v.length > QUOTE_LIMIT ? `${v.slice(0, QUOTE_LIMIT)}...` : v,
      );
    case "number":
    case "bigint":
    case "boolean":
      return String(v);
    default:
      return v === null ? "null" : typeof v;
  }
}
