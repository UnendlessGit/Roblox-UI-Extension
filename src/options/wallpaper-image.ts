import {
  IMAGE_TYPES,
  LARGE_IMAGE_BYTES,
  MAX_IMAGE_BYTES,
  type WallpaperInput,
} from "../core/wallpaper";
export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn’t read this image."));
    reader.readAsDataURL(blob);
  });
}
async function bitmap(file: Blob) {
  if (!IMAGE_TYPES.includes(file.type) || !file.size)
    throw new Error("Choose a JPG, PNG, WebP or AVIF image.");
  if (file.size > 128 * 1024 * 1024)
    throw new Error(
      "This file is too large to open safely. Choose an image smaller than 128 MB.",
    );
  const image = await createImageBitmap(file).catch(() => {
    throw new Error("This image couldn’t be opened. Try another image.");
  });
  if (
    image.width * image.height > 64_000_000 ||
    image.width > 32768 ||
    image.height > 32768
  ) {
    image.close();
    throw new Error("Choose an image smaller than 64 megapixels.");
  }
  return image;
}
async function render(
  image: ImageBitmap,
  width: number,
  height: number,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Couldn’t optimize this image.")),
      "image/webp",
      quality,
    ),
  );
  canvas.width = canvas.height = 1;
  return blob;
}
export async function inspectImage(file: File) {
  const image = await bitmap(file);
  try {
    const scale = Math.min(1, 320 / image.width, 180 / image.height);
    const thumbnail = await dataUrl(
      await render(
        image,
        Math.max(1, Math.round(image.width * scale)),
        Math.max(1, Math.round(image.height * scale)),
        0.75,
      ),
    );
    return {
      name: file.name.slice(0, 180),
      width: image.width,
      height: image.height,
      bytes: file.size,
      thumbnail,
    };
  } finally {
    image.close();
  }
}
export function needsOptimization(info: {
  bytes: number;
  width: number;
  height: number;
}) {
  return (
    info.bytes > LARGE_IMAGE_BYTES ||
    Math.max(info.width, info.height) > 3840 ||
    info.width * info.height > 8_300_000
  );
}
export async function prepareWallpaper(
  file: File,
  optimize: boolean,
): Promise<WallpaperInput> {
  let blob: Blob = file;
  let width: number, height: number;
  const image = await bitmap(file);
  try {
    width = image.width;
    height = image.height;
    if (optimize) {
      const scale = Math.min(
        1,
        3840 / Math.max(width, height),
        Math.sqrt(8_300_000 / (width * height)),
      );
      const w = Math.max(1, Math.round(width * scale)),
        h = Math.max(1, Math.round(height * scale));
      const candidate = await render(image, w, h, 0.9);
      if (scale < 1 || candidate.size < file.size) {
        blob = candidate;
        width = w;
        height = h;
      }
    }
  } finally {
    image.close();
  }
  if (blob.size > MAX_IMAGE_BYTES)
    throw new Error(
      "The saved copy must be under 32 MB. Choose Compress image or a smaller file.",
    );
  const info = await inspectImage(
    new File([blob], file.name, { type: blob.type }),
  );
  return { ...info, width, height, dataUrl: await dataUrl(blob) };
}
