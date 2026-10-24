import type { Settings } from "../core/settings";
import {
  validWallpaper,
  wallpaperStore,
  type WallpaperStore,
} from "../core/wallpaper";
import { element } from "../core/dom";
export function createHomeWallpaper(
  hero: HTMLElement,
  assets: WallpaperStore = wallpaperStore,
) {
  const layer = element("div", "home-wallpaper");
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  const image = element("img", "wallpaper-image");
  image.alt = "";
  image.decoding = "async";
  const veil = element("div", "wallpaper-veil");
  layer.append(image, veil);
  hero.prepend(layer);
  const ambient = element("div", "rc-home-wallpaper-ambient"),
    glow = element("div");
  ambient.dataset.rcOwned = "";
  ambient.setAttribute("aria-hidden", "true");
  ambient.append(glow);
  ambient.hidden = true;
  Object.assign(ambient.style, {
    position: "absolute",
    zIndex: "-1",
    pointerEvents: "none",
    overflow: "hidden",
  });
  Object.assign(glow.style, {
    position: "absolute",
    backgroundRepeat: "no-repeat",
    backgroundSize: "100% 100%",
  });
  let currentId = "",
    generation = 0,
    disposed = false,
    ready = false,
    frame = 0,
    latest: Settings;
  const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
  const host = () =>
    (hero.getRootNode() as ShadowRoot).host as HTMLElement | undefined;
  const resize = new ResizeObserver(() => schedule());
  function clear() {
    ready = false;
    layer.hidden = true;
    image.removeAttribute("src");
    glow.style.backgroundImage = "none";
    ambient.remove();
    delete hero.dataset.wallpaper;
    delete document.documentElement.dataset.rcHomeWallpaper;
  }
  function place() {
    frame = 0;
    if (disposed || !latest) return;
    const owner = host(),
      flow = owner?.parentElement;
    ambient.hidden =
      !ready ||
      !latest.homeWallpaperExtend ||
      latest.reducedTransparency ||
      transparency.matches;
    if (ambient.hidden || !owner || !flow?.hasAttribute("data-rc-home-flow")) {
      ambient.remove();
      return;
    }
    if (ambient.parentElement !== flow) {
      resize.disconnect();
      flow.prepend(ambient);
      resize.observe(flow);
      resize.observe(owner);
    }
    const bounds = owner.getBoundingClientRect(),
      parent = flow.getBoundingClientRect();
    const left = Math.max(0, bounds.left - latest.homeWallpaperExtendX),
      right = Math.min(
        document.documentElement.clientWidth,
        bounds.right + latest.homeWallpaperExtendX,
      );
    const height = Math.min(
      bounds.height + latest.homeWallpaperExtendY,
      Math.max(bounds.height, parent.height - (bounds.top - parent.top)),
    );
    Object.assign(ambient.style, {
      left: `${left - parent.left}px`,
      top: `${bounds.top - parent.top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${height}px`,
      opacity: String(
        (latest.homeWallpaperExtendOpacity / 100) *
          (1 - latest.homeWallpaperDim / 100),
      ),
      maskImage: latest.homeWallpaperExtendFade
        ? `linear-gradient(to bottom,#000 0%,#000 ${100 - latest.homeWallpaperExtendFade}%,transparent 100%)`
        : "none",
    });
    const blur = latest.homeWallpaperExtendBlur;
    Object.assign(glow.style, {
      inset: `${-blur * 3}px`,
      filter: `blur(${blur}px) saturate(${latest.homeWallpaperExtendSaturation / 100}) brightness(${latest.homeWallpaperBrightness / 100})`,
      backgroundPosition: `${latest.homeWallpaperX}% ${latest.homeWallpaperY}%`,
    });
  }
  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(place);
  }
  window.addEventListener("resize", schedule);
  transparency.addEventListener("change", schedule);
  return {
    update(settings: Settings) {
      latest = settings;
      hero.style.setProperty(
        "--wallpaper-blur",
        `${settings.homeWallpaperBlur ? settings.homeWallpaperBlurAmount : 0}px`,
      );
      hero.style.setProperty(
        "--wallpaper-saturation",
        String(
          (settings.homeWallpaperSaturation / 100) *
            (settings.homeWallpaperBlur ? 1.12 : 1),
        ),
      );
      hero.style.setProperty(
        "--wallpaper-brightness",
        String(settings.homeWallpaperBrightness / 100),
      );
      hero.style.setProperty(
        "--wallpaper-dim",
        String(settings.homeWallpaperDim / 100),
      );
      hero.style.setProperty("--wallpaper-fit", settings.homeWallpaperFit);
      hero.style.setProperty(
        "--wallpaper-position",
        `${settings.homeWallpaperX}% ${settings.homeWallpaperY}%`,
      );
      hero.style.setProperty(
        "--wallpaper-fade",
        `${settings.homeWallpaperFade}%`,
      );
      if (settings.homeWallpaperId || ready) schedule();
      if (currentId === settings.homeWallpaperId) return;
      currentId = settings.homeWallpaperId;
      const token = ++generation;
      clear();
      if (!currentId) return;
      void assets
        .get(currentId)
        .then((record) => {
          if (disposed || token !== generation || !validWallpaper(record))
            return;
          image.onload = () => {
            if (!disposed && token === generation) {
              ready = true;
              layer.hidden = false;
              hero.dataset.wallpaper = "ready";
              document.documentElement.dataset.rcHomeWallpaper = "";
              glow.style.backgroundImage = `url("${record.dataUrl}")`;
              schedule();
            }
          };
          image.onerror = () => {
            if (token === generation) clear();
          };
          image.src = record.dataUrl;
        })
        .catch(() => {
          if (token === generation) clear();
        });
    },
    destroy() {
      disposed = true;
      generation++;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      transparency.removeEventListener("change", schedule);
      clear();
      image.onload = image.onerror = null;
      layer.remove();
    },
  };
}
