import { describe, it, expect, beforeEach } from "vitest";
import { classifyRoute } from "../../src/core/routes";
import { normalizeSettings, DEFAULTS } from "../../src/core/settings";
import { allowedResource } from "../../src/core/bridge";
import { enhance } from "../../src/content/adapters";
import { clearMarks, readIdentity } from "../../src/core/dom";
import { ResourceCache } from "../../src/core/resource-cache";
describe("page coverage", () => {
  it.each([
    ["/home", "home"],
    ["/charts", "discover"],
    ["/games", "discover"],
    ["/games/123/Test", "experience"],
    ["/users/123/profile", "profile"],
    ["/catalog", "marketplace"],
    ["/catalog/123/Item", "item"],
    ["/bundles/123/Bundle", "item"],
    ["/badges/123/Badge", "item"],
    ["/my/avatar", "avatar"],
    ["/users/123/inventory", "collection"],
    ["/users/123/favorites", "collection"],
    ["/users/123/friends", "people"],
    ["/users/friends", "people"],
    ["/communities/123/Name", "community"],
    ["/groups/123", "community"],
    ["/search/communities", "community"],
    ["/search/users", "search"],
    ["/my/messages/#!/inbox", "messages"],
    ["/trades", "finance"],
    ["/transactions", "finance"],
    ["/upgrades/robux", "finance"],
    ["/my/account#!/security", "settings"],
    ["/login", "auth"],
    ["/unknown-new-page", "generic"],
  ])("%s → %s", (path, family) =>
    expect(classifyRoute(new URL(path, "https://www.roblox.com")).family).toBe(
      family,
    ),
  );
  it.each([
    ["https://create.roblox.com/dashboard/creations", "creator"],
    ["https://create.roblox.com/docs/studio", "docs"],
    ["https://devforum.roblox.com/t/example/1", "forum"],
    ["https://en.help.roblox.com/hc/en-us", "help"],
    ["https://blog.roblox.com", "generic"],
  ])("%s → %s", (url, family) =>
    expect(classifyRoute(new URL(url)).family).toBe(family),
  );
  it("retains native navigation for unfamiliar pages and work sites", () => {
    for (const url of [
      "https://www.roblox.com/new-page",
      "https://create.roblox.com/dashboard",
      "https://devforum.roblox.com",
    ])
      expect(classifyRoute(new URL(url)).playerNavigation).toBe(false);
  });
});
describe("local preference migrations", () => {
  it("restores the demo optics for the previous default profile while keeping interaction off", () => {
    const settings = normalizeSettings({
      glassRefraction: 42,
      glassBlur: 8,
      glassOpacity: 38,
      glassSaturation: 120,
      glassAberration: 0.7,
      glassHighlight: 2,
      showChat: true,
    });
    expect(settings).toEqual({ ...DEFAULTS, showChat: true });
    expect(settings.glassInteractive).toBe(false);
  });
  it("preserves customized glass profiles and an explicit interactive preference", () => {
    const settings = normalizeSettings({
      glassRefraction: 63,
      glassBlur: 8,
      glassOpacity: 38,
      glassSaturation: 120,
      glassAberration: 0.7,
      glassHighlight: 2,
      glassInteractive: true,
    });
    expect(settings.glassRefraction).toBe(63);
    expect(settings.glassBlur).toBe(8);
    expect(settings.glassOpacity).toBe(38);
    expect(settings.glassInteractive).toBe(true);
  });
  it("defaults missing fields without erasing explicit preferences", () => {
    expect(normalizeSettings({ hideSponsored: true })).toEqual({
      ...DEFAULTS,
      hideSponsored: true,
    });
    expect(normalizeSettings(null)).toEqual(DEFAULTS);
  });
  it("rejects malformed values and unrelated site disable entries", () => {
    expect(
      normalizeSettings({
        enabled: "false",
        interactiveAvatar: 0,
        disabledSites: [
          "www.roblox.com",
          "evil.com",
          "www.roblox.com",
          "roblox.com.evil.com",
          null,
        ],
      }),
    ).toEqual({ ...DEFAULTS, disabledSites: ["www.roblox.com"] });
  });
});
describe("restricted read-only resource bridge", () => {
  it.each([
    "https://catalog.roblox.com/v1/bundles/291/details",
    "https://catalog.roblox.com/v1/bundles/305/recommendations",
    "https://catalog.roblox.com/v2/recommendations/assets?assetId=123&assetTypeId=47&numItems=6",
    "https://economy.roblox.com/v2/assets/123/details",
    "https://thumbnails.roblox.com/v1/assets?assetIds=123,456&size=420x420&format=Png&isCircular=false",
    "https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=291,305&size=420x420&format=Png&isCircular=false",
  ])("permits bounded public catalog recovery: %s", (url) =>
    expect(allowedResource(url, "json")).toBe(true),
  );
  it.each([
    "https://catalog.roblox.com/v1/bundles/291/details?redirect=evil",
    "https://catalog.roblox.com/v1/bundles/291/favorite",
    "https://catalog.roblox.com/v2/recommendations/assets?assetId=123&assetTypeId=47&numItems=600",
    "https://catalog.roblox.com/v2/recommendations/assets?assetId=123&assetTypeId=47&numItems=6&redirect=evil",
    "https://economy.roblox.com/v2/assets/123/resellers",
    "https://economy.roblox.com/v2/assets/123/details#other",
    "https://thumbnails.roblox.com/v1/assets?assetIds=123&size=4096x4096&format=Png&isCircular=false",
  ])("rejects unrelated or unbounded catalog destinations: %s", (url) =>
    expect(allowedResource(url, "json")).toBe(false),
  );
  it.each([
    "http://t0.rbxcdn.com/a",
    "https://rbxcdn.com.evil.com/a",
    "https://user:password@t0.rbxcdn.com/a",
    "https://t0.rbxcdn.com:444/a",
    "https://auth.roblox.com/v2/logout",
    "https://thumbnails.roblox.com/v1/users/avatar?userIds=1&redirect=evil",
    "https://thumbnails.roblox.com/v1/users/avatar?userIds=abc",
    "data:text/html,hi",
    "file:///etc/passwd",
  ])("rejects %s", (url) => expect(allowedResource(url, "json")).toBe(false));
  it("permits only the avatar endpoint and Roblox CDN resources", () => {
    expect(
      allowedResource(
        "https://thumbnails.roblox.com/v1/users/avatar?userIds=1&size=720x720&format=Png&isCircular=false",
        "json",
      ),
    ).toBe(true);
    expect(
      allowedResource(
        "https://thumbnails.roblox.com/v1/users/avatar-3d?userId=1",
        "json",
      ),
    ).toBe(false);
    expect(allowedResource("https://t0.rbxcdn.com/asset", "text")).toBe(false);
    expect(
      allowedResource(
        "https://thumbnails.roblox.com/v1/users/avatar?userIds=1",
        "text",
      ),
    ).toBe(false);
  });
});
describe("native DOM preservation and explicit content filtering", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });
  it("identifies only the signed-in user rather than a friend tile", () => {
    document.body.innerHTML = '<a href="/users/999/profile">A friend</a>';
    expect(readIdentity()).toBeNull();
    document.head.innerHTML =
      '<meta name="user-data" data-userid="123" data-name="Player" data-displayname="Display">';
    expect(readIdentity()).toMatchObject({
      id: "123",
      name: "Display",
      username: "Player",
    });
  });
  it("does not replace controls or change their event handling", () => {
    document.body.innerHTML =
      '<main><ul class="item-cards"><li><div class="item-card-container"><button id="buy">Buy</button></div></li></ul></main>';
    const button = document.querySelector<HTMLButtonElement>("#buy")!;
    let count = 0;
    button.onclick = () => count++;
    enhance(document, classifyRoute(new URL("https://www.roblox.com/catalog")));
    button.click();
    expect(count).toBe(1);
    expect(document.querySelector("#buy")).toBe(button);
    clearMarks();
    expect(document.querySelector("[data-rc-card]")).toBeNull();
  });
  it("never tags a security notice or a title merely containing Ad", () => {
    document.body.innerHTML =
      '<div class="game-card-container"><a href="https://www.roblox.com/games/1?isAd=false">Adventures</a></div><div class="game-card-container"><a href="https://www.roblox.com/games/2?isAd=true">Sponsored experience</a></div><section class="section-content">Subscription security notice</section>';
    enhance(document, classifyRoute(new URL("https://www.roblox.com/home")));
    expect(document.querySelectorAll("[data-rc-sponsored]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-rc-upsell]")).toHaveLength(0);
  });
  it("does not turn a catalog list item into its own grid", () => {
    document.body.innerHTML =
      '<ul class="item-cards-stackable"><li class="catalog-item-container"><div class="item-card-container"></div></li></ul>';
    enhance(document, classifyRoute(new URL("https://www.roblox.com/catalog")));
    expect(document.querySelector("ul")?.hasAttribute("data-rc-grid")).toBe(
      true,
    );
    expect(document.querySelector("li")?.hasAttribute("data-rc-grid")).toBe(
      false,
    );
  });
  it("orders the audited Home wrappers without moving any native node", () => {
    document.body.innerHTML =
      '<div class="game-home-page-container"><div><div class="friend-carousel-container">Friends</div><div class="game-sort-carousel-wrapper"><div class="home-sort-header-container"><a>Continue</a></div></div><div>Recommended</div></div></div>';
    const original = document.querySelector(".friend-carousel-container")!;
    const parent = original.parentElement;
    enhance(document, classifyRoute(new URL("https://www.roblox.com/home")));
    expect(parent?.hasAttribute("data-rc-home-flow")).toBe(true);
    expect(document.querySelector("[data-rc-continue]")).not.toBeNull();
    expect(original.parentElement).toBe(parent);
    clearMarks();
    expect(document.querySelector("[data-rc-home-flow]")).toBeNull();
  });
  it("keeps native image URLs and marks ratios without a second artwork download", () => {
    document.body.innerHTML =
      '<div class="game-card-container"><a class="game-card-link"><div class="game-card-thumb-container"><img src="https://tr.rbxcdn.com/hash/384/216/Image/Jpeg/noFilter"></div></a></div>';
    const image = document.querySelector("img")!;
    const original = image.src;
    enhance(document, classifyRoute(new URL("https://www.roblox.com/home")));
    expect(image.src).toBe(original);
    expect(
      image.closest("[data-rc-ratio]")?.getAttribute("data-rc-ratio"),
    ).toBe("wide");
  });
  it("frames one horizontal tab list and excludes the Settings sidebar", () => {
    document.body.innerHTML =
      '<div class="rbx-tabs-horizontal"><ul class="nav-tabs" role="tablist"><li><button>Recent</button></li></ul></div><div class="settings-left-navigation"><ul class="menu-vertical" role="tablist"><li>Security</li></ul></div>';
    enhance(
      document,
      classifyRoute(new URL("https://www.roblox.com/my/avatar")),
    );
    expect(document.querySelectorAll("[data-rc-tabs]")).toHaveLength(1);
    expect(
      document.querySelector(".menu-vertical")?.hasAttribute("data-rc-tabs"),
    ).toBe(false);
  });
  it("does not style tiny friend face piles as experience cards or make infinite grids into shelves", () => {
    document.body.innerHTML =
      '<ul class="home-game-grid game-grid"><li class="game-card"><div class="game-card-container"><div class="game-card-friend-info"><div class="avatar-card"></div></div></div></li></ul>';
    enhance(document, classifyRoute(new URL("https://www.roblox.com/home")));
    expect(document.querySelectorAll("[data-rc-card]")).toHaveLength(1);
    expect(document.querySelector("[data-rc-shelf]")).toBeNull();
  });
});
describe("bounded avatar resource cache", () => {
  it("expires thumbnails and evicts the least recently used resource within the memory limit", () => {
    let now = 0;
    const cache = new ResourceCache(16, () => now);
    cache.set("a", "aaaa", 100);
    cache.set("b", "bbbb", 100);
    expect(cache.get("a")).toBe("aaaa");
    cache.set("c", "cccc", 100);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("aaaa");
    now = 101;
    expect(cache.get("a")).toBeUndefined();
    cache.set("huge", "x".repeat(20), 100);
    expect(cache.get("huge")).toBeUndefined();
  });
});

