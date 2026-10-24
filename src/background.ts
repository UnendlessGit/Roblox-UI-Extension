import { checkRelease, startReleaseChecks } from "./update-checker";
import { ResourceCache } from "./core/resource-cache";
import { allowedResource, type ResourceKind } from "./core/bridge";
import { normalizeSettings } from "./core/settings";
import { validWallpaper } from "./core/wallpaper";
import { startDevelopmentReload } from "./dev/reload";
import {
  readWallpaper,
  writeWallpaper,
  listWallpapers,
  deleteWallpaper,
} from "./core/wallpaper-db";
startReleaseChecks();
const resources = new ResourceCache();
const pending = new Map<string, Promise<unknown>>();
let settingsWrites = Promise.resolve();
if (__RC_DEV_ENDPOINT__)
  startDevelopmentReload(
    __RC_DEV_ENDPOINT__,
    __RC_BUILD__,
    () => settingsWrites,
  );
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "check-release") {
    if (sender.id !== chrome.runtime.id) {
      respond({ ok: false });
      return;
    }
    void checkRelease(message.force === true).then(
      (state) => respond({ ok: true, state }),
      () => respond({ ok: false }),
    );
    return true;
  }
  if (
    [
      "wallpaper-get",
      "wallpaper-list",
      "wallpaper-set",
      "wallpaper-select",
      "wallpaper-remove",
    ].includes(message?.type)
  ) {
    if (sender.id !== chrome.runtime.id) {
      respond({ ok: false, error: "Not permitted" });
      return;
    }
    const validId =
      typeof message.id === "string" && /^[a-f0-9-]{36}$/.test(message.id);
    if (message.type === "wallpaper-get") {
      if (!validId) {
        respond({ ok: false, error: "Invalid wallpaper" });
        return;
      }
      void readWallpaper(message.id).then(
        (image) => respond({ ok: true, image }),
        () => respond({ ok: false, error: "Wallpaper unavailable" }),
      );
    } else if (message.type === "wallpaper-list") {
      void listWallpapers().then(
        (images) => respond({ ok: true, images }),
        () => respond({ ok: false, error: "Couldn’t load saved images" }),
      );
    } else {
      if (
        message.type === "wallpaper-set"
          ? message.image !== null && !validWallpaper(message.image)
          : !validId &&
            !(message.type === "wallpaper-select" && message.id === "")
      ) {
        respond({
          ok: false,
          error: "This image cannot be saved. Try compressing it first.",
        });
        return;
      }
      settingsWrites = settingsWrites
        .then(async () => {
          const current = normalizeSettings(
            (await chrome.storage.local.get("settings")).settings,
          );
          let nextId = current.homeWallpaperId;
          let added: string | undefined;
          let removed: Awaited<ReturnType<typeof readWallpaper>> = null;
          if (message.type === "wallpaper-set") {
            if (message.image) {
              if ((await listWallpapers()).length >= 100)
                throw new Error(
                  "Your gallery is full. Delete an image before adding another.",
                );
              const image = {
                ...message.image,
                id: crypto.randomUUID(),
                createdAt: Date.now(),
              };
              await writeWallpaper(image);
              added = image.id;
              nextId = image.id;
            } else nextId = "";
          } else if (message.type === "wallpaper-select") {
            if (
              message.id &&
              !(await listWallpapers()).some((image) => image.id === message.id)
            )
              throw new Error("That image is no longer saved.");
            nextId = message.id;
          } else {
            removed = await readWallpaper(message.id);
            await deleteWallpaper(message.id);
            if (nextId === message.id) nextId = "";
          }
          try {
            await chrome.storage.local.set({
              settings: normalizeSettings({
                ...current,
                homeWallpaperId: nextId,
                homeWallpaperRevision: crypto.randomUUID(),
              }),
            });
          } catch (error) {
            if (added) await deleteWallpaper(added);
            if (removed) await writeWallpaper(removed);
            throw error;
          }
          respond({ ok: true });
        })
        .catch((error) =>
          respond({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Couldn’t save the wallpaper. Try compressing it first.",
          }),
        );
    }
    return true;
  }
  if (message?.type === "settings-patch" && sender.id === chrome.runtime.id) {
    settingsWrites = settingsWrites
      .then(async () => {
        const current = normalizeSettings(
          (await chrome.storage.local.get("settings")).settings,
        );
        await chrome.storage.local.set({
          settings: normalizeSettings({
            ...current,
            ...message.patch,
            homeWallpaperId:
              message.patch?.homeWallpaperId === ""
                ? ""
                : current.homeWallpaperId,
            homeWallpaperRevision: current.homeWallpaperRevision,
          }),
        });
        respond({ ok: true });
      })
      .catch(() => {
        respond({ ok: false, error: "Settings could not be saved" });
      });
    return true;
  }
  if (message?.type === "open-settings" && sender.id === chrome.runtime.id) {
    void chrome.runtime.openOptionsPage();
    respond({ ok: true });
    return;
  }
  if (message?.type !== "resource") return;
  let senderAllowed = false;
  try {
    senderAllowed =
      !!sender.tab &&
      /(^|\.)roblox\.com$/.test(new URL(sender.url || "").hostname);
  } catch {
    /* reject unknown senders */
  }
  if (!senderAllowed || !allowedResource(message.url, message.kind)) {
    respond({ ok: false, error: "Resource not permitted" });
    return;
  }
  const key = `${message.kind}:${message.url}`;
  const cached = resources.get(key);
  if (cached !== undefined) {
    respond({ ok: true, data: cached });
    return;
  }
  const request =
    pending.get(key) ||
    load(message.url, message.kind).then((data) => {
      const thumbnail =
        new URL(message.url).hostname === "thumbnails.roblox.com";
      const complete =
        message.kind !== "json" ||
        !thumbnail ||
        ((!data?.state || data.state === "Completed") &&
          (!data?.data ||
            data.data.every(
              (entry: { state?: string }) => entry.state === "Completed",
            )));
      if (complete)
        resources.set(
          key,
          data,
          new URL(message.url).hostname === "thumbnails.roblox.com"
            ? 60_000
            : 300_000,
        );
      return data;
    });
  pending.set(key, request);
  request
    .then(
      (data) => respond({ ok: true, data }),
      () => respond({ ok: false, error: "Roblox resource unavailable" }),
    )
    .finally(() => pending.delete(key));
  return true;
});
async function load(url: string, kind: ResourceKind) {
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  if (!response.ok || !allowedResource(response.url, kind))
    throw new Error("Unavailable");
  if (Number(response.headers.get("content-length")) > 12 * 1024 * 1024)
    throw new Error("Resource too large");
  if (!response.body) throw new Error("Empty resource");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Resource too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const buffer = bytes.buffer;
  if (kind !== "image") {
    const text = new TextDecoder().decode(buffer);
    return kind === "json" ? JSON.parse(text) : text;
  }
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!type || !["image/png", "image/jpeg", "image/webp"].includes(type))
    throw new Error("Unsupported image");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${type};base64,${btoa(binary)}`;
}
