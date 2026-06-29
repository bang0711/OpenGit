// Image-file detection + MIME mapping. Shared by the main process (to build
// data URLs from git blobs) and the renderer (to decide image vs text diff).
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** MIME type for an image path, or null if the extension isn't an image. */
export function imageMime(file: string): string | null {
  const ext = file.split(".").pop()?.toLowerCase();
  return ext ? (MIME[ext] ?? null) : null;
}

/** True when the path looks like a renderable image. */
export function isImagePath(file: string): boolean {
  return imageMime(file) !== null;
}
