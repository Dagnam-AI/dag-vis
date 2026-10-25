import { readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// What the two structure tests share: the repository's root and the import scanner.
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SRC = join(ROOT, "src");

/**
 * Every module specifier: static `from "..."`, side-effect `import "..."`, dynamic
 * `import("...")` (also with line or block comments before the string, single quotes
 * or backticks) and `import x = require("...")`.
 *
 * A linear scan, not one regex: a keyword is found with a plain `\b(from|import|require)\b`
 * and everything after it is read by hand (whitespace, one `(`, comments, then a quote),
 * so no quantifier is nested and no input can make it backtrack. Each comment or
 * string is crossed once, because the keyword search resumes after what was read.
 * Keywords inside a comment that was read after another keyword are skipped with it; a
 * commented-out import elsewhere still counts (fails closed).
 */
export function importSpecifiers(text: string): string[] {
  const specs: string[] = [];
  const keyword = /\b(from|import|require)\b/g;
  const isSpace = (c: string | undefined): boolean =>
    c !== undefined && /\s/.test(c);
  for (let m = keyword.exec(text); m !== null; m = keyword.exec(text)) {
    let i = keyword.lastIndex;
    // `require` only as `= require(...)`; a bare word `require` is not an import.
    if (m[1] === "require") {
      let k = m.index - 1;
      while (isSpace(text[k])) k--;
      if (text[k] !== "=") continue;
    }
    while (isSpace(text[i])) i++;
    if (text[i] === "(") i++;
    for (;;) {
      while (isSpace(text[i])) i++;
      if (text.startsWith("/*", i)) {
        const end = text.indexOf("*/", i + 2);
        if (end === -1) return specs;
        i = end + 2;
      } else if (text.startsWith("//", i)) {
        const end = text.indexOf("\n", i);
        if (end === -1) return specs;
        i = end + 1;
      } else break;
    }
    keyword.lastIndex = i;
    const quote = text[i];
    if (quote !== '"' && quote !== "'" && quote !== "`") continue;
    const close = text.indexOf(quote, i + 1);
    if (close === -1) continue;
    const spec = text.slice(i + 1, close);
    if (spec === "" || /["'`]/.test(spec)) continue;
    specs.push(spec);
    keyword.lastIndex = close + 1;
  }
  return specs;
}

/** Every file under `dir`; `skip` names top-level folders of `dir` only, never a folder of the same name deeper down. */
export function walk(dir: string, skip: readonly string[] = []): string[] {
  return readdirSync(dir)
    .filter((name) => !skip.includes(name))
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

/** The file a relative, absolute or `file:` specifier names, resolved against the importing file; undefined for a package name. */
export function resolveSpec(file: string, spec: string): string | undefined {
  if (spec.startsWith("file:")) return fileURLToPath(spec);
  return spec.startsWith(".") || isAbsolute(spec)
    ? resolve(dirname(file), spec)
    : undefined;
}

export const inside = (target: string, dir: string): boolean => {
  const rel = relative(dir, target);
  return rel.split(sep)[0] !== ".." && !isAbsolute(rel);
};
