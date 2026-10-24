export const LARGE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];
export interface Wallpaper {
  id: string;
  dataUrl: string;
  thumbnail: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
}
export type WallpaperInfo = Omit<Wallpaper, "dataUrl">;
export type WallpaperInput = Omit<Wallpaper, "id" | "createdAt">;
export interface WallpaperStore {
  get(id: string): Promise<Wallpaper | null>;
  list(): Promise<WallpaperInfo[]>;
  select(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  set(image: WallpaperInput | null): Promise<void>;
}
export function validWallpaper(value: unknown): value is WallpaperInput {
  if (!value || typeof value !== "object") return false;
  const v = value as WallpaperInput;
  return (
    typeof v.name === "string" &&
    v.name.length <= 180 &&
    Number.isInteger(v.bytes) &&
    v.bytes > 0 &&
    v.bytes <= MAX_IMAGE_BYTES &&
    Number.isInteger(v.width) &&
    v.width > 0 &&
    v.width <= 32768 &&
    Number.isInteger(v.height) &&
    v.height > 0 &&
    v.height <= 32768 &&
    v.width * v.height <= 64_000_000 &&
    typeof v.dataUrl === "string" &&
    /^data:image\/(?:jpeg|png|webp|avif);base64,[A-Za-z0-9+/]+=*$/.test(
      v.dataUrl,
    ) &&
    v.dataUrl.length <= Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100 &&
    typeof v.thumbnail === "string" &&
    v.thumbnail.length < 300_000 &&
    /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(v.thumbnail)
  );
}
async function message(type: string, fields: Record<string, unknown> = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...fields });
  if (!result?.ok)
    throw new Error(
      result?.error || "Couldn’t update the wallpaper. Try again.",
    );
  return result;
}
export const wallpaperStore: WallpaperStore = {
  async get(id) {
    return (await message("wallpaper-get", { id })).image;
  },
  async list() {
    return (await message("wallpaper-list")).images;
  },
  async select(id) {
    await message("wallpaper-select", { id });
  },
  async remove(id) {
    await message("wallpaper-remove", { id });
  },
  async set(image) {
    await message("wallpaper-set", { image });
  },
};
