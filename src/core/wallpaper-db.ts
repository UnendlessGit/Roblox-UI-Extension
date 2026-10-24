import type { Wallpaper, WallpaperInfo } from "./wallpaper";
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("roblox-cinema-images", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("wallpapers"))
        request.result.createObjectStore("wallpapers", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("previews")) {
        const previews = request.result.createObjectStore("previews", {
          keyPath: "id",
        });
        const cursor = request
          .transaction!.objectStore("wallpapers")
          .openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (row) {
            const { dataUrl, ...info } = row.value;
            previews.put({ ...info, createdAt: info.createdAt || Date.now() });
            row.continue();
          }
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
export async function readWallpaper(id: string): Promise<Wallpaper | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("wallpapers")
      .objectStore("wallpapers")
      .get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
export async function listWallpapers(): Promise<WallpaperInfo[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction("previews").objectStore("previews").getAll();
    request.onsuccess = () =>
      resolve(
        request.result.sort(
          (a: WallpaperInfo, b: WallpaperInfo) => b.createdAt - a.createdAt,
        ),
      );
    request.onerror = () => reject(request.error);
  });
}
export async function writeWallpaper(image: Wallpaper) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["wallpapers", "previews"], "readwrite");
    const { dataUrl, ...info } = image;
    transaction.objectStore("wallpapers").put(image);
    transaction.objectStore("previews").put(info);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function deleteWallpaper(id: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["wallpapers", "previews"], "readwrite");
    transaction.objectStore("wallpapers").delete(id);
    transaction.objectStore("previews").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
