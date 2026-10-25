// The one rule for a video's name, shared by every script: it is a folder name
// under src/videos/ and out/, a prefix of every render's file name and a key
// segment in the bucket, so it is lower-case words and digits joined by single
// hyphens. No other spelling reaches the file system or the network.
const VIDEO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const VIDEO_NAME_RULE =
  "lower-case letters and digits joined by single hyphens";

export const isVideoSlug = (video: string): boolean => VIDEO_NAME.test(video);

/** `video` itself when it is a usable name; otherwise throws a message that states the rule. */
export function requireVideoName(video: string | undefined): string {
  if (video !== undefined && isVideoSlug(video)) return video;
  throw new Error(
    `a video name (${VIDEO_NAME_RULE}) is required${
      video === undefined ? "" : `, got "${video}"`
    }`,
  );
}
