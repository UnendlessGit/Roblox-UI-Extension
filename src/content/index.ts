import "../styles/theme.css";
import { version } from "../../manifest.json";
import {
  settingsStore,
  type Settings,
  type SettingsStore,
} from "../core/settings";
import { bridge as chromeBridge, type ResourceBridge } from "../core/bridge";
import { classifyRoute } from "../core/routes";
import { clearMarks, readIdentity } from "../core/dom";
import { enhance, SELECTORS } from "./adapters";
import { createShell, type Shell } from "../ui/shell";
import { createHero } from "../ui/hero";
import { createCarousels } from "./carousels";
import { createRecommendations } from "./recommendations";
import { createOverlays, OVERLAY_SELECTOR } from "./overlays";
import { createArtwork } from "./artwork";
import { createProfileInfo } from "./profile";
import { createFriendStats } from "./friend-stats";
import { createIncludedItems } from "./included-items";
import { createProductRecovery } from "./product-recovery";
import type { WallpaperStore } from "../core/wallpaper";

export interface RuntimeOptions {
  store?: SettingsStore;
  bridge?: ResourceBridge;
  url?: () => URL;
  openSettings?: () => void;
  wallpapers?: WallpaperStore;
}
export async function start(options: RuntimeOptions = {}) {
  const store = options.store || settingsStore,
    resources = options.bridge || chromeBridge,
    getUrl = options.url || (() => new URL(location.href));
  const openSettings =
    options.openSettings ||
    (() => {
      void (
        __RC_EXTENSION__
          ? import(/* @vite-ignore */ chrome.runtime.getURL("preferences.js"))
          : import("../options/dialog")
      )
        .then((module) => module.openPreferences(store))
        .catch(
          () => void chrome.runtime.sendMessage({ type: "open-settings" }),
        );
    });
  let settings: Settings;
  try {
    settings = await store.get();
  } catch {
    return () => {};
  }
  let shell: Shell | undefined,
    hero: ReturnType<typeof createHero> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let lastUrl = "",
    heroKey = "",
    continuePending = false,
    stopped = false,
    overlayRefresh = false;
  const roots = new Set<Element>();
  let refresh = true;
  const carousels = createCarousels();
  const recommendations = createRecommendations();
  const overlays = createOverlays();
  const friendStats = createFriendStats(resources);
  const artwork = createArtwork();
  const productRecovery = createProductRecovery(resources);
  const includedItems = createIncludedItems(() =>
    productRecovery.update(getUrl()),
  );
  let profileInfo: ReturnType<typeof createProfileInfo> | undefined;
  const html = document.documentElement;
  function restore() {
    shell?.destroy();
    shell = undefined;
    hero?.destroy();
    hero = undefined;
    heroKey = "";
    for (const attr of [...html.attributes])
      if (attr.name.startsWith("data-rc-") && attr.name !== "data-rc-preview")
        html.removeAttribute(attr.name);
    carousels.destroy();
    recommendations.destroy();
    overlays.destroy();
    friendStats.destroy();
    artwork.destroy();
    includedItems.destroy();
    productRecovery.destroy();
    profileInfo?.destroy();
    profileInfo = undefined;
    html.style.removeProperty("--rc-glass-tint");
    clearMarks();
  }
  function reconcile() {
    timer = undefined;
    if (stopped || !document.body) return;
    const url = getUrl();
    if (
      !settings.enabled ||
      settings.disabledSites.includes(url.hostname) ||
      !document.contentType.includes("html") ||
      !/(^|\.)roblox\.com$/.test(url.hostname)
    ) {
      restore();
      roots.clear();
      return;
    }
    const route = classifyRoute(url);
    const changed = lastUrl !== url.href;
    if (changed)
      continuePending =
        route.family === "home" && url.hash === "#continue-playing";
    lastUrl = url.href;
    if (changed || refresh) {
      html.dataset.rcVersion = version;
      html.dataset.rcBuild = __RC_BUILD__;
      html.setAttribute("data-rc-enabled", "");
      html.dataset.rcSite = route.site;
      html.dataset.rcFamily = route.family;
      html.dataset.rcMotion = settings.reducedMotion ? "reduce" : "system";
      html.dataset.rcTransparency = settings.reducedTransparency
        ? "reduce"
        : "system";
      html.toggleAttribute("data-rc-hide-upsells", settings.hideUpsells);
      html.toggleAttribute("data-rc-hide-sponsored", settings.hideSponsored);
      html.toggleAttribute(
        "data-rc-hide-friend-activity",
        !settings.showFriendActivity,
      );
      html.toggleAttribute(
        "data-rc-hide-friends-list",
        !settings.showFriendsList,
      );
      html.toggleAttribute("data-rc-glass-off", !settings.glassEnabled);
      html.toggleAttribute("data-rc-hide-chat", !settings.showChat);
      html.style.setProperty(
        "--rc-glass-tint",
        String(settings.glassOpacity / 100),
      );
    }
    const main =
      route.family === "home"
        ? document.querySelector<HTMLElement>("#HomeContainer") ||
          document.querySelector<HTMLElement>("#content") ||
          document.querySelector<HTMLElement>("main")
        : document.querySelector<HTMLElement>(SELECTORS.main);
    const full = changed || refresh;
    const pendingRoots = [...roots];
    if (full) enhance(document, route);
    else
      for (const root of roots) {
        if (
          root.isConnected &&
          ![...roots].some((other) => other !== root && other.contains(root))
        )
          enhance(root, route);
      }
    refresh = false;
    roots.clear();
    artwork.update(full ? [document] : pendingRoots);
    if (route.family === "profile") profileInfo ||= createProfileInfo();
    else {
      profileInfo?.destroy();
      profileInfo = undefined;
    }
    if (shell && !shell.host.isConnected) {
      shell.destroy();
      shell = undefined;
    }
    if (!shell) shell = createShell(store, getUrl, openSettings);
    // Only known player layouts lose the original rail; unknown pages retain their navigation.
    if (
      route.playerNavigation &&
      main &&
      document.querySelector("#header, #navigation, #left-navigation-container")
    )
      html.dataset.rcShell = "ready";
    else delete html.dataset.rcShell;
    shell.update(route, url, settings);
    if (["home", "experience", "discover", "search"].includes(route.family))
      carousels.update();
    else carousels.destroy();
    if (route.family === "home") {
      if (
        full ||
        pendingRoots.some(
          (root) =>
            root.matches("[data-rc-recommendations],.home-game-grid") ||
            root.closest("[data-rc-recommendations]") ||
            root.querySelector(".home-game-grid"),
        )
      )
        recommendations.update();
    } else recommendations.destroy();
    if (changed || route.family !== "item") includedItems.destroy();
    if (route.family === "item") includedItems.update();
    if (route.family === "item") productRecovery.update(url);
    else productRecovery.destroy();
    overlays.update(
      settings,
      full || overlayRefresh ? [document] : pendingRoots,
    );
    overlayRefresh = false;
    artwork.update(full ? [document] : pendingRoots);
    if (route.family === "profile") profileInfo ||= createProfileInfo();
    else {
      profileInfo?.destroy();
      profileInfo = undefined;
    }
    if (["home", "experience", "discover", "search"].includes(route.family))
      friendStats.update(settings);
    else friendStats.destroy();
    const identity = route.family === "home" ? readIdentity() : null;
    const heroMain =
      route.family === "home"
        ? document.querySelector<HTMLElement>("[data-rc-home-flow]") || main
        : main;
    const key =
      identity && main
        ? JSON.stringify([
            identity.id,
            identity.name,
            identity.username,
            settings.reducedMotion,
            settings.reducedTransparency,
          ])
        : "";
    if (key !== heroKey || (hero && !hero.host.isConnected)) {
      hero?.destroy();
      hero = undefined;
      heroKey = key;
      if (identity && main) {
        hero = createHero(identity, resources, settings, options.wallpapers);
        heroMain!.prepend(hero.host);
      }
    } else if (hero && heroMain && hero.host.parentElement !== heroMain) {
      // Home can arrive after the initial main/placeholder. Move only our own host;
      // retain its thumbnail and requests rather than recreating it during hydration.
      heroMain.prepend(hero.host);
    }
    hero?.update(settings);
    hero?.host.toggleAttribute(
      "data-composed",
      !!heroMain?.hasAttribute("data-rc-home-flow"),
    );
    const continueSection =
      continuePending && document.querySelector("[data-rc-continue]");
    if (continueSection) {
      continueSection.scrollIntoView({ block: "start" });
      continuePending = false;
    }
  }
  function schedule() {
    if (!timer && !stopped) timer = setTimeout(reconcile, 100);
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.target instanceof Element &&
        mutation.target.closest("[data-rc-owned]")
      )
        continue;
      if (
        mutation.type === "attributes" &&
        mutation.target instanceof Element
      ) {
        const target = mutation.target;
        // React/Angular may attach a component class or image source after inserting an empty node.
        // Do not observe inline styles, animation ticks, or the extension's annotation attributes.
        if (
          ["aria-expanded", "aria-pressed", "data-state"].includes(
            mutation.attributeName || "",
          ) &&
          target.matches("button,[aria-haspopup]")
        )
          overlayRefresh = true;
        const overlay = target.closest(OVERLAY_SELECTOR);
        if (overlay) roots.add(overlay);
        const card = target.closest(SELECTORS.cards);
        if (card) roots.add(card);
        else if (
          mutation.attributeName === "class" &&
          target.matches(
            `${SELECTORS.grids},${SELECTORS.tabs},${SELECTORS.panels}`,
          )
        )
          roots.add(target);
      }
      for (const node of mutation.addedNodes)
        if (node instanceof Element && !node.hasAttribute("data-rc-owned"))
          roots.add(node.closest(SELECTORS.cards) || node);
      if (mutation.removedNodes.length && mutation.target instanceof Element) {
        const component = mutation.target.closest(
          "[data-rc-shelf], [data-rc-recommendations], [data-rc-overlay]",
        );
        if (component) roots.add(component);
        for (const removed of mutation.removedNodes)
          if (
            removed instanceof Element &&
            (removed.hasAttribute("data-rc-overlay") ||
              removed.querySelector("[data-rc-overlay]"))
          )
            roots.add(removed); // Dispose detached overlays without enhancing the whole document.
      }
      if (
        getUrl().href !== lastUrl ||
        roots.size ||
        overlayRefresh ||
        (hero && !hero.host.isConnected) ||
        (shell && !shell.host.isConnected)
      )
        schedule();
    }
  });
  observer.observe(html, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "class",
      "src",
      "aria-expanded",
      "aria-pressed",
      "data-state",
    ],
  });
  const unsubscribe = store.subscribe((next) => {
    settings = next;
    roots.clear();
    refresh = true;
    schedule();
  });
  document.addEventListener("DOMContentLoaded", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  const navigation = (window as Window & { navigation?: EventTarget })
    .navigation;
  navigation?.addEventListener("currententrychange", schedule);
  reconcile();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    observer.disconnect();
    unsubscribe();
    document.removeEventListener("DOMContentLoaded", schedule);
    window.removeEventListener("popstate", schedule);
    window.removeEventListener("hashchange", schedule);
    navigation?.removeEventListener("currententrychange", schedule);
    restore();
  };
}
if (!document.documentElement.hasAttribute("data-rc-preview")) void start();
