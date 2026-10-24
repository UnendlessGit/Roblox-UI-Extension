import { markAll } from "../core/dom";
import type { Route } from "../core/routes";
export const SELECTORS = {
  main: '#container-main, #content, main, [role="main"], .container-main',
  sidebar:
    '#navigation, #left-navigation-container, [data-testid="left-navigation"]',
  cards:
    '.game-card-container, .item-card-container, .friend-card, .group-card, .server-card, .rbx-game-server-item, [data-testid="game-card"], [data-testid="item-card"], [data-testid="experience-card"], [data-testid="sdui-game-tile"]',
  grids:
    '.game-cards, .game-grid, .item-cards, .item-cards-stackable, .friends-list, .avatar-cards, .group-list, .rbx-game-server-list, [data-testid="catalog-results"], [data-testid="sdui-grid"]',
  media:
    ".game-card-thumb-container, .featured-game-icon-container, .item-card-thumb-container, .item-card-thumbnail",
  panels:
    ".section-content:not(.remove-panel), .settings-section, .trade-request, .trade-list-detail, .transactions-summary",
  tabs: '.nav-tabs, .settings-tabs, [role="tablist"]',
};
function nodes(root: ParentNode, selector: string): Element[] {
  return [
    ...(root instanceof Element && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
}
export function enhance(root: ParentNode, route: Route) {
  markAll(root, SELECTORS.main, "data-rc-main");
  if (route.site !== "player") return;
  markAll(root, SELECTORS.cards, "data-rc-card");
  markAll(root, SELECTORS.grids, "data-rc-grid");
  markAll(root, SELECTORS.media, "data-rc-media");
  for (const panel of nodes(root, SELECTORS.panels)) {
    // Layout containers are not visual panels. Framing them changes Bootstrap's width calculations.
    if (
      !panel.querySelector(
        ".rbx-tabs-horizontal, [data-rc-grid], .section-content, .game-main-content",
      ) &&
      !panel.closest("[data-rc-owned]")
    )
      panel.setAttribute("data-rc-panel", "");
  }
  for (const tabs of nodes(root, SELECTORS.tabs)) {
    if (
      tabs.matches(".menu-vertical, .rbx-tabs-vertical") ||
      tabs.closest(".settings-left-navigation, .menu-vertical") ||
      tabs.querySelector('.nav-tabs, [role="tablist"]')
    )
      continue;
    tabs.setAttribute("data-rc-tabs", "");
  }
  markAll(
    root,
    ".friend-carousel-container, .friends-carousel, .people-list-container, #people-list-container",
    "data-rc-friends",
  );
  markAll(
    root,
    ".game-card-info, .vote-percentage-label, .game-card-info-vote, .game-card-info-player-count",
    "data-rc-secondary",
  );
  for (const card of nodes(root, SELECTORS.cards)) {
    if (card.closest("[data-rc-owned]")) continue;
    const media = card.querySelector(SELECTORS.media);
    if (media) {
      const img = media.querySelector("img");
      const wide = !!media.closest(
        ".wide-game-tile-list, .wide-game-tile-game-grid, .wide-game-tile",
      );
      // Use the native asset dimensions, never make square icons into wide posters.
      const dims = img
        ?.getAttribute("src")
        ?.match(/\/(\d+)\/(\d+)\/(?:Image|GameIcon|Avatar)/);
      const ratio = dims
        ? Number(dims[1]) / Number(dims[2])
        : wide
          ? 16 / 9
          : 1;
      const shape = ratio > 1.25 ? "wide" : "square";
      if (media.getAttribute("data-rc-ratio") !== shape)
        media.setAttribute("data-rc-ratio", shape);
      card.toggleAttribute("data-rc-wide", ratio > 1.25);
    }
    const href = card.querySelector<HTMLAnchorElement>("a[href]")?.href;
    try {
      if (href && new URL(href).searchParams.get("isAd") === "true")
        card.setAttribute("data-rc-sponsored", "");
    } catch {
      /* preserve unknown links */
    }
  }
  if (route.family === "home") {
    for (const friends of nodes(root, "[data-rc-friends]")) {
      const parent = friends.parentElement;
      if (
        parent?.matches(".game-home-page-container") ||
        parent?.parentElement?.matches(".game-home-page-container")
      )
        parent.setAttribute("data-rc-home-flow", "");
    }
    // One scrolling surface per shelf; never turn the 9,000px native track into a viewport.
    markAll(
      root,
      '.horizontal-scroller, [data-testid="game-carousel"]',
      "data-rc-shelf",
    );
    markAll(
      root,
      ".horizontal-scroller:has(.home-page-carousel)",
      "data-rc-paged",
    );
    for (const heading of nodes(
      root,
      ".container-header a, .container-header h2, .game-sort-header-container a, .home-sort-header-container a",
    )) {
      if (heading.textContent?.trim() !== "Continue") continue;
      const section = heading.closest(
        ".game-sort-carousel-wrapper, .game-sort-sort, .game-sort-container, .game-sort",
      );
      section?.setAttribute("data-rc-continue", "");
      section
        ?.querySelector("[data-rc-shelf]")
        ?.setAttribute("data-rc-paged", "");
      const parent = section?.parentElement;
      if (
        parent?.matches(".game-home-page-container") ||
        parent?.parentElement?.matches(".game-home-page-container")
      )
        parent.setAttribute("data-rc-home-flow", "");
    }
  }
  if (route.family === "discover" || route.family === "search") {
    const collections = new Set<Element>(
      nodes(
        root,
        '[data-testid="collection-carousel-viewport"]:has(.sdui-game-tile)',
      ),
    );
    if (root instanceof Element) {
      const ancestor = root.closest(
        '[data-testid="collection-carousel-viewport"]',
      );
      if (ancestor?.querySelector(".sdui-game-tile")) collections.add(ancestor);
    }
    for (const collection of collections) {
      collection.setAttribute("data-rc-shelf", "");
      collection.setAttribute("data-rc-paged", "");
    }
  }
  if (route.family === "experience") {
    markAll(root, ".game-details-page-events-grid", "data-rc-events");
    markAll(
      root,
      '.games-detail [data-testid="game-carousel"]',
      "data-rc-paged",
    );
    markAll(
      root,
      '.games-detail [data-testid="game-carousel"]',
      "data-rc-shelf",
    );
    const page = document.querySelector<HTMLElement>("#game-detail-page");
    const image = page?.querySelector<HTMLImageElement>(
      "#game-details-carousel-container img[src]",
    );
    if (page && image && !page.hasAttribute("data-rc-artwork")) {
      try {
        const url = new URL(image.src);
        if (
          url.protocol === "https:" &&
          /(^|\.)rbxcdn\.com$/.test(url.hostname)
        ) {
          page.style.setProperty(
            "--rc-artwork",
            `url(${JSON.stringify(url.href)})`,
          );
          page.setAttribute("data-rc-artwork", "");
        }
      } catch {
        /* preserve native artwork */
      }
    }
    const play = document.querySelector<HTMLElement>(
      '[data-testid="play-button"]',
    );
    if (play && !play.hasAttribute("aria-label")) {
      play.setAttribute(
        "aria-label",
        `Play ${document.querySelector(".game-name")?.textContent?.trim() || "experience"}`,
      );
      play.setAttribute("data-rc-play-label", "");
    }
  }
  markAll(
    root,
    '#populated-sponsored-catalog-items, .sponsored-item-card, [data-sponsored="true"], [data-testid="sponsored-game"], .sponsored-game, .game-card-container:has(.ad-label), .game-card-container:has(.sponsored-label)',
    "data-rc-sponsored",
  );
  markAll(
    root,
    '[data-testid="premium-upsell"], [data-testid="subscription-upsell"], .premium-upsell, .subscription-upsell, #roblox-plus-referral-banner, .referral-upsell',
    "data-rc-upsell",
  );
}
