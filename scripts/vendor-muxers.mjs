#!/usr/bin/env node
// Ships the two video muxers INSIDE dist instead of as dependencies. Both
// packages pull `@types/dom-webcodecs` and `@types/wicg-file-system-access`
// into a consumer's node_modules/@types, which TypeScript auto-includes and
// which breaks DOM-free consumers. Each muxer ships a self-contained ESM build,
// so we copy it to dist/export/vendor/ and point the two dynamic imports in
// the emitted dist/export/video.js at the copy. Fails loudly (exit 1) if a
// specifier is not found, a source is missing, or a bare import is left in a
// vendored file. Run after tsc, from `npm run build`.
//
//   node scripts/vendor-muxers.mjs [distDir] [nodeModulesDir]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [dist = join(root, "dist"), modules = join(root, "node_modules")] =
  process.argv.slice(2);

// A static import/export-from or a dynamic import() of anything not relative.
const BARE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](?![./])[^"']+["']/;

const target = join(dist, "export", "video.js");
let video = readFileSync(target, "utf8");
mkdirSync(join(dist, "export", "vendor"), { recursive: true });

for (const name of ["mp4-muxer", "webm-muxer"]) {
  const source = join(modules, name, "build", `${name}.mjs`);
  const copy = join(dist, "export", "vendor", `${name}.mjs`);
  copyFileSync(source, copy);
  if (BARE_IMPORT.test(readFileSync(copy, "utf8")))
    throw new Error(`${copy} still has a bare import`);
  const specifier = `import("${name}")`;
  if (!video.includes(specifier))
    throw new Error(`${target} has no ${specifier}`);
  video = video.replaceAll(specifier, `import("./vendor/${name}.mjs")`);
  // Any other spelling (single quotes, a static import) would stay bare.
  const left = new RegExp(`(?:from\\s*|import\\s*\\(?\\s*)["']${name}["']`);
  if (left.test(video)) throw new Error(`${target} still imports ${name}`);
}

writeFileSync(target, video);
console.log("vendored mp4-muxer and webm-muxer into dist/export/vendor");
