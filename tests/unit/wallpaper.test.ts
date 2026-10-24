import { describe, it, expect } from "vitest";
import { DEFAULTS, normalizeSettings } from "../../src/core/settings";
import { MAX_IMAGE_BYTES, validWallpaper } from "../../src/core/wallpaper";
import { needsOptimization } from "../../src/options/wallpaper-image";
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
