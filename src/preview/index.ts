import "./preview.css";
import "../options/options.css";
import { start } from "../content/index";
import {
  DEFAULTS,
  normalizeSettings,
  type Settings,
  type SettingsStore,
} from "../core/settings";
import type { ResourceBridge } from "../core/bridge";
import { element } from "../core/dom";
import { mountFixture, previewUrls, type PreviewPage } from "./fixtures";
import { renderPreferences } from "../options/preferences";
let settings: Settings = normalizeSettings(
  JSON.parse(localStorage.getItem("cinema-preview-settings") || "null"),
);
const listeners = new Set<(s: Settings) => void>();
const store: SettingsStore = {
  async get() {
    return settings;
  },
  async set(patch) {
    settings = normalizeSettings({ ...settings, ...patch });
    localStorage.setItem("cinema-preview-settings", JSON.stringify(settings));
    listeners.forEach((listener) => listener(settings));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
const resources: ResourceBridge = {
  async get<T>(url: string) {
    if (url.includes("/users/avatar?")) return { data: [] } as T;
    throw new Error("Preview resource unavailable");
  },
};
const toolbar = element("aside", "preview-toolbar");
toolbar.dataset.rcOwned = "";
toolbar.setAttribute("aria-label", "Design preview controls");
const label = element("span", "preview-label", "DESIGN PREVIEW");
const select = element("select");
select.setAttribute("aria-label", "Preview page");
for (const [key, name] of Object.entries({
  home: "Home",
  experience: "Experience",
  marketplace: "Marketplace",
  settings: "Account settings",
  profile: "Profile",
  community: "Community",
  people: "Friends",
  finance: "Transactions",
  docs: "Documentation",
  forum: "DevForum",
  help: "Help Center",
  generic: "Unknown page",
})) {
  const option = element("option", "", name);
  option.value = key;
  select.append(option);
}
const preferences = element("button", "", "Cinema settings");
preferences.type = "button";
const note = element(
  "span",
  "preview-note",
  "Fictional sample data · local artwork",
);
toolbar.append(label, select, preferences, note);
document.body.append(toolbar);
const dialog = element("dialog", "preferences-dialog");
dialog.dataset.rcOwned = "";
const close = element("button", "preview-close", "Close");
close.type = "button";
close.onclick = () => dialog.close();
const panel = element("div");
panel.id = "app";
dialog.append(close, panel);
document.body.append(dialog);
await renderPreferences(panel, store);
preferences.onclick = () => dialog.showModal();
let active: PreviewPage =
  (new URLSearchParams(location.search).get("page") as PreviewPage) || "home";
if (!(active in previewUrls)) active = "home";
select.value = active;
mountFixture(active);
let stop = await start({
  store,
  bridge: resources,
  url: () => new URL(previewUrls[active]),
  openSettings: () => dialog.showModal(),
});
select.onchange = () => {
  stop();
  active = select.value as PreviewPage;
  history.replaceState(null, "", `?page=${active}`);
  mountFixture(active);
  void start({
    store,
    bridge: resources,
    url: () => new URL(previewUrls[active]),
    openSettings: () => dialog.showModal(),
  }).then((fn) => {
    stop = fn;
  });
};
// Exposed only by the local preview for deterministic interaction and recovery tests.
Object.assign(window, {
  cinemaPreview: {
    store,
    get settings() {
      return settings;
    },
    reset: () => store.set({ ...DEFAULTS, disabledSites: [] }),
  },
});
