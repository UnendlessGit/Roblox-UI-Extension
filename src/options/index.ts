import "./options.css";
import { settingsStore } from "../core/settings";
import { renderPreferences } from "./preferences";
const popup = document.body.hasAttribute("data-popup");
let currentHost: string | undefined;
if (popup) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab.url) currentHost = new URL(tab.url).hostname;
  } catch {
    /* full settings remain available */
  }
}
void renderPreferences(
  document.querySelector<HTMLElement>("#app")!,
  settingsStore,
  { popup, currentHost, openFull: () => void chrome.runtime.openOptionsPage() },
);
