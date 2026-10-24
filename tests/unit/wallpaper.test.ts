import { describe, it, expect, vi } from "vitest";
import {
  DEFAULTS,
  normalizeSettings,
  type SettingsStore,
  type Settings,
} from "../../src/core/settings";
import { MAX_IMAGE_BYTES, validWallpaper } from "../../src/core/wallpaper";
import { needsOptimization } from "../../src/options/wallpaper-image";
import { mountWallpaperSettings } from "../../src/options/wallpaper-settings";
describe("wallpaper safety and defaults", () => {
  it("starts solid black, with optional blur off and cinematic surroundings on", () => {
    expect(DEFAULTS.homeWallpaperId).toBe("");
    expect(DEFAULTS.homeWallpaperBlur).toBe(false);
    expect(DEFAULTS.homeWallpaperExtend).toBe(true);
  });
  it("bounds image and surrounding controls and rejects external image references", () => {
    const settings = normalizeSettings({
      homeWallpaperId: "https://outside.invalid/image.png",
      homeWallpaperFit: "script",
      homeWallpaperExtendY: 90000,
      homeWallpaperExtendBlur: -5,
      homeWallpaperDim: NaN,
      homeWallpaperBrightness: Infinity,
    });
    expect(settings.homeWallpaperId).toBe("");
    expect(settings.homeWallpaperFit).toBe("cover");
    expect(settings.homeWallpaperExtendY).toBe(1000);
    expect(settings.homeWallpaperExtendBlur).toBe(0);
    expect(settings.homeWallpaperDim).toBe(DEFAULTS.homeWallpaperDim);
    expect(settings.homeWallpaperBrightness).toBe(100);
  });
  it("warns on either large bytes or excessive pixel dimensions", () => {
    expect(
      needsOptimization({ bytes: 5 * 1024 * 1024, width: 1200, height: 800 }),
    ).toBe(true);
    expect(needsOptimization({ bytes: 2000, width: 8000, height: 4000 })).toBe(
      true,
    );
    expect(
      needsOptimization({ bytes: 200000, width: 1920, height: 1080 }),
    ).toBe(false);
  });
  it("accepts only bounded inline raster data, never file links, scripts or SVG", () => {
    const image = {
      name: "sample.png",
      width: 100,
      height: 100,
      bytes: 1000,
      dataUrl: "data:image/png;base64,AAAA",
      thumbnail: "data:image/webp;base64,AAAA",
    };
    expect(validWallpaper(image)).toBe(true);
    for (const dataUrl of [
      "file:///Desktop/photo.png",
      "https://outside.invalid/photo.png",
      "data:image/svg+xml;base64,AAAA",
      "javascript:alert(1)",
    ])
      expect(validWallpaper({ ...image, dataUrl })).toBe(false);
    expect(validWallpaper({ ...image, bytes: MAX_IMAGE_BYTES + 1 })).toBe(
      false,
    );
    expect(validWallpaper({ ...image, width: 16000, height: 16000 })).toBe(
      false,
    );
  });
});

describe("wallpaper controls during asynchronous saves", () => {
  for (const failure of [false, true])
    it(
      failure
        ? "restores a toggle when saving fails"
        : "keeps a toggle in its chosen state until a slow save completes",
      async () => {
        const id = "00000000-0000-4000-8000-000000000001";
        let settings = normalizeSettings({ ...DEFAULTS, homeWallpaperId: id });
        let finish: () => void = () => {};
        let notify: (value: Settings) => void = () => {};
        const store: SettingsStore = {
          get: async () => settings,
          subscribe: (listener) => {
            notify = listener;
            return () => {};
          },
          set: (patch) =>
            new Promise<void>((resolve, reject) => {
              finish = () => {
                if (failure) reject(new Error("Couldn’t save this change."));
                else {
                  settings = { ...settings, ...patch } as Settings;
                  resolve();
                }
              };
            }),
        };
        const root = document.createElement("div");
        const dispose = mountWallpaperSettings(root, store, settings, {
          get: async () => null,
          list: async () => [
            {
              id,
              name: "Saved image",
              width: 2,
              height: 2,
              bytes: 12,
              createdAt: 1,
              thumbnail: "data:image/webp;base64,AAAA",
            },
          ],
          set: async () => {},
          select: async () => {},
          remove: async () => {},
        });
        try {
          const toggle = root.querySelector<HTMLInputElement>(
            '[aria-label="Cinematic surroundings"]',
          )!;
          await vi.waitFor(() => expect(toggle.disabled).toBe(false));
          toggle.checked = false;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
          expect(toggle.checked).toBe(false);
          expect(toggle.disabled).toBe(true);
          notify(settings);
          expect(toggle.checked).toBe(false);
          finish();
          await vi.waitFor(() => {
            expect(toggle.disabled).toBe(false);
            expect(toggle.checked).toBe(failure);
          });
          expect(root.querySelector('[role="status"]')!.textContent).toContain(
            failure ? "Couldn’t save" : "Saved",
          );
        } finally {
          dispose();
        }
      },
    );
});
