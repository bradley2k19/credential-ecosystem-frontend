import type { ImageUpload } from "@/lib/api";

export type ImagePurpose = "logo" | "seal" | "signature";

// Images are scaled down to fit these boxes (never enlarged).
const maxDimensions: Record<ImagePurpose, { width: number; height: number }> = {
  logo: { width: 800, height: 800 },
  seal: { width: 600, height: 600 },
  signature: { width: 600, height: 250 },
};

// The backend accepts up to 500 KB; aim below that so base64 and rounding never push a file over.
const TARGET_BYTES = 450 * 1024;
const JPEG_START_QUALITY = 0.85;
const JPEG_MIN_QUALITY = 0.5;
const MIN_SIDE = 40;

export interface PreparedImage extends ImageUpload {
  sizeBytes: number;
  width: number;
  height: number;
  /** data: URL for previews. */
  previewUrl: string;
}

export class ImagePreparationError extends Error {}

const signatures: Record<ImageUpload["mimeType"], number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

/** Reads the file's real type from its first bytes, so a renamed file is refused before decoding. */
async function detectType(file: File): Promise<ImageUpload["mimeType"] | null> {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  for (const [type, bytes] of Object.entries(signatures) as [ImageUpload["mimeType"], number[]][]) {
    if (bytes.every((byte, index) => header[index] === byte)) return type;
  }
  return null;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new ImagePreparationError("The image could not be read. It may be corrupted.")); };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImagePreparationError("The image could not be processed."))), type, quality);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImagePreparationError("The image could not be processed."));
    reader.readAsDataURL(blob);
  });
}

/** Makes near-white pixels transparent, fading the alpha over a short range so edges stay smooth. */
function removeWhiteBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const solid = 205;
  const clear = 235;
  for (let index = 0; index < data.length; index += 4) {
    const lightness = Math.min(data[index], data[index + 1], data[index + 2]);
    if (lightness >= clear) data[index + 3] = 0;
    else if (lightness > solid) data[index + 3] = Math.round(data[index + 3] * ((clear - lightness) / (clear - solid)));
  }
  context.putImageData(imageData, 0, 0);
}

function render(image: HTMLImageElement, width: number, height: number, whiteToTransparent: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImagePreparationError("Your browser could not process the image.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  if (whiteToTransparent) removeWhiteBackground(context, width, height);
  return canvas;
}

/**
 * Prepares a logo, seal or signature for upload: checks the real file type, scales it down to fit the
 * purpose's box, and re-encodes it (PNG keeps transparency; JPEG at quality 0.85). If the result is still
 * over 450 KB, quality (JPEG) and then size are reduced until it fits.
 */
export async function prepareImageForUpload(file: File, purpose: ImagePurpose, options: { removeWhiteBackground?: boolean } = {}): Promise<PreparedImage> {
  const sourceType = await detectType(file);
  if (!sourceType) throw new ImagePreparationError("Only PNG and JPEG images are accepted.");

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) throw new ImagePreparationError("The image could not be read. It may be corrupted.");

  const box = maxDimensions[purpose];
  let scale = Math.min(1, box.width / image.naturalWidth, box.height / image.naturalHeight);
  // Transparency needs PNG, so removing the background always produces a PNG.
  const outputType: ImageUpload["mimeType"] = options.removeWhiteBackground ? "image/png" : sourceType;

  for (;;) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = render(image, width, height, Boolean(options.removeWhiteBackground));

    let quality = JPEG_START_QUALITY;
    let blob = await canvasToBlob(canvas, outputType, outputType === "image/jpeg" ? quality : undefined);
    while (outputType === "image/jpeg" && blob.size > TARGET_BYTES && quality > JPEG_MIN_QUALITY) {
      quality = Math.max(JPEG_MIN_QUALITY, quality - 0.1);
      blob = await canvasToBlob(canvas, outputType, quality);
    }

    if (blob.size <= TARGET_BYTES) {
      const previewUrl = await blobToDataUrl(blob);
      return { data: previewUrl.slice(previewUrl.indexOf(",") + 1), mimeType: outputType, sizeBytes: blob.size, width, height, previewUrl };
    }
    if (Math.min(width, height) <= MIN_SIDE) throw new ImagePreparationError("The image could not be made small enough. Try a simpler image.");
    scale *= 0.8;
  }
}

export function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

/** Light checkerboard behind image previews, so transparent areas are visible. */
export const checkerboardClasses = "bg-white bg-[conic-gradient(#e2e8f0_25%,#ffffff_0_50%,#e2e8f0_0_75%,#ffffff_0)] bg-[length:16px_16px]";
