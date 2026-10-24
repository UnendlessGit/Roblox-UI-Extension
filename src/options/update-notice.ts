import { element, link } from "../core/dom";
import {
  UPDATE_KEY,
  RELEASES,
  isNewer,
  type UpdateState,
} from "../core/updates";
export function mountUpdateNotice(root: HTMLElement) {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return () => {};
  const version = chrome.runtime.getManifest().version;
  const section = element("section", "update-notice");
  section.setAttribute("aria-label", "Extension updates");
  const title = element("strong", "", `Roblox Cinema v${version}`);
  const status = element("p", "update-status", "Checking for updates…");
  status.setAttribute("role", "status");
  const actions = element("div", "update-actions");
  const download = link(
    "Download update",
    `${RELEASES}/latest`,
    "update-download",
  );
  download.target = "_blank";
  download.rel = "noopener noreferrer";
  download.hidden = true;
  const check = element("button", "text-button", "Check for updates");
  check.type = "button";
  actions.append(download, check);
  section.append(title, status, actions);
  root.append(section);
  let disposed = false;
  function render(state?: UpdateState) {
    if (disposed) return;
    const available = state?.release && isNewer(state.release.version, version);
    title.textContent = available
      ? `New version available · v${state!.release!.version}`
      : `Roblox Cinema v${version}`;
    download.hidden = !available;
    if (available) download.href = state!.release!.download;
    status.textContent = available
      ? "Download the ZIP, extract it into your existing extension folder, then reload the extension. Your settings stay saved."
      : state?.failed
        ? "Couldn’t check for updates. Try again when you’re online."
        : "You’re up to date. Updates are checked automatically.";
  }
  async function refresh(force = false) {
    check.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "check-release",
        force,
      });
      if (!response?.ok) throw new Error("Unavailable");
      render(response.state);
    } catch {
      if (!disposed)
        status.textContent = "Couldn’t check for updates. Please try again.";
    } finally {
      check.disabled = false;
    }
  }
  check.onclick = () => void refresh(true);
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes[UPDATE_KEY])
      render(changes[UPDATE_KEY].newValue as UpdateState | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  void refresh();
  return () => {
    disposed = true;
    chrome.storage.onChanged.removeListener(listener);
  };
}
