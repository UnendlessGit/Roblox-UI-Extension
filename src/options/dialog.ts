import css from "./options.css?inline";
import { renderPreferences } from "./preferences";
import type { SettingsStore } from "../core/settings";
import { element } from "../core/dom";
let active: HTMLDialogElement | undefined;
/** The same saved preferences as options.html, reachable in browsers without an extension toolbar. */
export async function openPreferences(store: SettingsStore) {
  if (active?.open) {
    active.focus();
    return;
  }
  const previous = document.activeElement;
  const host = element("roblox-cinema-preferences");
  host.dataset.rcOwned = "";
  const shadow = host.attachShadow({ mode: "open" });
  const style = element("style");
  style.textContent =
    css +
    `:host{all:initial;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#f5f5f7;color-scheme:dark}dialog{position:fixed;inset:30px 0;margin:0 auto;width:min(780px,calc(100vw - 32px));max-height:calc(100dvh - 60px);border:1px solid #ffffff1b;border-radius:22px;background:#000;color:#f5f5f7;overflow:auto;padding:0;box-shadow:0 24px 100px #000a}dialog::backdrop{background:#0009}.close-preferences{position:sticky;top:14px;float:right;margin:14px 18px 0 0;z-index:1;background:#161619;border:0;border-radius:50%;width:36px;height:36px;color:#ddd;font-size:24px}.settings-intro{margin:38px 0 28px}#app{padding:28px 28px 40px}`;
  const dialog = element("dialog");
  dialog.setAttribute("aria-label", "Cinema preferences");
  const close = element("button", "close-preferences", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close preferences");
  const root = element("main");
  root.id = "app";
  close.onclick = () => dialog.close();
  dialog.append(close, root);
  shadow.append(style, dialog);
  document.body.append(host);
  const unsubscribe = await renderPreferences(root, store);
  active = dialog;
  dialog.onclose = () => {
    unsubscribe();
    host.remove();
    active = undefined;
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
  };
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  });
  dialog.showModal();
}