describe("public verification resource boundary", () => {
  it("permits the documented public user lookup without opening other user APIs", () => {
    expect(
      allowedResource("https://users.roblox.com/v1/users/123", "json"),
    ).toBe(true);
    for (const url of [
      "https://users.roblox.com/v1/users/0",
      "https://users.roblox.com/v1/users/123?private=true",
      "https://users.roblox.com/v1/users/123/roles",
      "https://users.roblox.com/v1/birthdate",
    ])
      expect(allowedResource(url, "json")).toBe(false);
    expect(
      allowedResource("https://users.roblox.com/v1/users/123", "text"),
    ).toBe(false);
  });
});

describe("glass and friends preference migrations", () => {
  it("drops the retired 3D setting and clamps finite glass controls", () => {
    const s = normalizeSettings({
      interactiveAvatar: true,
      showFriendActivity: false,
      showFriendsList: false,
      glassRefraction: 999,
      glassBlur: -1,
      glassOpacity: NaN,
      glassAberration: 0.77,
    });
    expect(s).not.toHaveProperty("interactiveAvatar");
    expect(s.showFriendActivity).toBe(false);
    expect(s.showFriendsList).toBe(false);
    expect(s.glassRefraction).toBe(100);
    expect(s.glassBlur).toBe(0);
    expect(s.glassOpacity).toBe(DEFAULTS.glassOpacity);
    expect(s.glassAberration).toBe(0.8);
  });
  it("allows only bounded public game-statistic batches", () => {
    expect(
      allowedResource(
        "https://games.roblox.com/v1/games?universeIds=123,456",
        "json",
      ),
    ).toBe(true);
    expect(
      allowedResource(
        "https://games.roblox.com/v1/games/votes?universeIds=123",
        "json",
      ),
    ).toBe(true);
    for (const url of [
      "https://games.roblox.com/v1/games?universeIds=1&private=true",
      "https://games.roblox.com/v1/games?universeIds=0",
      "https://games.roblox.com/v1/games/123/favorites",
      "https://games.roblox.com/v1/games?universeIds=" +
        Array.from({ length: 51 }, (_, i) => i + 1).join(","),
    ])
      expect(allowedResource(url, "json")).toBe(false);
  });
});
