import shellCss from "../styles/shell.css?inline";
import { element, link, readIdentity } from "../core/dom";
import type { Route } from "../core/routes";
import {
  glassSignature,
  type Settings,
  type SettingsStore,
} from "../core/settings";
import { icon } from "./icons";
import { material } from "./material";
export interface Shell {
  host: HTMLElement;
  update(route: Route, url: URL, settings: Settings): void;
  destroy(): void;
}
export function createShell(
  _store: SettingsStore,
  getUrl: () => URL,
  openSettings: () => void,
): Shell {
  const host = element("roblox-cinema-shell");
  host.dataset.rcOwned = "";
  const shadow = host.attachShadow({ mode: "open" });
  const style = element("style");
  style.textContent = shellCss;
  shadow.append(style);
  const skip = link("Skip to main content", "#content", "skip-link");
  skip.onclick = (e) => {
    const main = document.querySelector<HTMLElement>(
      "#content,main,[role=main]",
    );
    if (!main) return;
    e.preventDefault();
    const old = main.getAttribute("tabindex");
    main.tabIndex = -1;
    main.focus();
    main.addEventListener(
      "blur",
      () =>
        old === null
          ? main.removeAttribute("tabindex")
          : main.setAttribute("tabindex", old),
      { once: true },
    );
  };
  const rail = element("nav", "rail");
  rail.setAttribute("aria-label", "Roblox Cinema navigation");
  const base = "https://www.roblox.com";
  const destinations = [
    ["home", "Home", "/home"],
    ["avatar", "Avatar", "/my/avatar"],
    ["messages", "Messages", "/my/messages/#!/inbox"],
    ["user", "Me", "/users/profile"],
  ] as const;
  const items = destinations.map(([key, label, path]) => {
    const a = link("", base + path, "rail-link");
    a.dataset.destination = key;
    a.append(icon(key, 23), element("span", "", label));
    rail.append(a);
    return a;
  });
  const preferences = element("button", "rail-preferences");
  preferences.type = "button";
  preferences.setAttribute("aria-label", "Cinema settings");
  preferences.append(icon("settings", 20));
  preferences.onclick = openSettings;
  rail.append(preferences);
  const toggle = element("button", "rail-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "left-navigation-container");
  toggle.append(icon("menu", 22));
  const headerTools = element("div", "header-tools");
  const headerLinks = element("nav", "header-links");
  headerLinks.setAttribute("aria-label", "Explore Roblox");
  for (const [label, path] of [
    ["Create", "https://create.roblox.com/"],
    ["Marketplace", "/catalog"],
    ["Discover", "/charts"],
  ])
    headerLinks.append(link(label, new URL(path, base).href));
  const searchRegion = element("div", "search-region");
  const form = element("form", "search-form");
  const input = element("input");
  input.type = "search";
  input.placeholder = "Search Roblox";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Search Roblox");
  input.required = true;
  input.maxLength = 200;
  const suggestions = element("div", "search-suggestions");
  suggestions.id = "cinema-search-suggestions";
  suggestions.setAttribute("role", "listbox");
  suggestions.setAttribute("aria-label", "Search destinations");
  suggestions.hidden = true;
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", suggestions.id);
  input.setAttribute("aria-expanded", "false");
  const categories = [
    ["discover", "Experiences", "/discover/"],
    ["user", "People", "/search/users"],
    ["marketplace", "Marketplace", "/catalog"],
    ["community", "Communities", "/search/communities"],
    ["marketplace", "Creator Store", "https://create.roblox.com/store/models"],
  ] as const;
  let selectedSearch = -1;
  function searchUrl(path: string) {
    const url = new URL(path, base);
    url.searchParams.set("keyword", input.value.trim());
    return url.href;
  }
  const choices = categories.map(([glyph, label, path], i) => {
    const a = link("", searchUrl(path), "search-option");
    a.id = `cinema-search-option-${i}`;
    a.setAttribute("role", "option");
    a.append(
      icon(glyph, 21),
      element("span", "query"),
      element("span", "category", `in ${label}`),
    );
    a.onclick = () => hideSearch();
    suggestions.append(a);
    return a;
  });
  function hideSearch() {
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    selectedSearch = -1;
  }
  function refreshSearch() {
    const q = input.value.trim();
    suggestions.hidden = !q;
    input.setAttribute("aria-expanded", String(!!q));
    choices.forEach((a, i) => {
      a.href = searchUrl(categories[i][2]);
      a.querySelector(".query")!.textContent = q;
      a.setAttribute("aria-selected", String(i === selectedSearch));
    });
  }
  input.oninput = refreshSearch;
  input.onfocus = refreshSearch;
  input.onkeydown = (e) => {
    if (e.key === "Escape") {
      hideSearch();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(e.key) && input.value.trim()) {
      e.preventDefault();
      selectedSearch =
        (selectedSearch +
          (e.key === "ArrowDown" ? 1 : choices.length - 1) +
          choices.length) %
        choices.length;
      refreshSearch();
      input.setAttribute("aria-activedescendant", choices[selectedSearch].id);
    }
  };
  form.append(icon("search", 18), input);
  searchRegion.append(form, suggestions);
  headerTools.append(headerLinks, searchRegion);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (input.value.trim())
      location.assign(choices[Math.max(0, selectedSearch)].href);
  };
  let disposed = false,
    open = false,
    lastUrl = "",
    nativeNav: HTMLElement | null = null,
    nativeButton: HTMLButtonElement | null = null,
    footer: HTMLElement | undefined;
  let navAttrs: Record<string, string | null> = {};
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let restoreNavFocus = false;
  let openingFrame = 0;
  const backdrop = element("div", "native-nav-backdrop");
  backdrop.dataset.rcOwned = "";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");
  const stopBackdropScroll = (e: Event) => e.preventDefault();
  backdrop.addEventListener("wheel", stopBackdropScroll, { passive: false });
  backdrop.addEventListener("touchmove", stopBackdropScroll, {
    passive: false,
  });
  document.body.append(backdrop);
  const nativeFocusables = () =>
    Array.from(
      nativeNav?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),[tabindex="0"]',
      ) || [],
    ).filter((e) => e.getClientRects().length > 0);
  function finishClose() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
    nativeButton?.click();
    document.documentElement.removeAttribute("data-rc-native-nav-open");
    host.removeAttribute("data-nav-open");
    backdrop.hidden = true;
    if (restoreNavFocus && !disposed) toggle.focus();
    restoreNavFocus = false;
    if (nativeNav)
      for (const [key, value] of Object.entries(navAttrs))
        value === null
          ? nativeNav.removeAttribute(key)
          : nativeNav.setAttribute(key, value);
  }
  function closeMenu(returnFocus = true, immediate = false) {
    if (!open && !closeTimer) return;
    open = false;
    cancelAnimationFrame(openingFrame);
    document.documentElement.setAttribute("data-rc-native-nav-open", "closing");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    restoreNavFocus = returnFocus && !disposed;
    if (
      immediate ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      host.hasAttribute("data-reduced-motion")
    )
      finishClose();
    else {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(finishClose, 190);
    }
  }
  function bindNative() {
    const next =
      document.querySelector<HTMLElement>("#left-navigation-container") ||
      document.querySelector<HTMLElement>('[data-testid="left-navigation"]') ||
      document.querySelector<HTMLElement>("#navigation");
    if (next !== nativeNav) {
      if (open || closeTimer) closeMenu(false, true);
      footer?.remove();
      nativeNav = next;
    }
    nativeButton = document.querySelector<HTMLButtonElement>(
      '#header-menu-icon .menu-button,button[title="nav menu"]',
    );
    if (nativeNav && !footer?.isConnected) {
      footer = element("div", "rc-native-nav-footer");
      footer.dataset.rcOwned = "";
      const settings = element("button", "", "Cinema settings");
      settings.type = "button";
      settings.append(icon("settings", 18));
      settings.onclick = () => {
        closeMenu();
        openSettings();
      };
      footer.append(settings);
      (
        nativeNav.querySelector(
          ".left-nav .width-\\[288px\\], .left-nav > div > div",
        ) ||
        nativeNav.querySelector(".left-nav") ||
        nativeNav
      ).append(footer);
    }
  }
  function openMenu() {
    bindNative();
    if (!nativeNav) return;
    if (closeTimer) finishClose();
    hideSearch();
    navAttrs = Object.fromEntries(
      ["role", "aria-modal", "aria-label", "tabindex"].map((k) => [
        k,
        nativeNav!.getAttribute(k),
      ]),
    );
    nativeButton?.click();
    open = true;
    host.setAttribute("data-nav-open", "");
    document.documentElement.setAttribute("data-rc-native-nav-open", "opening");
    openingFrame = requestAnimationFrame(() => {
      if (open)
        document.documentElement.setAttribute(
          "data-rc-native-nav-open",
          "open",
        );
    });
    backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    nativeNav.setAttribute("role", "dialog");
    nativeNav.setAttribute("aria-modal", "true");
    nativeNav.setAttribute("aria-label", "Roblox navigation");
    nativeNav.tabIndex = -1;
    (nativeFocusables()[0] || nativeNav).focus();
  }
  toggle.onclick = () => (open ? closeMenu() : openMenu());
  const outside = (e: PointerEvent) => {
    if (!e.composedPath().includes(searchRegion)) hideSearch();
    if (
      open &&
      !e.composedPath().includes(toggle) &&
      !e.composedPath().includes(nativeNav!)
    )
      closeMenu(false);
  };
  const navClick = (e: MouseEvent) => {
    const a = (e.target as Element)?.closest?.("a[href]");
    if (open && a && nativeNav?.contains(a)) closeMenu(false);
  };
  const keydown = (e: KeyboardEvent) => {
    if (open && e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeMenu();
      return;
    }
    if (open && e.key === "Tab") {
      const list = nativeFocusables();
      const first = list[0],
        last = list.at(-1);
      if (!first) {
        e.preventDefault();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === nativeNav)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === "k" &&
      !e.altKey &&
      !(e.composedPath()[0] as HTMLElement)?.matches?.(
        "input,textarea,[contenteditable=true]",
      )
    ) {
      e.preventDefault();
      closeMenu(false);
      input.focus();
    }
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("click", navClick);
  document.addEventListener("keydown", keydown, true);
  let header: Element | null = null,
    logo: Element | null = null,
    right: Element | null = null;
  let headerCleanup: (() => void) | undefined;
  function positionHeader() {
    if (disposed) return;
    const r = right?.getBoundingClientRect(),
      l = logo?.getBoundingClientRect();
    if (r?.width)
      headerTools.style.setProperty(
        "--native-right",
        `${innerWidth - r.left + 16}px`,
      );
    if (l?.width)
      headerTools.style.setProperty("--native-left", `${l.right + 24}px`);
  }
  const resize = new ResizeObserver(positionHeader);
  window.addEventListener("resize", positionHeader);
  window.addEventListener("load", positionHeader);
  void document.fonts?.ready.then(positionHeader);
  let lastGlass = "";
  let suggestionsCleanup: (() => void) | undefined,
    backdropCleanup: (() => void) | undefined;
  function updateHeader(settings: Settings, player: boolean) {
    const h = document.querySelector<HTMLElement>("#header"),
      l = document.querySelector("#nav-logo-link"),
      r = document.querySelector("#right-navigation-header");
    const signature = player ? glassSignature(settings) : "";
    if (h !== header || signature !== lastGlass) {
      headerCleanup?.();
      suggestionsCleanup?.();
      backdropCleanup?.();
      header = h;
      lastGlass = signature;
      headerCleanup =
        player && h ? material(h, settings, { radius: 0 }) : undefined;
      suggestionsCleanup = player
        ? material(suggestions, settings, { radius: 18 })
        : undefined;
      backdropCleanup = player
        ? material(backdrop, settings, { radius: 0 })
        : undefined;
    }
    if (l !== logo || r !== right) {
      resize.disconnect();
      logo = l;
      right = r;
      if (l) resize.observe(l);
      if (r) resize.observe(r);
    }
    positionHeader();
  }
  shadow.append(skip, toggle, headerTools, rail);
  document.body.prepend(host);
  return {
    host,
    update(route, url, settings) {
      bindNative();
      if (open && (lastUrl !== url.href || !route.playerNavigation))
        closeMenu(false);
      lastUrl = url.href;
      rail.hidden =
        toggle.hidden =
        headerTools.hidden =
          !route.playerNavigation;
      host.toggleAttribute("data-reduced-motion", settings.reducedMotion);
      host.toggleAttribute(
        "data-reduced-transparency",
        settings.reducedTransparency || !settings.glassEnabled,
      );
      host.style.setProperty(
        "--rc-glass-tint",
        String(settings.glassOpacity / 100),
      );
      host.style.setProperty(
        "--rc-glass-edge",
        String(settings.glassHighlight / 100),
      );
      updateHeader(settings, route.playerNavigation);
      const identity = readIdentity();
      for (const a of items) {
        const key = a.dataset.destination!;
        const active =
          key === route.family ||
          (key === "user" &&
            route.family === "profile" &&
            identity &&
            url.pathname === `/users/${identity.id}/profile`);
        const previous = a.hasAttribute("aria-current");
        a.toggleAttribute("aria-current", !!active);
        if (active) a.setAttribute("aria-current", "page");
        if (key === "user" && identity) {
          a.href = `${base}/users/${identity.id}/profile`;
          if (identity.image && !a.querySelector("img")) {
            const image = element("img", "rail-avatar");
            image.src = identity.image;
            image.alt = "";
            a.querySelector("svg")?.replaceWith(image);
          }
        } else if (previous !== !!active)
          a.querySelector("svg")?.replaceWith(icon(key, 23, !!active));
      }
      for (const a of headerLinks.querySelectorAll("a")) {
        const active =
          a.textContent === "Marketplace"
            ? ["marketplace", "item"].includes(route.family)
            : a.textContent === "Discover" &&
              ["discover", "experience", "search"].includes(route.family);
        if (active) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    },
    destroy() {
      disposed = true;
      closeMenu(false, true);
      cancelAnimationFrame(openingFrame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", navClick);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", positionHeader);
      window.removeEventListener("load", positionHeader);
      resize.disconnect();
      headerCleanup?.();
      suggestionsCleanup?.();
      backdropCleanup?.();
      backdrop.removeEventListener("wheel", stopBackdropScroll);
      backdrop.removeEventListener("touchmove", stopBackdropScroll);
      footer?.remove();
      backdrop.remove();
      host.remove();
    },
  };
}
