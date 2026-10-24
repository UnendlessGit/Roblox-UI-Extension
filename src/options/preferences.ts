import { element, link } from "../core/dom";
import {
  DEFAULTS,
  GLASS_RANGES,
  type GlassNumber,
  type ToggleSetting,
  type Settings,
  type SettingsStore,
} from "../core/settings";
import { icon } from "../ui/icons";
import { mountWallpaperSettings } from "./wallpaper-settings";
import type { WallpaperStore } from "../core/wallpaper";
export async function renderPreferences(
  root: HTMLElement,
  store: SettingsStore,
  options: {
    popup?: boolean;
    openFull?: () => void;
    currentHost?: string;
    wallpapers?: WallpaperStore;
  } = {},
) {
  let settings = await store.get();
  root.replaceChildren();
  const brand = element("header", "brand");
  const mark = element("span", "brand-mark");
  mark.setAttribute("aria-hidden", "true");
  const identity = element("div");
  identity.append(
    element("div", "brand-name", "Roblox Cinema"),
    element("div", "brand-caption", "A little less. A lot more Roblox."),
  );
  brand.append(mark, identity);
  root.append(brand);
  if (!options.popup) {
    const title = element("div", "settings-intro");
    title.append(
      element("p", "eyebrow", "MAKE IT YOURS"),
      element("h1", "", "Beautifully simple."),
      element(
        "p",
        "",
        "A quieter space for everything you play, create, and explore.",
      ),
    );
    root.append(title);
  }
  const status = element("p", "save-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const controls = new Map<keyof Settings, HTMLInputElement>();
  let errorTimer: ReturnType<typeof setTimeout>;
  async function save(patch: Partial<Settings>) {
    try {
      await store.set(patch);
      status.textContent = "Saved on this Mac";
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        status.textContent = "";
      }, 2200);
    } catch {
      status.textContent = "Couldn’t save. Please try again.";
      for (const [key, input] of controls) {
        if (input.type === "range") input.value = String(settings[key]);
        else input.checked = !!settings[key];
      }
    }
  }
  function group(label: string) {
    const section = element("section", "settings-section");
    section.append(element("h2", "", label));
    const rows = element("div", "settings-group");
    section.append(rows);
    root.append(section);
    return rows;
  }
  function toggle(
    parent: HTMLElement,
    key: ToggleSetting,
    label: string,
    description: string,
  ) {
    const row = element("label", "setting-row");
    const copy = element("span", "setting-copy");
    copy.append(
      element("span", "setting-label", label),
      element("span", "setting-description", description),
    );
    const input = element("input");
    input.type = "checkbox";
    input.checked = settings[key];
    input.setAttribute("role", "switch");
    input.name = key;
    const pill = element("span", "switch");
    pill.append(input, element("span", "switch-track"));
    row.append(copy, pill);
    parent.append(row);
    controls.set(key, input);
    input.addEventListener("change", () => void save({ [key]: input.checked }));
  }
  const general = group(options.popup ? "Your experience" : "The essentials");
  toggle(
    general,
    "enabled",
    "Enable Cinema",
    "The complete cinematic experience.",
  );
  const disposeWallpaper = mountWallpaperSettings(
    group("Home background"),
    store,
    settings,
    options.wallpapers,
  );
  const home = group("Friends");
  toggle(
    home,
    "showFriendsList",
    "Show friends on Home",
    "Display the full friends strip above Continue.",
  );
  toggle(
    home,
    "showFriendActivity",
    "Show friends below game cards",
    "Show friend portraits on games they are playing. Turn off to show player and rating statistics instead.",
  );
  toggle(
    general,
    "showChat",
    "Show website chat",
    "Display Roblox’s floating chat panel. Messages stay available from the sidebar.",
  );
  const glass = group("Liquid glass");
  toggle(
    glass,
    "glassEnabled",
    "Enable liquid glass",
    "Refraction on the header, search, and transparent menus.",
  );
  toggle(
    glass,
    "glassInteractive",
    "Interactive glass",
    "Mouse movement and elasticity. Off by default; Reduce motion keeps glass still.",
  );
  const labels: Record<GlassNumber, [string, string]> = {
    glassRefraction: ["Refraction", "Strength of the glass bending."],
    glassBlur: [
      "Frosting",
      "Blur behind the glass. Lower values reveal more detail.",
    ],
    glassOpacity: ["Dark tint", "Darkness behind text and controls."],
    glassSaturation: ["Saturation", "Color intensity behind glass."],
    glassAberration: [
      "Color separation",
      "A subtle color fringe at refracted edges.",
    ],
    glassHighlight: [
      "Edge light",
      "Brightness of the rim. Zero removes highlights completely.",
    ],
  };
  for (const key of Object.keys(GLASS_RANGES) as GlassNumber[]) {
    const row = element("label", "setting-row range-row"),
      copy = element("span", "setting-copy"),
      control = element("span", "range-control");
    copy.append(
      element("span", "setting-label", labels[key][0]),
      element("span", "setting-description", labels[key][1]),
    );
    const input = element("input"),
      output = element("output");
    input.type = "range";
    input.name = key;
    input.setAttribute("aria-label", labels[key][0]);
    const [min, max, step] = GLASS_RANGES[key];
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings[key]);
    output.value = input.value;
    input.oninput = () => {
      output.value = input.value;
    };
    input.onchange = () => void save({ [key]: Number(input.value) });
    controls.set(key, input);
    control.append(input, output);
    row.append(copy, control);
    glass.append(row);
  }
  const visual = group("Comfort");
  toggle(
    visual,
    "reducedMotion",
    "Reduce motion",
    "Gentler transitions. Your Mac’s preference is always respected.",
  );
  toggle(
    visual,
    "reducedTransparency",
    "Reduce transparency",
    "Solid surfaces with the same quiet depth.",
  );
  const content = group("Less distraction");
  toggle(
    content,
    "hideUpsells",
    "Hide promotional upsells",
    "Hide identified subscription and referral banners.",
  );
  toggle(
    content,
    "hideSponsored",
    "Hide sponsored placements",
    "Hide clearly identified sponsored cards.",
  );
  if (options.currentHost && /(^|\.)roblox\.com$/.test(options.currentHost)) {
    const site = element("label", "setting-row current-site");
    const text = element("span", "setting-copy");
    text.append(
      element("span", "setting-label", "Enable on this site"),
      element("span", "setting-description", options.currentHost),
    );
    const input = element("input");
    input.type = "checkbox";
    input.checked = !settings.disabledSites.includes(options.currentHost);
    input.setAttribute("aria-label", "Enable on this site");
    input.setAttribute("role", "switch");
    const pill = element("span", "switch");
    pill.append(input, element("span", "switch-track"));
    site.append(text, pill);
    root.append(site);
    input.onchange = () =>
      void save({
        disabledSites: input.checked
          ? settings.disabledSites.filter((h) => h !== options.currentHost)
          : [...settings.disabledSites, options.currentHost!],
      });
  }
  const disabled = element("section", "settings-section");
  const disabledList = element("div", "disabled-sites");
  if (!options.popup) {
    disabled.append(
      element("h2", "", "Site preferences"),
      element(
        "p",
        "section-note",
        "Sites using original Roblox. Everything else uses Cinema.",
      ),
      disabledList,
    );
    root.append(disabled);
  }
  function updateSites() {
    disabledList.replaceChildren();
    if (!settings.disabledSites.length)
      disabledList.append(
        element("p", "empty-note", "Cinema is enabled across Roblox."),
      );
    for (const host of settings.disabledSites) {
      const row = element("div", "disabled-site");
      const enable = element("button", "text-button", "Enable Cinema");
      enable.type = "button";
      enable.onclick = () =>
        void save({
          disabledSites: settings.disabledSites.filter((h) => h !== host),
        });
      row.append(element("span", "", host), enable);
      disabledList.append(row);
    }
  }
  updateSites();
  if (options.popup) {
    const full = element("button", "full-settings", "All settings");
    full.type = "button";
    full.append(icon("arrow", 15));
    full.onclick = options.openFull || (() => {});
    root.append(full);
  } else {
    const footer = element("footer", "settings-footer");
    footer.append(
      element("span", "", "Stored locally. No analytics. No extra account."),
    );
    const reset = element("button", "text-button", "Restore defaults");
    reset.type = "button";
    reset.onclick = () => void save({ ...DEFAULTS, disabledSites: [] });
    footer.append(reset);
    root.append(footer);
    root.append(
      link("Back to Roblox", "https://www.roblox.com/home", "home-link"),
    );
  }
  root.append(status);
  const unsubscribe = store.subscribe((next) => {
    settings = next;
    for (const [key, input] of controls) {
      if (input.type === "range") input.value = String(settings[key]);
      else input.checked = !!settings[key];
    }
    for (const input of controls.values())
      if (input.type === "range")
        (input.nextElementSibling as HTMLOutputElement).value = input.value;
    updateSites();
  });
  return () => {
    unsubscribe();
    disposeWallpaper();
    clearTimeout(errorTimer);
  };
}
