import type { Settings } from "../core/settings";
import type { GlassOptions } from "./glass";
let modulePromise: Promise<typeof import("./glass")> | undefined;
const anchors = new WeakMap<HTMLElement, number>();
let anchorId = 0;
/** The surface owns only a passive background. Never wrap or move native controls. */
export function material(
  container: HTMLElement,
  settings: Settings,
  options: GlassOptions = {},
) {
  const layer = document.createElement("div");
  layer.dataset.rcOwned = "";
  if (!anchors.has(container)) anchors.set(container, ++anchorId);
  layer.dataset.rcGlassKey = String(anchors.get(container));
  layer.className = "rc-glass-layer";
  layer.setAttribute("aria-hidden", "true");
  // This local anchor carries geometry and tint. The glass renderer captures at
  // the document boundary, outside native fixed/isolated wrappers.
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    borderRadius: "inherit",
    overflow: "visible",
    zIndex: "-1",
  });
  const previous = container.getAttribute("data-rc-material");
  container.setAttribute("data-rc-material", "");
  container.prepend(layer);
  let disposed = false,
    cleanup: (() => void) | undefined,
    idle: number | undefined;
  const opaque =
    !settings.glassEnabled ||
    settings.reducedTransparency ||
    matchMedia("(prefers-reduced-transparency: reduce)").matches;
  let visible: IntersectionObserver | undefined;
  function mount() {
    visible?.disconnect();
    const load = () => {
      if (disposed) return;
      modulePromise ||= __RC_EXTENSION__
        ? import(/* @vite-ignore */ chrome.runtime.getURL("glass.js"))
        : import("./glass");
      void modulePromise
        .then((m) => {
          if (!disposed && layer.isConnected)
            cleanup = m.mountGlass(layer, settings, {
              ...options,
              radius:
                options.radius ??
                (parseFloat(getComputedStyle(container).borderTopLeftRadius) ||
                  0),
            });
        })
        .catch(() => {});
    };
    if (typeof requestIdleCallback === "function")
      idle = requestIdleCallback(load, { timeout: 700 });
    else idle = window.setTimeout(load, 0);
  }
  if (!opaque) {
    visible = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) mount();
    });
    visible.observe(layer);
  }
  return () => {
    disposed = true;
    visible?.disconnect();
    if (idle !== undefined) {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      else clearTimeout(idle);
    }
    cleanup?.();
    layer.remove();
    if (previous === null) container.removeAttribute("data-rc-material");
    else container.setAttribute("data-rc-material", previous);
  };
}
