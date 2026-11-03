// Rebuilds the images in docs/demo/ that the CLI cannot make: the cover looks,
// a chapter of lessons, the social card with a look, and the determinism check.
// Run it from the repo root after `npm run build`: node scripts/demo-images.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { COVER_LOOKS, coverLook, coverSvg, ogCard, ribbon } from "@dagnam/vis";
import { renderPng } from "@dagnam/vis/node";

const out = (name) => new URL(`../docs/demo/${name}`, import.meta.url);
const sha = (s) => createHash("sha256").update(s).digest("hex");

// One cover per look: same input, only `look` changes.
for (const look of COVER_LOOKS) {
  const input = {
    family: "tag:ai",
    item: "my-post",
    theme: "dark",
    variant: "card",
    look,
  };
  writeFileSync(out(`cover-${look}.svg`), coverSvg(input));
}

// A chapter: same family and count, each lesson has its own index.
for (let index = 0; index < 4; index++) {
  const input = {
    family: "course:intro",
    item: `lesson-${index + 1}`,
    index,
    count: 4,
    theme: "dark",
    variant: "card",
  };
  writeFileSync(out(`lesson-${index + 1}.svg`), coverSvg(input));
}

// A light cover.
writeFileSync(
  out("cover-light.svg"),
  coverSvg({
    family: "tag:ai",
    item: "my-post",
    theme: "light",
    variant: "card",
    look: "silk",
  }),
);

// The social card with a look as its cover (a PNG, because it carries text).
const card = ogCard({
  title: "Building a reasoning model",
  excerpt: "Data, architecture and training on one GPU.",
  cover: coverLook({
    family: "tag:ai",
    item: "my-post",
    theme: "dark",
    variant: "banner",
    look: "aurora",
  }),
});
writeFileSync(out("og-cover.png"), await renderPng(card, { width: 440 }));

// The wave-mesh ribbon.
writeFileSync(
  out("ribbon.svg"),
  ribbon({ width: 800, height: 300, lines: 24, mesh: true }),
);

// Determinism: the same input twice gives byte-identical SVG.
const a = coverSvg({
  family: "tag:ai",
  item: "my-post",
  theme: "dark",
  variant: "card",
  look: "ember",
});
const b = coverSvg({
  family: "tag:ai",
  item: "my-post",
  theme: "dark",
  variant: "card",
  look: "ember",
});
console.log(sha(a), sha(b), a === b);
