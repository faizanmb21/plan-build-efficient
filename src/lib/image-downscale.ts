/**
 * Client-side image downscaling.
 * Resizes any uploaded image to fit within a max dimension and re-encodes
 * it (JPEG/WebP) to keep storage + bandwidth small. Runs entirely in the
 * browser via <canvas>, no server round-trip.
 */

export type DownscaleOptions = {
  /** Max width OR height in pixels. The image is scaled so the longest edge fits. */
  maxDimension?: number;
  /** Output mime type. Defaults to image/jpeg (best size for photos). */
  mimeType?: "image/jpeg" | "image/webp" | "image/png";
  /** 0..1 quality for jpeg/webp. */
  quality?: number;
  /** Skip downscaling if file is already smaller than this many bytes AND under maxDimension. */
  skipIfUnder?: number;
};

const DEFAULTS: Required<DownscaleOptions> = {
  maxDimension: 1600,
  mimeType: "image/jpeg",
  quality: 0.82,
  skipIfUnder: 200 * 1024, // 200KB
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image file"));
    img.src = src;
  });
}

/**
 * Downscale + re-encode an image File. Returns a new File ready to upload.
 * If the source is already small enough, returns the original file unchanged.
 * SVGs and GIFs are returned as-is (no rasterisation).
 */
export async function downscaleImage(
  file: File,
  opts: DownscaleOptions = {},
): Promise<File> {
  const { maxDimension, mimeType, quality, skipIfUnder } = { ...DEFAULTS, ...opts };

  // Pass through formats we don't want to rasterise.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  if (!file.type.startsWith("image/")) return file;

  const dataUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(dataUrl);
    const longest = Math.max(img.width, img.height);

    // Already small enough on both axes AND lightweight → keep original.
    if (longest <= maxDimension && file.size <= skipIfUnder) return file;

    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob) return file;

    // If the "optimised" version is somehow larger, keep the original.
    if (blob.size >= file.size) return file;

    const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.${ext}`, { type: mimeType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(dataUrl);
  }
}
