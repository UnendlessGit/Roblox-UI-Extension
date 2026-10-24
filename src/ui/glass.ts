import { createElement } from "react";
import { createRoot } from "react-dom/client";
import LiquidGlass from "liquid-glass-react";
import type { Settings } from "../core/settings";

let surfaceId = 0;
export interface GlassOptions {
  radius?: number;
  displacement?: number;
}
export function mountGlass(
  layer: HTMLElement,
  settings: Settings,
  options: GlassOptions = {},
) {
  // A nested fixed/isolated wrapper prevents Chromium from sampling the page
  // behind the library's warp. Keep its fixed surfaces at the document boundary,
  // before native controls at the same stack level, and follow the local anchor.
  const surface = document.createElement("div");
  surface.dataset.rcGlassSurface = String(++surfaceId);
  surface.dataset.rcGlassOwner = layer.dataset.rcGlassKey;
  surface.dataset.rcOwned = "";
  surface.setAttribute("aria-hidden", "true");
  layer.dataset.rcGlassId = String(surfaceId);
  const scope = `[data-rc-glass-surface="${surfaceId}"]`;
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const interactive = () =>
    settings.glassInteractive &&
    !settings.reducedMotion &&
    !motionPreference.matches;
  const style = document.createElement("style");
  style.textContent = `
    ${scope},${scope} .rc-glass-render{display:contents;pointer-events:none}
    ${scope} *{box-sizing:border-box}
    ${scope}[data-motion="off"] *{transition:none!important;animation:none!important}
    ${scope} .relative{position:relative}
    ${scope} .pointer-events-none{pointer-events:none}
    ${scope} .opacity-0{opacity:0}
    ${scope} .opacity-20{opacity:.2}
    ${scope} .opacity-100{opacity:1}
    ${scope} .bg-black{background:#000}
    ${scope} .mix-blend-overlay{mix-blend-mode:overlay}
    ${scope} svg{pointer-events:none}
    ${scope} .glass{width:100%!important;height:100%!important}
    ${scope} .glass{display:flex!important}
    ${scope} .glass>div{width:100%;height:100%}
    ${scope} .rc-glass-render>*{z-index:var(--rc-glass-stack)}
    ${scope} .rc-glass-render>span{opacity:${settings.glassHighlight / 20}!important}
    ${scope} .rc-glass-render>span:first-of-type{opacity:${settings.glassHighlight / 100}!important}
  `;
  const mount = document.createElement("div");
  mount.className = "rc-glass-render";
  surface.append(style, mount);
  document.body.prepend(surface);
  // Keep the library's own warp filter, backdrop, shadows and two highlight rims.
  // Native controls remain outside this renderer rather than React children.
  const root = createRoot(mount, {
    identifierPrefix: `rc-glass-${surfaceId}-`,
  });
  const still = { x: 0, y: 0 };
  let frame = 0;
  let lastSize = "";
  let disposed = false;
  const render = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (disposed) return;
    const { width, height, x, y } = layer.getBoundingClientRect();
    const moving = interactive();
    if (!width || !height || getComputedStyle(layer).visibility === "hidden") {
      surface.style.display = "none";
      lastSize = "";
      return;
    }
    let stack = 0;
    for (
      let ancestor: Element | null = layer.parentElement;
      ancestor;
      ancestor =
        ancestor.parentElement ??
        (ancestor.getRootNode() instanceof ShadowRoot
          ? (ancestor.getRootNode() as ShadowRoot).host
          : null)
    ) {
      const z = getComputedStyle(ancestor).zIndex;
      // The outermost explicit stack level controls the native subtree.
      if (z !== "auto" && Number.isFinite(Number(z))) stack = Number(z);
    }
    surface.style.removeProperty("display");
    surface.style.setProperty("--rc-glass-stack", String(stack));
    const signature = `${width}:${height}:${x}:${y}:${moving}:${stack}`;
    if (signature === lastSize) return;
    lastSize = signature;
    surface.dataset.motion = moving ? "on" : "off";
    root.render(
      createElement(LiquidGlass, {
        // Remount only the passive background when a native popup changes size.
        key: `${width}:${height}`,
        mode: "standard",
        displacementScale: options.displacement ?? settings.glassRefraction,
        aberrationIntensity: settings.glassAberration,
        saturation: settings.glassSaturation,
        blurAmount: (settings.glassBlur - 4) / 32,
        elasticity: moving ? 0.15 : 0,
        cornerRadius: options.radius ?? 32,
        padding: "0px",
        globalMousePos: moving ? undefined : still,
        mouseOffset: moving ? undefined : still,
        mouseContainer: { current: document.documentElement },
        style: {
          position: "fixed",
          left: x + width / 2,
          top: y + height / 2,
          width,
          height,
        },
        children: createElement("span", {
          style: { display: "block", width: "100%", height: "100%" },
        }),
      }),
    );
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(layer);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  motionPreference.addEventListener("change", render);
  render();
  return () => {
    disposed = true;
    resize.disconnect();
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    motionPreference.removeEventListener("change", render);
    cancelAnimationFrame(frame);
    root.unmount();
    surface.remove();
    delete layer.dataset.rcGlassId;
  };
}
