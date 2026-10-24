export interface Settings {
  enabled: boolean;
  disabledSites: string[];
  reducedMotion: boolean;
  reducedTransparency: boolean;
  hideUpsells: boolean;
  hideSponsored: boolean;
  showFriendActivity: boolean;
  showFriendsList: boolean;
  showChat: boolean;
  glassEnabled: boolean;
  glassInteractive: boolean;
  glassRefraction: number;
  glassBlur: number;
  glassOpacity: number;
  glassSaturation: number;
  glassAberration: number;
  glassHighlight: number;
  homeWallpaperId: string;
  homeWallpaperRevision: string;
  homeWallpaperBlur: boolean;
  homeWallpaperBlurAmount: number;
  homeWallpaperDim: number;
  homeWallpaperFit: "cover" | "contain";
  homeWallpaperX: number;
  homeWallpaperY: number;
  homeWallpaperBrightness: number;
  homeWallpaperSaturation: number;
  homeWallpaperFade: number;
  homeWallpaperExtend: boolean;
  homeWallpaperExtendX: number;
  homeWallpaperExtendY: number;
  homeWallpaperExtendBlur: number;
  homeWallpaperExtendOpacity: number;
  homeWallpaperExtendSaturation: number;
  homeWallpaperExtendFade: number;
}
export const GLASS_RANGES = {
  glassRefraction: [0, 100, 1],
  glassBlur: [0, 30, 1],
  glassOpacity: [0, 90, 1],
  glassSaturation: [0, 200, 1],
  glassAberration: [0, 3, 0.1],
  glassHighlight: [0, 20, 1],
} as const;
export const WALLPAPER_RANGES = {
  homeWallpaperBlurAmount: [0, 40],
  homeWallpaperDim: [0, 80],
  homeWallpaperX: [0, 100],
  homeWallpaperY: [0, 100],
  homeWallpaperBrightness: [25, 150],
  homeWallpaperSaturation: [0, 200],
  homeWallpaperFade: [0, 100],
  homeWallpaperExtendX: [0, 250],
  homeWallpaperExtendY: [0, 1000],
  homeWallpaperExtendBlur: [0, 100],
  homeWallpaperExtendOpacity: [0, 100],
  homeWallpaperExtendSaturation: [0, 200],
  homeWallpaperExtendFade: [0, 100],
} as const;
export type WallpaperNumber = keyof typeof WALLPAPER_RANGES;
export type GlassNumber = keyof typeof GLASS_RANGES;
export type ToggleSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];
export const DEFAULTS: Settings = {
  enabled: true,
  disabledSites: [],
  reducedMotion: false,
  reducedTransparency: false,
  hideUpsells: false,
  hideSponsored: false,
  showFriendActivity: true,
  showFriendsList: true,
  showChat: false,
  glassEnabled: true,
  glassInteractive: false,
  glassRefraction: 100,
  glassBlur: 20,
  glassOpacity: 0,
  glassSaturation: 140,
  glassAberration: 2,
  glassHighlight: 20,
  homeWallpaperId: "",
  homeWallpaperRevision: "",
  homeWallpaperBlur: false,
  homeWallpaperBlurAmount: 20,
  homeWallpaperDim: 20,
  homeWallpaperFit: "cover",
  homeWallpaperX: 50,
  homeWallpaperY: 50,
  homeWallpaperBrightness: 100,
  homeWallpaperSaturation: 100,
  homeWallpaperFade: 45,
  homeWallpaperExtend: true,
  homeWallpaperExtendX: 80,
  homeWallpaperExtendY: 320,
  homeWallpaperExtendBlur: 60,
  homeWallpaperExtendOpacity: 55,
  homeWallpaperExtendSaturation: 120,
  homeWallpaperExtendFade: 80,
};
export function normalizeSettings(value: unknown): Settings {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const settings = { ...DEFAULTS };
  if (
    typeof raw.homeWallpaperId === "string" &&
    /^[a-f0-9-]{36}$/.test(raw.homeWallpaperId)
  )
    settings.homeWallpaperId = raw.homeWallpaperId;
  if (
    typeof raw.homeWallpaperRevision === "string" &&
    /^[a-f0-9-]{36}$/.test(raw.homeWallpaperRevision)
  )
    settings.homeWallpaperRevision = raw.homeWallpaperRevision;
  if (raw.homeWallpaperFit === "cover" || raw.homeWallpaperFit === "contain")
    settings.homeWallpaperFit = raw.homeWallpaperFit;
  for (const key of Object.keys(WALLPAPER_RANGES) as WallpaperNumber[]) {
    const value = raw[key],
      [min, max] = WALLPAPER_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value))
      settings[key] = Math.round(Math.max(min, Math.min(max, value)));
  }
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (typeof DEFAULTS[key] === "boolean" && typeof raw[key] === "boolean")
      (settings[key] as boolean) = raw[key] as boolean;
  }
  for (const key of Object.keys(GLASS_RANGES) as GlassNumber[]) {
    const n = raw[key];
    if (typeof n === "number" && Number.isFinite(n)) {
      const [min, max, step] = GLASS_RANGES[key];
      settings[key] = Number(
        (Math.round(Math.max(min, Math.min(max, n)) / step) * step).toFixed(2),
      );
    }
  }
  // Replace the previous untouched optics preset; retain any customized profile.
  const previousGlass = {
    glassRefraction: 42,
    glassBlur: 8,
    glassOpacity: 38,
    glassSaturation: 120,
    glassAberration: 0.7,
    glassHighlight: 2,
  };
  if (Object.entries(previousGlass).every(([key, value]) => raw[key] === value))
    for (const key of Object.keys(previousGlass) as GlassNumber[])
      settings[key] = DEFAULTS[key];
  settings.disabledSites = Array.isArray(raw.disabledSites)
    ? [
        ...new Set(
          raw.disabledSites.filter(
            (s): s is string =>
              typeof s === "string" && /^(?:[a-z0-9-]+\.)*roblox\.com$/.test(s),
          ),
        ),
      ].slice(0, 100)
    : [];
  // The retired interactiveAvatar key is intentionally discarded during migration.
  return settings;
}
export interface SettingsStore {
  get(): Promise<Settings>;
  set(patch: Partial<Settings>): Promise<void>;
  subscribe(listener: (settings: Settings) => void): () => void;
}
export const settingsStore: SettingsStore = {
  async get() {
    return normalizeSettings(
      (await chrome.storage.local.get("settings")).settings,
    );
  },
  async set(patch) {
    const result = await chrome.runtime.sendMessage({
      type: "settings-patch",
      patch,
    });
    if (!result?.ok) throw new Error("Settings could not be saved");
  },
  subscribe(listener) {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes.settings)
        listener(normalizeSettings(changes.settings.newValue));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  },
};
export function glassSignature(s: Settings) {
  return JSON.stringify([
    s.glassEnabled,
    s.glassInteractive,
    s.reducedMotion,
    s.reducedTransparency,
    s.glassRefraction,
    s.glassBlur,
    s.glassOpacity,
    s.glassSaturation,
    s.glassAberration,
    s.glassHighlight,
  ]);
}
