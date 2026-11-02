import type { CoverLookInput } from "../../src/scene/cover-look-types.js";

/** The course family of the verification seeds: one chapter's lessons. */
export const FAMILY =
  "course:the-complete-ai-crash-course/mathematical-foundations";

/** The six verification seeds: one independent post and five ordered lessons of one family. */
export const SEEDS: readonly {
  item: string;
  family: string | null;
  index: number;
  count: number;
}[] = [
  { item: "neural-network-fundamentals", family: null, index: 0, count: 1 },
  { item: "linear-algebra", family: FAMILY, index: 0, count: 5 },
  { item: "calculus", family: FAMILY, index: 1, count: 5 },
  { item: "probability-and-statistics", family: FAMILY, index: 2, count: 5 },
  { item: "ab-testing", family: FAMILY, index: 3, count: 5 },
  { item: "information-theory", family: FAMILY, index: 4, count: 5 },
];

/** `n` distinct item keys, each its own family. */
export function manySeeds(n: number): CoverLookInput[] {
  return Array.from({ length: n }, (_, i) => ({
    item: `post-${i}`,
    theme: "dark",
    variant: "banner",
  }));
}
