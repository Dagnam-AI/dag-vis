#!/usr/bin/env bash
# Assert what an `npm pack` tarball ships. Shared by ci.yml (the package job)
# and release.yml (the publish job), so the tarball that is published is held
# to exactly the assertions the tarball CI smoke-tested was.
#
#   assert-tarball.sh <path-to-tarball>
#
# The fonts ARE the determinism: a tarball without them renders text in
# whatever the host has. `files` in package.json is an allow-list; the negative
# check guards against someone widening it (tests, sources, coverage output) or
# re-enabling source maps whose sources would not ship.
set -euo pipefail

tarball="${1:?usage: assert-tarball.sh <tarball>}"
listing=$(tar -tzf "$tarball")

for f in \
  dist/node/fonts/Inter-Regular.ttf dist/node/fonts/Inter-Bold.ttf dist/node/fonts/OFL.txt \
  dist/node/fonts/Unbounded-Regular.ttf dist/node/fonts/OFL-Unbounded.txt \
  dist/node/fonts/moonhouse/moonhouse.ttf dist/node/fonts/moonhouse/LICENSE-NOTE.txt NOTICE \
  bin/dag-vis.mjs dist/index.js dist/index.d.ts dist/node/index.js dist/node/index.d.ts \
  dist/animate/index.js dist/animate/index.d.ts dist/react/index.js dist/react/index.d.ts \
  dist/export/vendor/mp4-muxer.mjs dist/export/vendor/webm-muxer.mjs \
  LICENSE README.md package.json; do
  echo "$listing" | grep -qx "package/$f" || { echo "::error::$f missing from the tarball"; exit 1; }
done

if echo "$listing" | grep -E '^package/(tests|src|coverage|\.github)/|\.map$'; then
  echo "::error::the tarball contains files that must not ship (listed above)"
  exit 1
fi

echo "tarball ok: $(echo "$listing" | wc -l | tr -d ' ') files"
