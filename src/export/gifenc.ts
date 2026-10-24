import * as namespace from "gifenc";

type Gifenc = typeof namespace;

/**
 * gifenc has no `exports` map: bundlers read its ES `module` file and see named
 * exports, but plain Node loads the CommonJS `main` file, where only `default`
 * carries them. Accept either shape.
 */
export function pickGifenc(ns: Gifenc | { default: Gifenc }): Gifenc {
  return "GIFEncoder" in ns ? ns : ns.default;
}

export const gifenc = pickGifenc(namespace);
