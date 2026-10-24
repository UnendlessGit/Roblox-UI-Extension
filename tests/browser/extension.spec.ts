import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Worker,
  type Locator,
} from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
let context: BrowserContext,
  worker: Worker,
  profile: string,
  extensionId: string;
async function glassSurface(anchor: Locator) {
  await expect(anchor).toHaveAttribute("data-rc-glass-key", /\d+/);
  return anchor
    .page()
    .locator(
      `[data-rc-glass-owner="${await anchor.getAttribute("data-rc-glass-key")}"]`,
    );
}
const nativeHTML = `<!doctype html><html><head><meta name="user-data" data-userid="123" data-name="TestPlayer" data-displayname="Test Player"><title>Home - Roblox</title></head><body><div id="header"><div class="container-fluid"><div class="rbx-navbar-header">Roblox</div><div id="right-navigation-header"><button type="button" id="notifications">Notifications</button></div></div></div><nav id="left-navigation-container"><a href="/home">Home</a><a href="/users/123/profile">Profile</a><a href="/users/profile">Test Player</a><a href="/users/inventory">Inventory</a><a href="/plus?referrals">Share Plus to get 100 Robux</a><button type="button" id="store-action">Official Store</button></nav><div id="container-main"><div id="content"><div id="HomeContainer"><div class="section"><div class="container-header"><h1>Home</h1></div></div><div class="game-home-page-container"><section><h2>Continue</h2><ul class="game-grid"><li><div class="game-card-container"><a href="/games/1"><div class="game-card-thumb-container"><img width="256" height="256" alt="A square experience" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="></div><div class="game-card-name">Native experience</div></a><button type="button" id="native-control">Native action</button></div></li></ul></section></div></div></div></div><script>window.nativeClicks=0;document.querySelector('#native-control').onclick=()=>window.nativeClicks++;document.querySelector('#store-action').onclick=()=>document.querySelector('#native-control').textContent='Store action preserved';</script></body></html>`;
test.beforeAll(async ({}, testInfo) => {
  profile = await mkdtemp(join(tmpdir(), "roblox-cinema-test-"));
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    // Extensions need full Chromium, rather than Playwright's headless shell.
    channel: testInfo.project.use.launchOptions?.executablePath
      ? undefined
      : "chromium",
    executablePath: testInfo.project.use.launchOptions?.executablePath,
    args: [
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("https://www.roblox.com/**", (route) =>
    route.fulfill({ body: nativeHTML, contentType: "text/html" }),
  );
  await context.route("https://thumbnails.roblox.com/**", (route) =>
    route.fulfill({
      body: JSON.stringify(
        route.request().url().includes("avatar-3d")
          ? { state: "Completed", imageUrl: "https://t0.rbxcdn.com/descriptor" }
          : { data: [] },
      ),
      contentType: "application/json",
    }),
  );
  await context.route("https://users.roblox.com/v1/users/**", (r) =>
    r.fulfill({
      body: JSON.stringify({ id: 123, hasVerifiedBadge: true }),
      contentType: "application/json",
    }),
  );
  await context.route("https://*.rbxcdn.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/descriptor")
      return route.fulfill({
        body: JSON.stringify({
          obj: "30DAY-" + "a".repeat(32),
          mtl: "30DAY-" + "b".repeat(32),
        }),
        contentType: "application/json",
      });
    return route.fulfill({
      body: path.endsWith("b".repeat(32))
        ? "newmtl Avatar\nKd 0.3 0.5 0.9"
        : "o Body\nv -1 -1 0\nv 1 -1 0\nv 1 1 0\nv -1 1 0\nusemtl Avatar\nf 1 2 3 4",
      contentType: "text/plain",
    });
  });
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
});
test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});
test("the packaged MV3 extension injects without replacing native controls", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, interactiveAvatar: false },
    }),
  );
  const page = await context.newPage();
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(1);
  await expect(page.locator("roblox-cinema-hero")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-rc-shell", "ready");
  await page
    .getByRole("button", { name: "Native action", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { nativeClicks: number }).nativeClicks,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page
      .locator("#left-navigation-container")
      .getByRole("link", { name: "Profile", exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .locator("#left-navigation-container")
      .getByRole("link", { name: "Inventory", exact: true }),
  ).toHaveCount(1);
  await page
    .locator("#left-navigation-container")
    .getByRole("button", { name: "Official Store", exact: true })
    .click();
  await expect(page.locator("#native-control")).toHaveText(
    "Store action preserved",
  );
  await page.keyboard.press("Escape");
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: false } }),
  );
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(0);
  await expect(page.locator("#left-navigation-container")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-rc-enabled");
  await page.close();
});
test("packaged preferences persist and reapply to existing tabs", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    page.getByRole("heading", { name: "Beautifully simple." }),
  ).toBeVisible();
  await page.getByRole("switch", { name: /Enable Cinema/ }).check();
  await page.getByRole("switch", { name: /Hide promotional upsells/ }).check();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: /Hide promotional upsells/ }),
  ).toBeChecked();
  const site = await context.newPage();
  await site.goto("https://www.roblox.com/home");
  await expect(site.locator("html")).toHaveAttribute(
    "data-rc-hide-upsells",
    "",
  );
  await page.close();
  await site.close();
});
test("the resource worker rejects arbitrary and credential-bearing destinations", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const response = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "resource",
      url: "https://auth.roblox.com/v2/logout",
      kind: "json",
    }),
  );
  expect(response).toMatchObject({
    ok: false,
    error: "Resource not permitted",
  });
  await page.close();
});
test("Home keeps a still avatar and cannot load the retired 3D module", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, interactiveAvatar: true },
    }),
  );
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator("roblox-cinema-hero")).toHaveCount(1);
  await expect(
    page.locator(
      "roblox-cinema-hero canvas,roblox-cinema-hero .stage-controls",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Customize", exact: true }),
  ).toHaveCount(0);
  expect(
    requests.some((u) => u.includes("avatar-3d") || u.endsWith("/avatar.js")),
  ).toBe(false);
  await page.close();
});
test("rapid preference changes are serialized without dropping independent switches", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const settings = await page.evaluate(async () => {
    await Promise.all(
      [
        { reducedMotion: true },
        { reducedTransparency: true },
        { hideSponsored: true },
      ].map((patch) =>
        chrome.runtime.sendMessage({ type: "settings-patch", patch }),
      ),
    );
    return (await chrome.storage.local.get("settings")).settings;
  });
  expect(settings).toMatchObject({
    reducedMotion: true,
    reducedTransparency: true,
    hideSponsored: true,
  });
  await page.close();
});

// Structures below come from the authenticated October 2026 Roblox audit, stripped of account data.
function auditedPage(body: string, nativeCSS = "") {
  return `<!doctype html><html><head><title>Roblox layout regression</title><style>*{box-sizing:border-box}#header{position:fixed;top:0;width:100%}.container-fluid:before,.container-fluid:after{content:'';display:table}.menu-vertical{float:left;width:160px}.rbx-tab-content{float:left;width:calc(100% - 178px)}.right-panel{float:left;width:670px;margin-left:15px}.left-wrapper-placeholder{float:left;width:277px}.right-wrapper-placeholder,.right-wrapper{width:670px;height:39px}.game-card-container,.game-card-link,.game-card-thumb-container,.game-tile-thumb{width:150px}.game-card-thumb-container,.game-tile-thumb{height:150px}.game-card-link{display:flex;height:240px}.horizontally-scrollable,.home-page-carousel{width:9184px;height:240px}.horizontal-scroll-window{height:240px}.item-card-container,.item-card-thumb-container{width:126px}.item-card-thumb-container{height:126px}.thumbnail-2d-container{display:block;width:150px;height:150px}${nativeCSS}</style></head><body><header id="header"><div class="container-fluid"><div class="rbx-navbar-header"><a id="nav-logo-link" href="/home">Roblox</a></div><div id="right-navigation-header"><button>Notifications</button></div></div></header><nav id="navigation"><a href="/home">Home</a></nav><div id="container-main"><main id="content">${body}</main></div></body></html>`;
}
const nativeImage =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#335588"/></svg>',
  );
function auditedCard() {
  return `<li class="list-item game-card game-tile"><div class="game-card-container"><a href="/games/1" class="game-card-link"><div class="game-card-thumb-container"><span class="thumbnail-2d-container game-tile-thumb"><img src="${nativeImage}" alt="Square artwork"></span></div><div class="game-card-name">Experience</div></a></div></li>`;
}
test("audited Home uses one bounded scroll viewport and fills every card wrapper", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1722, height: 1080 });
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div id="HomeContainer"><div class="game-home-page-container"><div class="game-sort-carousel-wrapper"><h2>Continue</h2><div class="horizontal-scroller"><div class="horizontal-scroll-window"><div class="horizontally-scrollable" style="left:0px"><ul class="game-cards home-page-carousel">${auditedCard().repeat(12)}</ul></div></div></div></div><div><ul class="game-grid home-game-grid">${auditedCard().repeat(12)}</ul></div></div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  const viewport = page.locator(".horizontal-scroll-window");
  await expect(page.locator(".rc-shelf-controls")).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await page.locator(".home-page-carousel li").first().boundingBox())!
          .width,
    )
    .toBeGreaterThan(220);
  const bounds = await page
    .locator(".home-page-carousel li")
    .first()
    .boundingBox();
  const img = await page
    .locator(".home-page-carousel img")
    .first()
    .boundingBox();
  await expect
    .poll(() =>
      page
        .locator(".home-page-carousel li")
        .first()
        .evaluate((e) =>
          Math.abs(
            e.getBoundingClientRect().width -
              e.querySelector("img")!.getBoundingClientRect().width,
          ),
        ),
    )
    .toBeLessThan(0.5);
  expect(img!.height).toBeCloseTo(img!.width, 0);
  expect(
    await page
      .locator(".home-game-grid")
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe("grid");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Next experiences", exact: true })
    .click();
  await expect
    .poll(() => viewport.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(100);
  await page.close();
});
test("audited Settings keeps the nested content beside its sidebar at desktop and split widths", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/my/account", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div id="user-account"><div id="react-user-account-base"><h1>Settings</h1><div id="settings-container"><div class="settings-left-navigation"><ul class="menu-vertical" role="tablist"><li><a href="#!/info">Account info</a></li><li><a href="#!/security">Security</a></li></ul><div class="tab-content rbx-tab-content"><div class="tab-pane active"><h2>Account info</h2><input aria-label="Language" value="English"><button>Edit</button></div></div></div></div></div></div>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/my/account");
  for (const width of [1722, 1024, 820]) {
    await page.setViewportSize({ width, height: 1080 });
    const nav = await page.locator(".menu-vertical").boundingBox(),
      content = await page.locator(".tab-content").boundingBox();
    expect(content!.x).toBeGreaterThanOrEqual(nav!.x + nav!.width);
    expect(content!.width).toBeGreaterThan(300);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.abs(
            document.querySelector(".menu-vertical")!.getBoundingClientRect()
              .y -
              document
                .querySelector("#settings-container .rbx-tab-content")!
                .getBoundingClientRect().y,
          ),
        ),
      )
      .toBeLessThan(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator(".menu-vertical")).not.toHaveAttribute(
    "data-rc-tabs",
  );
  await page.close();
});
test("audited Avatar keeps its category bar and enlarged square items alongside the preview", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1722, height: 1080 });
  await page.route("https://www.roblox.com/my/avatar", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div id="avatar-web-app"><div id="avatar-react-container"><div><h1>Avatar Editor</h1><div class="left-wrapper-placeholder"><div class="left-wrapper"><div class="avatar-thumbnail"><div id="UserAvatar"><span class="thumbnail-2d-container"><img src="${nativeImage}" alt="Avatar"></span></div></div></div></div><div class="right-panel seven-column"><div class="right-wrapper-placeholder"><div class="right-wrapper"><div class="tab-wrapper"><div class="rbx-tabs-horizontal avatar-tabs-scroller"><ul class="nav-tabs" id="horizontal-tabs" role="tablist"><li class="active"><button>Recent</button></li><li><button>Clothing</button></li></ul></div></div></div></div><div class="tab-content rbx-tab-content"><ul class="item-cards-stackable">${Array.from({ length: 8 }, () => `<li class="item-card"><div class="item-card-container"><a class="item-card-thumb-container"><span class="thumbnail-2d-container"><img src="${nativeImage}" alt="Item"></span></a></div></li>`).join("")}</ul></div></div></div></div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/my/avatar");
  await expect(page.locator("html")).toHaveAttribute("data-rc-shell", "ready");
  const stage = await page.locator(".left-wrapper-placeholder").boundingBox(),
    wardrobe = await page.locator(".right-panel").boundingBox();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(
          document
            .querySelector(".left-wrapper-placeholder")!
            .getBoundingClientRect().y -
            document.querySelector(".right-panel")!.getBoundingClientRect().y,
        ),
      ),
    )
    .toBeLessThan(3);
  const item = await page
    .locator(".item-card-container img")
    .first()
    .boundingBox();
  expect(item!.width).toBeGreaterThan(200);
  expect(item!.width).toBeCloseTo(item!.height, 0);
  await expect(page.locator("[data-rc-tabs]")).toHaveCount(1);
  for (const width of [2560, 1722, 820]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect
      .poll(() =>
        page.locator("#horizontal-tabs").evaluate((e) => {
          const bar = e.getBoundingClientRect();
          const first = e
            .querySelector("li:first-child button")!
            .getBoundingClientRect();
          const last = e
            .querySelector("li:last-child button")!
            .getBoundingClientRect();
          return Math.max(
            Math.abs(first.left - bar.left - 6),
            Math.abs(bar.right - last.right - 6),
          );
        }),
      )
      .toBeLessThan(1);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});
test("native Angular hidden states stay hidden after card/grid enhancement", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/users/123/inventory", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<ul class="item-cards ng-hide"><li>Empty inventory state</li></ul><ul class="item-cards"><li class="hidden"><div class="item-card-container">Hidden item</div></li></ul>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/users/123/inventory");
  await expect(page.getByText("Empty inventory state")).not.toBeVisible();
  await expect(page.getByText("Hidden item")).not.toBeVisible();
  await page.close();
});
test("modern SDUI discovery cards expand their native slots and retain square artwork", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1722, height: 1080 });
  const tile = `<div data-testid="collection-carousel-item-slot" style="flex-shrink:0;width:156px"><div data-testid="sdui-game-tile" class="sdui-game-tile"><a href="/games/1" class="sdui-game-tile-primary"><div data-testid="sdui-tile-image-container" class="sdui-tile-image-container" style="aspect-ratio:1/1"><span class="thumbnail-2d-container"><img src="${nativeImage}" alt="Discover artwork"></span></div><div data-sdui-text="true">Experience</div></a></div></div>`;
  await page.route("https://www.roblox.com/charts", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<h1>Charts</h1><div data-testid="collection-carousel-viewport"><div style="display:flex;overflow-x:hidden">${tile.repeat(12)}</div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/charts");
  await expect(page.locator("[data-rc-card]")).toHaveCount(12);
  await expect
    .poll(() =>
      page
        .locator('[data-testid="collection-carousel-item-slot"]')
        .first()
        .evaluate((e) =>
          Math.abs(
            e.getBoundingClientRect().width -
              e.querySelector("img")!.getBoundingClientRect().width,
          ),
        ),
    )
    .toBeLessThan(0.5);
  const slot = await page
    .locator('[data-testid="collection-carousel-item-slot"]')
    .first()
    .boundingBox();
  const image = await page.locator("img").first().boundingBox();
  expect(slot!.width).toBeGreaterThan(220);
  expect(
    await page
      .locator('[data-testid="collection-carousel-item-slot"]')
      .first()
      .evaluate((e) =>
        Math.abs(
          e.getBoundingClientRect().width -
            e.querySelector("img")!.getBoundingClientRect().width,
        ),
      ),
  ).toBeLessThan(0.5);
  expect(image!.height).toBeCloseTo(image!.width, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});
test("Discovery paging keeps visible native cards clickable and restores native inert flags on disable", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, reducedMotion: true },
    }),
  );
  const page = await context.newPage();
  await page.route("https://www.roblox.com/charts", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<h1>Charts</h1><div data-testid="collection-carousel-viewport"><div style="display:flex;overflow-x:hidden">${Array.from({ length: 12 }, (_, i) => `<div data-testid="collection-carousel-item-slot"><div data-testid="sdui-carousel-item-${i}" inert aria-hidden="true"><div data-testid="sdui-game-tile" class="sdui-game-tile"><a href="/games/${i + 1}" class="sdui-game-tile-primary">Experience ${i + 1}</a></div></div></div>`).join("")}</div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/charts");
  await expect(
    page.getByRole("link", { name: "Experience 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next experiences", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Experience 6", exact: true }),
  ).toBeVisible();
  const firstOnPage = page.getByTestId("sdui-carousel-item-5");
  await firstOnPage.evaluate((e) => {
    e.setAttribute("inert", "");
    e.setAttribute("aria-hidden", "true");
  });
  await expect(firstOnPage).not.toHaveAttribute("inert");
  await expect(firstOnPage).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByTestId("sdui-carousel-item-0")).toHaveAttribute(
    "inert",
  );
  await page.getByRole("link", { name: "Experience 6", exact: true }).click();
  await expect(page).toHaveURL("https://www.roblox.com/games/6");
  await page.goto("https://www.roblox.com/charts");
  await expect(
    page.getByRole("link", { name: "Experience 1", exact: true }),
  ).toBeVisible();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: false } }),
  );
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(0);
  await expect(page.getByTestId("sdui-carousel-item-0")).toHaveAttribute(
    "inert",
  );
  await expect(page.getByTestId("sdui-carousel-item-0")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await page.close();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
});

test("community sidebar and content remain separate without fixed-position overlap", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1722, height: 1080 });
  await page.route("https://www.roblox.com/communities/123", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div class="group-details-container-desktop-and-tablet new-list"><aside class="groups-list-sidebar" style="position:fixed;left:289px;top:40px;width:327px">Communities</aside><div class="group-details" style="width:970px;margin:auto"><h1>Community</h1><ul class="game-cards"><li><div class="game-card game-tile"><div class="game-card-container"><div class="game-card-thumb-container"><span class="thumbnail-2d-container"><img src="' +
          nativeImage +
          '"></span></div></div></div></li></ul></div></div>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/communities/123");
  const nav = await page.locator(".groups-list-sidebar").boundingBox(),
    content = await page.locator(".group-details").boundingBox();
  expect(content!.x).toBeGreaterThan(nav!.x + nav!.width);
  expect(nav!.y).toBeGreaterThanOrEqual(88);
  const image = await page.locator("img").boundingBox();
  expect(image!.width).toBeGreaterThan(250);
  await page.close();
});
test("current item details and recommendations fit desktop and split-browser widths", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/catalog/123/Item", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div id="item-details-container"><div class="page-content"><div class="clearfix"><div id="item-thumbnail-container-frontend"><div class="item-details-thumbnail-container" style="width:420px;height:420px"><span class="thumbnail-2d-container"><img src="${nativeImage}" alt="Item preview"></span></div></div><div id="item-info-container-frontend"><div class="item-details-info-content" style="width:526px"><div class="item-details-name-row"><h1>Item</h1></div><button>Buy</button></div></div></div><div class="item-list-cards">${Array.from({ length: 7 }, () => `<div class="item-list-item-card"><div class="grid-item-container" style="width:100px"><div class="item-card-container"><a class="item-card-thumb-container"><span class="thumbnail-2d-container"><img src="${nativeImage}"></span></a></div></div></div>`).join("")}</div></div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/catalog/123/Item");
  for (const width of [1722, 820, 600]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Buy", exact: true }),
  ).toBeVisible();
  await page.close();
});
test("bundle contents start closed, survive hydration, and preserve native item actions", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, hideSponsored: false },
    }),
  );
  const page = await context.newPage();
  const included = `<div id="populated-item-list" class="item-list-container"><div class="item-list-carousel-title"><h1 class="font-header-1">Included Items</h1></div><div class="item-list-carousel" id="native-bundle-content"><div class="item-list-cards"></div></div></div>`;
  const recommended = `<section id="item-list-container-recommendations"><h2>Recommended</h2><a href="/catalog/42">Recommended item</a></section>`;
  await page.route("https://www.roblox.com/bundles/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        recommended + included,
        ".item-list-carousel-title{display:flex;align-items:center}",
      ),
    }),
  );
  // Two unrelated bundle IDs verify that the control follows the shared native structure.
  for (const bundle of ["291/Zombie", "305/Spaceman"]) {
    await page.goto(`https://www.roblox.com/bundles/${bundle}`);
    const toggle = page.getByRole("button", {
      name: "Included Items",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#native-bundle-content")).not.toBeVisible();
    const controlBox = (await toggle.boundingBox())!;
    const titleBox = (await page
      .locator(".item-list-carousel-title")
      .boundingBox())!;
    expect(controlBox.width).toBeCloseTo(titleBox.width, 0);
    await expect(
      page.getByRole("link", { name: "Recommended item", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      const list = document.querySelector(
        "#populated-item-list .item-list-cards",
      )!;
      const link = document.createElement("a");
      link.href = "/catalog/99/Native-Included-Item";
      link.textContent = "Native included item";
      link.onclick = (event) => {
        event.preventDefault();
        document.querySelector(
          "#item-list-container-recommendations h2",
        )!.textContent = "Native item action retained";
      };
      list.append(link);
    });
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("link", { name: "Native included item", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Native item action retained" }),
    ).toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("link", { name: "Native included item", exact: true }),
    ).not.toBeVisible();
    // React can replace the whole carousel after receiving its data.
    await page.evaluate(() => {
      const content = document.querySelector("#native-bundle-content")!;
      const replacement = document.createElement("div");
      replacement.className = "item-list-carousel";
      replacement.innerHTML =
        '<div class="item-list-cards"><a href="/catalog/100">Updated included item</a></div>';
      content.replaceWith(replacement);
    });
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(
      page.getByRole("link", { name: "Updated included item", exact: true }),
    ).toBeVisible();
  }
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: false } }),
  );
  await expect(
    page.getByRole("button", { name: "Included Items", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Included Items", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Updated included item", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#populated-item-list .item-list-carousel"),
  ).not.toHaveAttribute("id");
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  await expect(
    page.getByRole("button", { name: "Included Items", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.close();
});

test("empty bundle sections recover public items across bundles, wait for disclosure, and yield to native hydration", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, hideSponsored: false },
    }),
  );
  const page = await context.newPage();
  const detailsRequests: string[] = [];
  const catalogRoute = "https://catalog.roblox.com/v1/bundles/**";
  const thumbnailRoute =
    /^https:\/\/thumbnails\.roblox\.com\/v1\/(assets|bundles\/thumbnails)\?/;
  await context.route(catalogRoute, (route) => {
    const match = new URL(route.request().url()).pathname.match(
      /bundles\/(\d+)\/(details|recommendations)/,
    )!;
    const id = Number(match[1]);
    if (match[2] === "details") detailsRequests.push(match[1]);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        match[2] === "details"
          ? {
              id,
              items: [
                { id: id + 2000, name: `Part ${id}`, type: "Asset" },
                { id: id + 3000, name: "Default outfit", type: "UserOutfit" },
              ],
            }
          : {
              data: [
                {
                  id: id + 1000,
                  name: `Suggested bundle ${id}`,
                  creator: { id: 1, name: "Roblox", type: "User" },
                  product: { priceInRobux: 550, isForSale: true },
                },
              ],
            },
      ),
    });
  });
  await context.route(thumbnailRoute, (route) => {
    const url = new URL(route.request().url());
    const ids = (
      url.searchParams.get("assetIds") ||
      url.searchParams.get("bundleIds") ||
      ""
    ).split(",");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: ids.map((id) => ({
          targetId: Number(id),
          state: "Completed",
          imageUrl: `https://tr.rbxcdn.com/recovered/${id}/420/420/Image/Png/noFilter`,
        })),
      }),
    });
  });
  await context.route("https://tr.rbxcdn.com/recovered/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420"><rect width="420" height="420" fill="white"/></svg>',
    }),
  );
  await page.route("https://www.roblox.com/bundles/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div id="item-list-container-recommendations"><div class="item-list"></div></div><div id="populated-sponsored-catalog-items"><h2>Sponsored</h2><a href="/catalog/90">Native sponsor</a></div><div id="populated-item-list"><div class="item-list-carousel-title"><h1>Included Items</h1></div><div class="item-list-carousel"><div class="item-list-cards"></div></div></div>',
      ),
    }),
  );
  try {
    for (const bundle of [291, 305]) {
      await page.goto(`https://www.roblox.com/bundles/${bundle}/Bundle`);
      await expect(
        page.getByRole("link", {
          name: `Suggested bundle ${bundle}`,
          exact: true,
        }),
      ).toBeVisible();
      expect(detailsRequests).not.toContain(String(bundle));
      await expect(
        page.locator('[data-rc-product-recovery="recommended"]'),
      ).toContainText("550 Robux · standard");
      await expect(
        page.getByRole("link", { name: "Native sponsor", exact: true }),
      ).toBeVisible();
      const toggle = page.getByRole("button", {
        name: "Included Items",
        exact: true,
      });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      const included = page.getByRole("link", {
        name: `Part ${bundle}`,
        exact: true,
      });
      await expect(included).toBeVisible();
      await expect(included).toHaveAttribute(
        "href",
        `/catalog/${bundle + 2000}/Part-${bundle}`,
      );
      await expect(
        page.getByText("Default outfit", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-rc-product-recovery="included"] img'),
      ).toHaveAttribute("src", new RegExp(`/recovered/${bundle + 2000}/`));
      await toggle.click();
      await expect(included).not.toBeVisible();
      await toggle.click();
      if (bundle === 291) {
        await page.evaluate(() => {
          document.querySelector(
            "#item-list-container-recommendations .item-list",
          )!.innerHTML =
            '<a href="/bundles/99">Native recommendation arrived</a>';
          document.querySelector(
            "#populated-item-list .item-list-cards",
          )!.innerHTML = '<a href="/catalog/98">Native part arrived</a>';
        });
        await expect(page.locator("[data-rc-product-recovery]")).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Native part arrived", exact: true }),
        ).toBeVisible();
      }
    }
    expect(detailsRequests).toEqual(["291", "305"]);
    await page.setViewportSize({ width: 698, height: 987 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const picture = (await page
      .locator('[data-rc-product-recovery="included"] img')
      .boundingBox())!;
    expect(picture.width).toBeGreaterThan(200);
    expect(picture.width).toBeCloseTo(picture.height, 0);
    await worker.evaluate(() =>
      chrome.storage.local.set({ settings: { enabled: false } }),
    );
    await expect(page.locator("[data-rc-product-recovery]")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Included Items", exact: true }),
    ).toBeVisible();
  } finally {
    await page.close();
    await context.unroute(catalogRoute);
    await context.unroute(thumbnailRoute);
    await context.unroute("https://tr.rbxcdn.com/recovered/**");
  }
});

test("accessory recovery uses its public type and filters malformed IDs and foreign thumbnails", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  const economyRoute = "https://economy.roblox.com/v2/assets/**/details";
  const recommendationsRoute =
    "https://catalog.roblox.com/v2/recommendations/assets**";
  const thumbnailsRoute = "https://thumbnails.roblox.com/v1/assets**";
  const queried: string[] = [];
  await context.route(economyRoute, (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    queried.push(id);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        AssetId: Number(id),
        AssetTypeId: 47,
        Name: id === "4321" ? "Recovered accessory" : "Current item",
        Creator: { CreatorTargetId: 9, Name: "Creator", CreatorType: "Group" },
        PriceInRobux: 65,
        IsForSale: true,
      }),
    });
  });
  await context.route(recommendationsRoute, (route) => {
    expect(new URL(route.request().url()).searchParams.get("assetTypeId")).toBe(
      "47",
    );
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [4321, "javascript:bad", 4321, -3, 0] }),
    });
  });
  await context.route(thumbnailsRoute, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            targetId: 4321,
            state: "Completed",
            imageUrl: "https://foreign.invalid/tracking.png",
          },
        ],
      }),
    }),
  );
  await page.route("https://www.roblox.com/catalog/1234/Accessory", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<h1>Accessory</h1><div id="item-list-container-recommendations"><div class="item-list"></div></div>',
      ),
    }),
  );
  try {
    await page.goto("https://www.roblox.com/catalog/1234/Accessory");
    await expect(
      page.getByRole("link", { name: "Recovered accessory", exact: true }),
    ).toHaveAttribute("href", "/catalog/4321/Recovered-accessory");
    await expect(
      page.getByRole("link", { name: "Creator", exact: true }),
    ).toHaveAttribute("href", "/groups/9");
    await expect(page.locator("[data-rc-product-recovery] img")).toHaveCount(0);
    expect(queried).toEqual(["1234", "4321"]);
    await page.route(
      "https://www.roblox.com/catalog/4321/Recovered-accessory",
      (route) =>
        route.fulfill({
          contentType: "text/html",
          body: auditedPage(
            '<h1>Recovered accessory details</h1><button type="button">Buy</button>',
          ),
        }),
    );
    await page
      .getByRole("link", { name: "Recovered accessory", exact: true })
      .click();
    await expect(page).toHaveURL(
      "https://www.roblox.com/catalog/4321/Recovered-accessory",
    );
    await expect(
      page.getByRole("heading", {
        name: "Recovered accessory details",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-rc-family",
      "item",
    );
    await page.goto("https://www.roblox.com/users/123/inventory");
    await expect(page.locator("[data-rc-product-recovery]")).toHaveCount(0);
  } finally {
    await page.close();
    await context.unroute(economyRoute);
    await context.unroute(recommendationsRoute);
    await context.unroute(thumbnailsRoute);
  }
});

test("delayed component classes and thumbnail sources enhance without duplicated navigation", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div id="HomeContainer"><div id="delayed"><a class="game-card-link"><div class="game-card-thumb-container"><span class="thumbnail-2d-container"><img id="late-image"></span></div></a></div></div>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(1);
  await page.evaluate(() => {
    document.querySelector("#delayed")!.className = "game-card-container";
  });
  await expect(page.locator("#delayed")).toHaveAttribute("data-rc-card", "");
  await page.evaluate(() =>
    document
      .querySelector("#late-image")!
      .setAttribute(
        "src",
        "https://tr.rbxcdn.com/hash/384/216/Image/Webp/noFilter",
      ),
  );
  await expect(page.locator(".game-card-thumb-container")).toHaveAttribute(
    "data-rc-ratio",
    "wide",
  );
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(1);
  await page.close();
});
test("Home shelf arrows recover when Roblox replaces the inner scroll container", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div id="HomeContainer"><div class="game-sort-carousel-wrapper"><h2>Continue</h2><div class="horizontal-scroller"><div class="horizontal-scroll-window"><div class="horizontally-scrollable"><ul class="game-cards home-page-carousel">${auditedCard().repeat(12)}</ul></div></div></div></div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator(".rc-shelf-controls")).toHaveCount(1);
  await page.evaluate(() => {
    const viewport = document.querySelector(".horizontal-scroll-window")!;
    viewport.replaceWith(viewport.cloneNode(true));
  });
  await expect(page.locator(".rc-shelf-controls")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Next experiences", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator(".horizontal-scroll-window").evaluate((e) => e.scrollLeft),
    )
    .toBeGreaterThan(100);
  await page.close();
});
test("dormant native feedback cannot leak a red strip while active warnings stay visible", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div id="HomeContainer"><div class="alert-system-feedback"><div class="alert alert-warning" style="position:fixed;top:-40px;height:50px">Dormant error</div><div class="alert alert-warning on">Active warning</div></div></div>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  await expect(page.getByText("Dormant error")).not.toBeVisible();
  await expect(page.getByText("Active warning")).toBeVisible();
  await page.close();
});
test("Home hero migrates from the initial main placeholder when Roblox hydrates its Home container", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<meta name="user-data" data-userid="123" data-name="Player"><div id="initial-placeholder">Loading</div>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator("#content > roblox-cinema-hero")).toHaveCount(1);
  await page.evaluate(() => {
    const home = document.createElement("div");
    home.id = "HomeContainer";
    document.querySelector("#content")!.append(home);
  });
  await expect(page.locator("#HomeContainer > roblox-cinema-hero")).toHaveCount(
    1,
  );
  await expect(page.locator("roblox-cinema-hero")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});

function realWideCard(index: number) {
  return `<li class="list-item hover-game-tile grid-tile" data-testid="wide-game-tile"><div class="featured-game-container game-card-container"><a class="game-card-link" href="/games/${index}"><div class="featured-game-icon-container"><span class="thumbnail-2d-container brief-game-icon"><img alt="Wide ${index}" src="${nativeImage}"></span></div><div class="info-container"><div class="game-card-name">Wide ${index}</div></div></a><button class="native-test-action">Native action ${index}</button></div></li>`;
}
function realisticHome() {
  return auditedPage(
    `<meta name="user-data" data-userid="123" data-name="Player"><div id="HomeContainer"><div class="game-home-page-container"><div><div class="friend-carousel-container"><div class="react-friends-carousel-container" style="height:187px"><div class="container-header people-list-header"><h2>Friends</h2></div><div class="friends-carousel-list-container"><div class="friends-carousel-tile"><button>Friend</button><div class="add-friends-icon-container"></div><div class="friends-carousel-tile-labels"><span class="friends-carousel-display-name">Friend</span><div class="friends-carousel-tile-experience" style="font-size:6px">Experience title</div></div></div></div></div></div><div data-testid="home-page-game-grid"><div class="home-sort-header-container"><h2>Recommended For You</h2></div><div class="game-grid home-game-grid wide-game-tile-game-grid">${Array.from({ length: 8 }, (_, i) => realWideCard(i + 1)).join("")}<div data-testid="sentinel-tile" class="grid-item-container game-card-container invisible"></div></div></div><div class="game-sort-carousel-wrapper"><div class="container-header"><h2>Continue</h2></div><div class="horizontal-scroller"><div class="horizontal-scroll-window"><div class="horizontally-scrollable"><ul class="game-cards home-page-carousel">${Array.from({ length: 12 }, () => auditedCard()).join("")}</ul></div></div></div></div><div data-testid="home-page-game-grid"><div class="home-sort-header-container"><h2>Recommended For You</h2></div><div class="game-grid home-game-grid wide-game-tile-game-grid">${Array.from({ length: 8 }, (_, i) => realWideCard(i + 9)).join("")}</div></div></div></div></div>`,
    ".featured-game-icon-container{width:280px;float:left}.brief-game-icon{width:280px;height:157px}.featured-game-container{width:280px;max-height:196px}.add-friends-icon-container:before{content:' ';background:#242429}.home-game-grid{grid-auto-rows:196px}.home-game-grid>li{max-height:196px}.info-container{float:left}.info-metadata-container{width:240px}",
  );
}
test("Continue adapts its whole-card count to width, retains its item anchor, and bounds its final batch", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({ body: realisticHome(), contentType: "text/html" }),
  );
  await page.goto("https://www.roblox.com/home");
  const viewport = page.locator(".horizontal-scroll-window");
  await expect(viewport).toHaveCSS("--rc-page-card", /px$/);
  for (const size of [
    { width: 698, height: 987 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1722, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () =>
        viewport.evaluate((e) => {
          const v = e.getBoundingClientRect();
          return [...e.querySelectorAll("li")].filter((c) => {
            const b = c.getBoundingClientRect();
            return b.left >= v.left - 0.6 && b.right <= v.right + 0.6;
          }).length;
        }),
      )
      .toBe(
        Math.max(
          1,
          Math.round(((await viewport.boundingBox())!.width + 20) / 280),
        ),
      );
  }
  await page
    .getByRole("button", { name: "Next experiences", exact: true })
    .click();
  await expect
    .poll(() =>
      viewport.evaluate((e) => {
        const v = e.getBoundingClientRect();
        return [...e.querySelectorAll("li")].findIndex(
          (c) => Math.abs(c.getBoundingClientRect().left - v.left) < 1,
        );
      }),
    )
    .toBe(6);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(() =>
      viewport.evaluate((e) =>
        Math.abs(
          e.querySelectorAll("li")[6].getBoundingClientRect().left -
            e.getBoundingClientRect().left,
        ),
      ),
    )
    .toBeLessThan(1);
  await page
    .getByRole("button", { name: "Next experiences", exact: true })
    .click();
  await expect
    .poll(() =>
      viewport.evaluate((e) =>
        Math.abs(
          e.querySelectorAll("li")[10].getBoundingClientRect().left -
            e.getBoundingClientRect().left,
        ),
      ),
    )
    .toBeLessThan(1);
  await expect(
    page.getByRole("button", { name: "Next experiences", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});
test("Home composes the hero behind friends, limits all recommendation groups together, and fills artwork", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({ body: realisticHome(), contentType: "text/html" }),
  );
  await page.goto("https://www.roblox.com/home");
  await expect(
    page.locator("[data-rc-home-flow]>roblox-cinema-hero"),
  ).toHaveCount(1);
  await expect(page.locator(".home-game-grid>li:visible")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "Recommended For You", exact: true }),
  ).toHaveCount(1);
  expect(
    await page
      .getByRole("heading", { name: "Recommended For You", exact: true })
      .filter({ visible: true })
      .count(),
  ).toBe(1);
  const bounds = await page.evaluate(() => {
    const r = (s: string) =>
      document.querySelector(s)!.getBoundingClientRect().toJSON();
    return {
      hero: r("roblox-cinema-hero"),
      friends: r("[data-rc-friends]"),
      continue: r("[data-rc-continue]"),
      cell: r(".home-game-grid>li"),
      image: r(".home-game-grid img"),
      nextRow: r(".home-game-grid>li:nth-child(4)"),
    };
  });
  await expect(page.locator(".friends-carousel-tile-experience")).toHaveCSS(
    "font-size",
    "12px",
  );
  await expect(page.locator(".friends-carousel-display-name")).toHaveCSS(
    "font-weight",
    "650",
  );
  expect(
    await page
      .locator(".add-friends-icon-container")
      .evaluate((e) => getComputedStyle(e, "::before").backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  expect(bounds.friends.y).toBeGreaterThan(bounds.hero.y);
  expect(bounds.continue.y).toBeGreaterThanOrEqual(bounds.friends.bottom);
  expect(bounds.image.width).toBeCloseTo(bounds.cell.width, 0);
  expect(bounds.image.width / bounds.image.height).toBeCloseTo(16 / 9, 2);
  expect(bounds.cell.bottom).toBeGreaterThan(bounds.image.bottom);
  expect(bounds.nextRow.top).toBeGreaterThanOrEqual(bounds.cell.bottom + 24);
  await page.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(page.locator(".home-game-grid>li:visible")).toHaveCount(12);
  await expect(page.getByTestId("sentinel-tile")).not.toBeVisible();
  await page.getByRole("button", { name: "Show less", exact: true }).click();
  await expect(page.locator(".home-game-grid>li:visible")).toHaveCount(6);
  await expect(
    page.locator('roblox-cinema-hero [aria-label="Verified"]'),
  ).toHaveCount(1);
  await page.close();
});
test("the rail drawer overlays without resizing content and restores keyboard focus", async () => {
  const page = await context.newPage();
  await page.goto("https://www.roblox.com/home");
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  const before = await page.locator("#content").boundingBox();
  await expect(page.locator("roblox-cinema-shell .rail-link")).toHaveCount(4);
  await expect(page.locator("roblox-cinema-shell .dock")).toHaveCount(0);
  await toggle.click();
  await expect(
    page.locator("roblox-cinema-shell .rail-toggle"),
  ).toHaveAttribute("aria-expanded", "true");
  expect((await page.locator("#content").boundingBox())!.width).toBe(
    before!.width,
  );
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("searchbox", { name: "Search Roblox", exact: true })
    .fill("parkour");
  await expect(
    page.getByRole("combobox", { name: "Search category" }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "parkour in People" }).click();
  await expect(page).toHaveURL(/search\/users\?keyword=parkour/);
  await page.close();
});
test("experience events are bounded and related games use responsive square slots", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://www.roblox.com/games/10", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<style>html .wide-game-tile-game-grid .experience-events-tile.image-overlay.contained-tile{padding:0!important;max-height:196px}.game-details-page-events-grid{grid-auto-rows:196px}</style><div id="game-detail-page"><div class="game-grid wide-game-tile-game-grid game-details-page-events-grid">${realWideCard(1).replace("grid-tile", "grid-tile experience-events-tile image-overlay contained-tile")}${realWideCard(2).replace("grid-tile", "grid-tile experience-events-tile image-overlay contained-tile")}</div><div class="container-list games-detail"><h3>People Also Join</h3><div data-testid="game-carousel" class="game-carousel">${Array.from(
          { length: 6 },
          () =>
            auditedCard()
              .replace(/^<li[^>]*>/, "")
              .replace(/<\/li>$/, ""),
        ).join("")}</div></div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/games/10");
  await expect(page.locator("[data-rc-events]")).toHaveCount(1);
  const a = await page.locator("[data-rc-events]>li").nth(0).boundingBox(),
    b = await page.locator("[data-rc-events]>li").nth(1).boundingBox(),
    image = await page.locator("[data-rc-events] img").first().boundingBox();
  expect(b!.x).toBeGreaterThan(a!.x + a!.width + 15);
  expect(image!.width).toBeLessThan(a!.width);
  expect(image!.width / image!.height).toBeCloseTo(16 / 9, 2);
  expect(a!.height).toBeGreaterThan(image!.height + 28);
  await expect
    .poll(() =>
      page.locator(".game-carousel").evaluate((e) => {
        const width = e.getBoundingClientRect().width,
          slots = Math.max(1, Math.round((width + 20) / 280));
        return Math.abs(
          e.querySelector("[data-rc-card]")!.getBoundingClientRect().width -
            (width - 20 * (slots - 1)) / slots,
        );
      }),
    )
    .toBeLessThan(0.5);
  await expect(
    page.getByRole("button", { name: "Next experiences", exact: true }),
  ).toBeVisible();
  // Native event collections can hydrate from zero to one to multiple entries.
  await page
    .locator("[data-rc-events]>li")
    .last()
    .evaluate((e) => e.remove());
  await expect(page.locator("[data-rc-events]>li")).toHaveCount(1);
  expect(
    (await page.locator("[data-rc-events]>li").boundingBox())!.width,
  ).toBeLessThanOrEqual(380);
  await page.locator("[data-rc-events]>li").evaluate((e) => e.remove());
  await expect(page.locator("[data-rc-events]>li")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});
test("experience actions stay together at the right with separated vote counts", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/games/10", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div id="game-detail-page"><ul class="favorite-follow-vote-share"><li class="game-favorite-button-container"><button>Favorite</button></li><li class="game-follow-button-container"><button>Notify</button></li><li id="voting-section"><div class="vote-summary"><div class="voting-details"><div class="users-vote"><div class="upvote"><button>Like</button></div><div class="vote-details"><div class="vote-container"></div><div class="vote-numbers"><div class="count-left"><span>81K+</span></div><div class="count-right"><span>31K+</span></div></div></div><div class="downvote"><button>Dislike</button></div></div></div></div></li><li class="social-media-share">\n </li></ul></div>`,
        ".favorite-follow-vote-share{list-style:none;padding:0}.favorite-follow-vote-share>li{float:left;width:25%}.game-favorite-button-container button,.game-follow-button-container button{height:47px}#voting-section{position:relative;bottom:-24px}.upvote,.downvote{position:absolute;top:-25px}.downvote{right:0}.count-left{float:left}.count-right{float:right}",
      ),
    }),
  );
  await page.goto("https://www.roblox.com/games/10");
  for (const width of [1722, 698]) {
    await page.setViewportSize({ width, height: 987 });
    await expect
      .poll(() =>
        page.locator(".favorite-follow-vote-share").evaluate((e) => {
          const row = e.getBoundingClientRect();
          const boxes = [
            ".game-favorite-button-container",
            ".game-follow-button-container",
            ".upvote",
            ".downvote",
          ].map((s) => e.querySelector(s)!.getBoundingClientRect());
          const left = e.querySelector(".count-left")!.getBoundingClientRect(),
            right = e.querySelector(".count-right")!.getBoundingClientRect();
          return (
            boxes.every((b, i) => !i || b.left >= boxes[i - 1].right + 10) &&
            Math.abs(boxes[0].top - boxes[2].top) < 12 &&
            row.right - boxes[3].right < 1 &&
            right.left - left.right >= 19
          );
        }),
      )
      .toBe(true);
  }
  await page.close();
});

test("portalled notifications keep native actions and receive glass without replacing native nodes", async () => {
  const page = await context.newPage();
  await page.goto("https://www.roblox.com/home");
  await page.evaluate(() => {
    const portal = document.createElement("div");
    portal.setAttribute("role", "dialog");
    portal.className = "foundation-web-portal-zindex";
    portal.innerHTML =
      '<div class="notification-stream-base"><div class="notification-stream-header">Notifications</div><button id="portal-native">Native notification action</button></div>';
    document.body.append(portal);
    const b = portal.querySelector("button")!;
    b.onclick = () => (b.textContent = "Preserved action");
  });
  await expect(page.locator(".notification-stream-base")).toHaveAttribute(
    "data-rc-overlay",
    "",
  );
  await expect(
    page.locator(".notification-stream-base>.rc-glass-layer"),
  ).toHaveCount(1);
  await page
    .locator(".notification-stream-base>.rc-glass-layer")
    .evaluate((e) => e.remove());
  await expect(
    page.locator(".notification-stream-base>.rc-glass-layer"),
  ).toHaveCount(1);
  await page.locator("#portal-native").click();
  await expect(page.locator("#portal-native")).toHaveText("Preserved action");
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: false } }),
  );
  await expect(
    page.locator(".notification-stream-base>.rc-glass-layer"),
  ).toHaveCount(0);
  await expect(page.locator("#portal-native")).toHaveText("Preserved action");
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, interactiveAvatar: false },
    }),
  );
  await page.close();
});
test("glass paints the header and search with no moving highlights or ancestor opacity", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        reducedTransparency: false,
        glassHighlight: 0,
        glassRefraction: 42,
      },
    }),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://www.roblox.com/home");
  const layer = await glassSurface(page.locator("#header>.rc-glass-layer"));
  await expect(layer.locator("svg")).toHaveCount(1);
  await expect(layer.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    /42/,
  );
  expect(await layer.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  const glassBox = await layer.locator(".glass").boundingBox();
  expect(glassBox!.width).toBeGreaterThan(1000);
  expect(glassBox!.height).toBeGreaterThan(60);
  const rims = layer.locator(".rc-glass-render>span");
  await expect(rims.first()).toHaveCSS("opacity", "0");
  await expect(rims.first()).toHaveCSS("transition-duration", "0s");
  await expect(
    page.locator("roblox-cinema-shell .rail .rc-glass-layer"),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, reducedTransparency: true },
    }),
  );
  await expect(layer.locator("svg")).toHaveCount(0);
  await page.close();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
});
test("Home without history composes friends and keeps recommendations reachable; Continue deep links wait for hydration", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<meta name="user-data" data-userid="123" data-name="Player"><div id="HomeContainer"><div class="game-home-page-container"><div><div class="friend-carousel-container"><h2>Friends</h2></div><div data-testid="home-page-game-grid"><div class="home-sort-header-container"><h2>Recommended For You</h2></div><div class="game-grid home-game-grid">${Array.from({ length: 12 }, (_, i) => realWideCard(i)).join("")}</div></div></div></div></div>`,
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home#continue-playing");
  await expect(
    page.locator("[data-rc-home-flow]>roblox-cinema-hero"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Show more", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-game-grid>li:visible")).toHaveCount(6);
  await page.evaluate(() =>
    document
      .querySelector("[data-rc-home-flow]")!
      .insertAdjacentHTML(
        "beforeend",
        '<div class="game-sort-carousel-wrapper"><div class="container-header"><h2>Continue</h2></div><div class="horizontal-scroller"><div class="horizontal-scroll-window"><ul class="home-page-carousel"></ul></div></div></div>',
      ),
  );
  await expect(page.locator("[data-rc-continue]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.close();
});

test("search shares continuous header glass and follows all global material settings", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 0,
        glassOpacity: 20,
        glassBlur: 0,
        glassSaturation: 100,
        glassRefraction: 0,
        glassAberration: 0,
      },
    }),
  );
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage('<div style="height:1500px"></div>'),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  const backdrop = await page.addStyleTag({
    content:
      'body::after{content:"";position:fixed;inset:0 0 auto;height:500px;z-index:1029;pointer-events:none;background:white}',
  });
  const form = page.locator("roblox-cinema-shell .search-form");
  const anchor = page.locator("#header>.rc-glass-layer");
  const header = await glassSurface(anchor);
  await expect(header.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    "0",
  );
  await expect(anchor).toHaveCSS("clip-path", "none");
  await expect(form.locator(".rc-glass-layer")).toHaveCount(0);
  await expect(form).toHaveCSS("backdrop-filter", "none");
  await expect(form).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("#header")).toHaveCSS("mask-image", "none");
  await expect(page.locator("#header")).toHaveCSS("backdrop-filter", "none");
  // Pixels just inside and outside the rounded search edge share one tint,
  // including when the responsive header puts search on its second row.
  for (const width of [1440, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(async () => {
        const field = (await form.boundingBox())!;
        const material = (await anchor.boundingBox())!;
        return field.y + field.height <= material.y + material.height;
      })
      .toBe(true);
    const field = (await form.boundingBox())!;
    const png = await page.screenshot({
      clip: { x: 0, y: 0, width, height: 140 },
    });
    const pixels = await page.evaluate(
      async ({ source, points }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return points.map(([x, y]) =>
          Array.from(ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data),
        );
      },
      {
        source: `data:image/png;base64,${png.toString("base64")}`,
        points: [
          [field.x + field.width - 4, field.y + 2],
          [field.x + field.width + 4, field.y + 2],
          [field.x + field.width - 4, field.y + 8],
        ],
      },
    );
    expect(pixels[0]).toEqual(pixels[1]);
    expect(pixels[1]).toEqual(pixels[2]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await backdrop.evaluate((e) => {
    e.textContent =
      'body::after{content:"";position:fixed;inset:0 0 auto;height:500px;z-index:1029;pointer-events:none;background:repeating-linear-gradient(90deg,#f00 0 8px,#0f0 8px 16px,#00f 16px 24px)}';
  });
  const box = (await form.boundingBox())!;
  const clip = {
    x: box.x + box.width - 120,
    y: box.y + 12,
    width: 100,
    height: 16,
  };
  const before = await page.screenshot({ clip });
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 0,
        glassOpacity: 20,
        glassBlur: 0,
        glassSaturation: 100,
        glassRefraction: 100,
        glassAberration: 0,
      },
    }),
  );
  await expect(header.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    "-100",
  );
  const after = await page.screenshot({ clip });
  expect(before.equals(after)).toBe(false);
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 15,
        glassOpacity: 80,
        glassBlur: 24,
        glassSaturation: 200,
        glassRefraction: 90,
        glassAberration: 2.5,
      },
    }),
  );
  await expect(header.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    "-90",
  );
  await expect(header.locator(".glass__warp")).toHaveCSS(
    "backdrop-filter",
    /blur\(24px\) saturate\(2\)/,
  );
  await expect(header.locator(".rc-glass-render>span").first()).toHaveCSS(
    "opacity",
    "0.15",
  );
  await expect(form).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.15)");
  expect(after.equals(await page.screenshot({ clip }))).toBe(false);
  await page.getByRole("searchbox", { name: "Search Roblox" }).fill("player");
  const suggestions = page.getByRole("listbox", {
    name: "Search destinations",
  });
  await expect(
    (await glassSurface(suggestions.locator(":scope>.rc-glass-layer")))
      .locator("feDisplacementMap")
      .first(),
  ).toHaveAttribute("scale", "-90");
  await expect(
    (await glassSurface(suggestions.locator(":scope>.rc-glass-layer"))).locator(
      ".glass__warp",
    ),
  ).toHaveCSS("backdrop-filter", /blur\(24px\) saturate\(2\)/);
  expect(await suggestions.evaluate((e) => e.parentElement!.className)).toBe(
    "search-region",
  );
  await page.keyboard.press("Escape");
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, reducedTransparency: true },
    }),
  );
  await expect(header.locator("svg")).toHaveCount(0);
  await expect(form).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.close();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
});

test("the header fills the viewport top and fades only at the bottom", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 0,
        glassOpacity: 90,
        glassBlur: 0,
        glassSaturation: 100,
        glassRefraction: 0,
        glassAberration: 0,
      },
    }),
  );
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage('<div style="height:1500px"></div>'),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  await page.addStyleTag({
    content:
      'body::after{content:"";position:fixed;inset:0;z-index:1029;pointer-events:none;background:white}',
  });
  const material = await glassSurface(page.locator("#header>.rc-glass-layer"));
  await expect(material.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    "0",
  );
  const png = await page.screenshot({
    clip: { x: 300, y: 0, width: 1, height: 76 },
  });
  const pixels = await page.evaluate(
    async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 76;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 1, 76);
      return [0, 8, 16, 75].map((y) =>
        Array.from(ctx.getImageData(0, y, 1, 1).data),
      );
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
  expect(pixels[0]).toEqual(pixels[1]);
  expect(pixels[1]).toEqual(pixels[2]);
  expect(pixels[3][0]).toBeGreaterThan(pixels[0][0] + 100);
  await page.close();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
});

test("Marketplace filters escape the native scrolling strip and keep readable native actions", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/catalog", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div class="catalog-header"><h1 class="heading">Marketplace</h1><div class="catalog-heading-actions"><div class="catalog-search-options-top-bar"><div><button class="filter-select btn-primary-md" id="category"><span class="filter-display-text">All</span></button><div class="filters-modal-container" hidden><div class="header-container"><h3>Category</h3></div><div class="filter-options-container" style="background:#242429;overflow:auto;max-height:592px">${["All", "Body", "Clothing", "Accessories", "Animations", "Makeup"].map((x) => `<button class="filter-option" style="display:block;width:100%">${x}</button>`).join("")}</div><div class="action-buttons-container"><button id="apply" disabled>Apply</button></div></div></div></div></div></div><div id="results" style="height:900px">Native results</div><script>document.querySelector('#category').onclick=()=>document.querySelector('.filters-modal-container').hidden=false;document.querySelectorAll('.filter-option').forEach(b=>b.onclick=()=>{document.querySelector('#apply').disabled=false;document.querySelector('#results').dataset.selected=b.textContent});document.querySelector('#apply').onclick=()=>{document.querySelector('#results').textContent=document.querySelector('#results').dataset.selected;document.querySelector('.filters-modal-container').hidden=true};</script>`,
        ".catalog-search-options-top-bar{overflow:auto;height:42px}.btn-primary-md{color:#101014}.catalog-header{backdrop-filter:blur(24px)}",
      ),
    }),
  );
  await page.goto("https://www.roblox.com/catalog");
  await expect(page.locator("#category")).toHaveCSS(
    "color",
    "rgb(245, 245, 247)",
  );
  await expect(page.locator(".catalog-header")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  const before = (await page.locator("#results").boundingBox())!.y;
  await page.locator("#category").click();
  await expect(page.locator(".filter-options-container")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.getByRole("button", { name: "Clothing", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("#results")).toHaveText("Clothing");
  expect((await page.locator("#results").boundingBox())!.y).toBe(before);
  await page.setViewportSize({ width: 698, height: 600 });
  await page
    .locator("#category")
    .evaluate((e) => (e.parentElement!.style.marginLeft = "auto"));
  await page.locator("#category").click();
  const popup = page.locator(".filters-modal-container");
  await expect
    .poll(async () => {
      const box = (await popup.boundingBox())!;
      return (
        box.x >= 12 && box.x + box.width <= 686 && box.y + box.height <= 588
      );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Makeup", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("#results")).toHaveText("Makeup");
  await page.close();
});

test("glass and friend preferences persist, including range values, and remain reachable on the site", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const slider = page.getByRole("slider", { name: "Refraction", exact: true });
  await slider.press("End");
  await slider.press("ArrowLeft");
  await page
    .getByRole("switch", { name: /Show friends below game cards/ })
    .uncheck();
  await page.reload();
  await expect(slider).toHaveValue("99");
  await expect(
    page.getByRole("switch", { name: /Show friends below game cards/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: /Interactive avatar/ }),
  ).toHaveCount(0);
  await page.goto("https://www.roblox.com/home");
  await page
    .getByRole("button", { name: "Cinema settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cinema preferences",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("slider", { name: "Refraction", exact: true }),
  ).toHaveValue("99");
  await dialog.getByRole("switch", { name: /Enable Cinema/ }).uncheck();
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(0);
  await dialog.getByRole("switch", { name: /Enable Cinema/ }).check();
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close preferences", exact: true })
    .click();
  await expect(page.locator("roblox-cinema-preferences")).toHaveCount(0);
  await page.close();
});

test("hiding card friend portraits restores public statistics independently of the Home friends strip", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, showFriendActivity: false },
    }),
  );
  const page = await context.newPage();
  const friendCard = `<div class="game-card-container"><a class="game-card-link" id="1234" href="/games/99?universeId=1234"><div class="game-card-thumb-container"><img src="${nativeImage}"></div><div class="game-card-name">Playing now</div><div class="game-card-friend-info game-card-info" data-testid="game-tile-stats-friends"><div class="avatar-card">Friend portrait</div></div></a></div>`;
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: realisticHome().replace(realWideCard(1), friendCard),
    }),
  );
  let requests = 0;
  await context.route("https://games.roblox.com/v1/games**", (r) => {
    requests++;
    return r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: r.request().url().includes("/votes")
          ? [{ id: 1234, upVotes: 80, downVotes: 20 }]
          : [{ id: 1234, playing: 1234 }],
      }),
    });
  });
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator(".rc-public-stats")).toContainText("80%");
  await expect(page.locator(".rc-public-stats")).toContainText("1.2K");
  await expect(page.getByTestId("game-tile-stats-friends")).not.toBeVisible();
  await expect(page.locator("[data-rc-friends]")).toBeVisible();
  await worker.evaluate(() =>
    chrome.storage.local.get("settings").then(({ settings }) =>
      chrome.storage.local.set({
        settings: {
          ...(settings as Record<string, unknown>),
          showFriendsList: false,
        },
      }),
    ),
  );
  await expect(page.locator("[data-rc-friends]")).not.toBeVisible();
  await expect(page.locator("[data-rc-home-flow]")).toHaveCSS(
    "--rc-home-friends",
    "0px",
  );
  await worker.evaluate(() =>
    chrome.storage.local.get("settings").then(({ settings }) =>
      chrome.storage.local.set({
        settings: {
          ...(settings as Record<string, unknown>),
          showFriendActivity: true,
        },
      }),
    ),
  );
  await expect(page.locator(".rc-public-stats")).toHaveCount(0);
  await expect(page.getByTestId("game-tile-stats-friends")).toBeVisible();
  expect(requests).toBe(2);
  await page.close();
  await context.unroute("https://games.roblox.com/v1/games**");
});

test("sponsored UGC wrappers fill their cells with square artwork and intact captions", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, hideSponsored: false },
    }),
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 1672, height: 987 });
  const sponsored = `<div class="sponsored-item-card"><div class="list-item item-card grid-item-container"><div class="item-card-container"><a class="item-card-link" href="/catalog/99"><div class="item-card-link"><div class="item-card-thumb-container"><div class="item-card-thumb-container-inner"><span class="thumbnail-2d-container"><img src="${nativeImage}"></span></div></div></div><div class="item-card-caption"><div class="item-card-name">Sponsored product</div><div class="item-card-price">50 Robux</div></div></a></div></div></div>`;
  await page.route("https://www.roblox.com/bundles/291/Zombie", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        `<div id="populated-sponsored-catalog-items"><h2>Sponsored</h2><ul class="hlist item-cards recommended-items">${sponsored.repeat(7)}</ul></div>`,
        ".sponsored-item-card{width:32px}.item-card{width:32px}.item-card-thumb-container-inner{width:32px;height:32px}",
      ),
    }),
  );
  await page.goto("https://www.roblox.com/bundles/291/Zombie");
  await expect(
    page.locator("#populated-sponsored-catalog-items"),
  ).toHaveAttribute("data-rc-sponsored", "");
  const card = page.locator(".sponsored-item-card").first(),
    image = card.locator("img");
  await expect
    .poll(async () => (await image.boundingBox())!.width)
    .toBeGreaterThan(200);
  const a = (await card.boundingBox())!,
    b = (await image.boundingBox())!;
  expect(b.width).toBeCloseTo(a.width, 0);
  expect(b.width).toBeCloseTo(b.height, 0);
  await expect(card.getByText("50 Robux")).toBeVisible();
  await worker.evaluate(() =>
    chrome.storage.local.get("settings").then(({ settings }) =>
      chrome.storage.local.set({
        settings: {
          ...(settings as Record<string, unknown>),
          hideSponsored: true,
        },
      }),
    ),
  );
  await expect(card).not.toBeVisible();
  await page.close();
});

test("the hamburger reveals the original Roblox sidebar and hides the small rail until outside dismissal", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  const observedNativeNav = nativeHTML
    .replace(
      '<nav id="left-navigation-container">',
      '<div id="left-navigation-container"><div class="left-nav"><div style="display:flex"><div style="width:288px">',
    )
    .replace(
      '</nav><div id="container-main">',
      '</div><div role="separator" style="width:1px"></div></div></div></div><div id="container-main">',
    );
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({ body: observedNativeNav, contentType: "text/html" }),
  );
  await page.goto("https://www.roblox.com/home");
  const nav = page.locator("#left-navigation-container");
  await nav.evaluate((e) => e.setAttribute("data-original-node", "retained"));
  const before = await page.locator("#content").boundingBox();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Roblox navigation", exact: true }),
  ).toBeVisible();
  const nativeWidth = await nav
    .locator(".left-nav>div>div")
    .first()
    .boundingBox();
  expect(nativeWidth!.width).toBeGreaterThan(250);
  await expect(nav.locator('[role="separator"]')).not.toBeVisible();
  await expect(nav).toHaveAttribute("data-original-node", "retained");
  await expect(page.locator("roblox-cinema-shell .rail")).not.toBeVisible();
  await expect(
    page.locator("roblox-cinema-shell .rail-toggle"),
  ).not.toBeVisible();
  await expect.poll(async () => (await nav.boundingBox())?.y).toBe(0);
  expect((await nav.boundingBox())!.height).toBe(1000);
  const originalScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(900, 300);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => scrollY)).toBe(originalScroll);
  expect((await page.locator("#content").boundingBox())!.width).toBe(
    before!.width,
  );
  await page
    .locator(".native-nav-backdrop")
    .click({ position: { x: 900, y: 300 } });
  await expect(nav).not.toBeVisible();
  await expect(page.locator("roblox-cinema-shell .rail")).toBeVisible();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
  await expect(page.locator("roblox-cinema-shell .rail")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await page.close();
});

test("browser zoom and wide viewports use the available width instead of a fixed content cap", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({ contentType: "text/html", body: realisticHome() }),
  );
  await page.goto("https://www.roblox.com/home");
  await expect(page.locator("html")).toHaveAttribute("data-rc-shell", "ready");
  const zoom = async (factor: number) =>
    worker.evaluate(async (factor) => {
      const tabs = await chrome.tabs.query({
        url: "https://www.roblox.com/home",
      });
      const tab = tabs.at(-1);
      if (tab?.id) await chrome.tabs.setZoom(tab.id, factor);
    }, factor);
  for (const factor of [0.67, 1, 1.5]) {
    await zoom(factor);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector("#content")!.getBoundingClientRect().width /
            innerWidth,
        ),
      )
      .toBeGreaterThan(0.9);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await zoom(1);
  await page.close();
});

test("Creator rails and Settings navigation are OLED black without changing their layout", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.route("https://create.roblox.com/dashboard/creations", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div class="MuiDrawer-paper" style="width:432px;height:800px;background:#111"><div class="railContainer" style="width:216px;height:800px;background:#121215">Native navigation</div></div><main>Native Creator layout</main>',
      ),
    }),
  );
  await page.goto("https://create.roblox.com/dashboard/creations");
  await expect(page.locator(".MuiDrawer-paper")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(page.locator(".railContainer")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  expect((await page.locator(".railContainer").boundingBox())!.width).toBe(216);
  await expect(page.locator("roblox-cinema-shell .rail")).not.toBeVisible();
  await page.close();
});

test("glass has a nonzero painted area and every global control updates mounted surfaces", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 0,
        glassOpacity: 20,
        glassBlur: 0,
        glassSaturation: 0,
        glassRefraction: 0,
      },
    }),
  );
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({
      body: auditedPage(
        '<div style="height:1500px;background:repeating-linear-gradient(90deg,#f00 0 40px,#0f0 40px 80px,#00f 80px 120px)"></div><div role="menu" style="position:fixed;top:140px;left:300px;width:300px;height:160px">Native menu</div>',
      ),
      contentType: "text/html",
    }),
  );
  await page.goto("https://www.roblox.com/home");
  const anchor = page.locator("#header>.rc-glass-layer");
  const header = await glassSurface(anchor);
  await expect(header.locator(".glass")).toHaveCSS("width", /\d/);
  await expect
    .poll(
      async () => (await header.locator(".glass").boundingBox())?.width || 0,
    )
    .toBeGreaterThan(1000);
  await page.evaluate(() => scrollTo(0, 220));
  // The library's standard map concentrates bending at rounded boundaries.
  // Compare the popup edges, rather than a flat section in the header's center.
  const menu = page.locator('[role="menu"]');
  const before = await menu.screenshot();
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 0,
        glassOpacity: 20,
        glassBlur: 0,
        glassSaturation: 0,
        glassRefraction: 100,
      },
    }),
  );
  await expect(header.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    "-100",
  );
  const refracted = await menu.screenshot();
  expect(before.equals(refracted)).toBe(false);
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: {
        enabled: true,
        glassHighlight: 15,
        glassOpacity: 20,
        glassBlur: 24,
        glassSaturation: 200,
        glassRefraction: 90,
        glassAberration: 2.5,
      },
    }),
  );
  await expect(header.locator("feDisplacementMap").first()).toHaveAttribute(
    "scale",
    "-90",
  );
  await expect(header.locator(".glass__warp")).toHaveCSS(
    "backdrop-filter",
    /blur\(24px\) saturate\(2\)/,
  );
  await expect(header.locator(".rc-glass-render>span").first()).toHaveCSS(
    "opacity",
    "0.15",
  );
  await expect(
    (await glassSurface(page.locator("[role=menu]>.rc-glass-layer")))
      .locator("feDisplacementMap")
      .first(),
  ).toHaveAttribute("scale", "-90");
  const after = await menu.screenshot();
  expect(before.equals(after)).toBe(false);
  await page.close();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
});

test("demo optics match the unmodified library's painted output", async ({}, testInfo) => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("https://www.roblox.com/home", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div id="reference" role="menu" style="position:fixed;left:240px;top:180px;width:352px;height:236px;z-index:1200;border:0!important;border-radius:32px!important;box-shadow:none!important"></div>',
        'body::before{content:"";position:fixed;inset:0;z-index:0;background:repeating-linear-gradient(45deg,#f04 0 12px,#2d7 12px 24px,#26f 24px 36px)}',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  const surface = await glassSurface(
    page.locator("#reference .rc-glass-layer"),
  );
  await expect(surface.locator("svg")).toHaveCSS("width", "352px");
  await expect(surface.locator(".glass__warp")).toHaveCSS("filter", /url/);
  await expect(surface.locator(".glass__warp")).toHaveCSS(
    "backdrop-filter",
    "blur(20px) saturate(1.4)",
  );
  await expect(surface.locator(".rc-glass-render>span").nth(0)).toHaveCSS(
    "opacity",
    "0.2",
  );
  await expect(surface.locator(".rc-glass-render>span").nth(1)).toHaveCSS(
    "opacity",
    "1",
  );
  const reference = await context.newPage();
  await reference.setViewportSize({ width: 1280, height: 900 });
  await reference.goto(
    "http://127.0.0.1:5173/tests/browser/glass-reference.html",
  );
  await expect(reference.locator("#reference svg")).toHaveCSS("width", "352px");
  const clip = { x: 240, y: 180, width: 352, height: 236 };
  const nativePixels = await page.screenshot({ clip });
  const referencePixels = await reference.screenshot({ clip });
  await writeFile(testInfo.outputPath("integrated-glass.png"), nativePixels);
  await writeFile(testInfo.outputPath("original-library.png"), referencePixels);
  await testInfo.attach("integrated-glass", {
    body: nativePixels,
    contentType: "image/png",
  });
  await testInfo.attach("original-library", {
    body: referencePixels,
    contentType: "image/png",
  });
  await reference.addStyleTag({
    content: "#reference .glass{display:none!important}",
  });
  await expect(reference.locator("#reference .glass")).toBeHidden();
  await reference.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const barePixels = await reference.screenshot({ clip });
  const comparison = await reference.evaluate(
    async ({ sources }) => {
      const pixels = await Promise.all(
        sources.map(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }),
      );
      let sum = 0,
        max = 0,
        painted = 0;
      for (let i = 0; i < pixels[0].length; i += 4)
        for (let c = 0; c < 3; c++) {
          const delta = Math.abs(pixels[0][i + c] - pixels[1][i + c]);
          sum += delta;
          max = Math.max(max, delta);
          painted += Math.abs(pixels[1][i + c] - pixels[2][i + c]);
        }
      const channels = (pixels[0].length / 4) * 3;
      return { mean: sum / channels, max, painted: painted / channels };
    },
    {
      sources: [nativePixels, referencePixels, barePixels].map(
        (png) => `data:image/png;base64,${png.toString("base64")}`,
      ),
    },
  );
  // Hardware/software compositors round blended rim pixels differently. Keep
  // the strict whole-image error bound and require an actively painted backdrop.
  console.log("Glass pixel comparison:", comparison);
  expect(comparison.max).toBeLessThanOrEqual(4);
  expect(comparison.mean).toBeLessThan(0.02);
  // Prevent a false match in which neither component samples the backdrop.
  expect(comparison.painted).toBeGreaterThan(20);
  await testInfo.attach("pixel-comparison", {
    body: JSON.stringify(comparison),
    contentType: "application/json",
  });
  await page.close();
  await reference.close();
});

test("glass follows native popup geometry through scrolling, resizing and hiding, and is removed on disable", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div id="scroll-panel" style="position:fixed;left:200px;top:130px;width:480px;height:380px;overflow:auto"><div style="height:900px;padding-top:220px"><div id="moving-menu" role="menu" style="position:relative;width:300px;height:160px"><button type="button">Native popup action</button></div></div></div>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  const anchor = page.locator("#moving-menu>.rc-glass-layer");
  const surface = await glassSurface(anchor);
  const glass = surface.locator(".rc-glass-render>.relative");
  await expect(glass).toBeVisible();
  const aligned = async () =>
    expect
      .poll(async () => {
        const a = (await anchor.boundingBox())!;
        const b = (await glass.boundingBox())!;
        return Math.max(
          ...(["x", "y", "width", "height"] as const).map((k) =>
            Math.abs(a[k] - b[k]),
          ),
        );
      })
      .toBeLessThan(0.02);
  await aligned();
  const before = (await glass.boundingBox())!;
  await page.locator("#scroll-panel").evaluate((e) => (e.scrollTop = 170));
  await aligned();
  expect((await glass.boundingBox())!.y).toBeLessThan(before.y - 160);
  await page.locator("#moving-menu").evaluate((e) => {
    e.style.width = "260px";
    e.style.height = "200px";
  });
  await aligned();
  await expect(surface.locator("svg")).toHaveCSS(
    "width",
    `${(await anchor.boundingBox())!.width}px`,
  );
  await page
    .locator("#moving-menu")
    .evaluate((e) => (e.style.display = "none"));
  await expect(glass).toBeHidden();
  await page
    .locator("#moving-menu")
    .evaluate((e) => (e.style.display = "block"));
  await expect(glass).toBeVisible();
  await aligned();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: false } }),
  );
  await expect(page.locator("[data-rc-glass-surface]")).toHaveCount(0);
  await page.getByRole("button", { name: "Native popup action" }).click();
  await page.close();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
});

test("interactive glass defaults off, persists on demand, and respects reduced motion without moving controls", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("https://www.roblox.com/home", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: auditedPage(
        '<div role="menu" style="position:fixed;left:300px;top:180px;width:300px;height:180px"><button id="still-control" type="button">Native action</button><output id="click-count">0</output></div><script>document.querySelector("#still-control").onclick=()=>document.querySelector("#click-count").textContent="1";</script>',
      ),
    }),
  );
  await page.goto("https://www.roblox.com/home");
  const surface = await glassSurface(
    page.locator('[role="menu"]>.rc-glass-layer'),
  );
  const glass = surface.locator(".rc-glass-render > .relative");
  await expect(surface).toHaveAttribute("data-motion", "off");
  const still = await glass.evaluate((e) => getComputedStyle(e).transform);
  await page.mouse.move(570, 250);
  await expect(glass).toHaveCSS("transform", still);
  await expect(glass).toHaveCSS("transition-duration", "0s");
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${extensionId}/options.html`);
  const toggle = settings.getByRole("switch", { name: /Interactive glass/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await settings.reload();
  await expect(toggle).toBeChecked();
  await expect(surface).toHaveAttribute("data-motion", "on");
  const start = await glass.evaluate((e) => getComputedStyle(e).transform);
  const controlBox = await page.locator("#still-control").boundingBox();
  await page.mouse.move(575, 300);
  await expect
    .poll(() => glass.evaluate((e) => getComputedStyle(e).transform))
    .not.toBe(start);
  await expect(glass).toHaveCSS("transition-duration", "0.2s");
  expect(await page.locator("#still-control").boundingBox()).toEqual(
    controlBox,
  );
  await page
    .getByRole("button", { name: "Native action", exact: true })
    .click();
  await expect(page.locator("#click-count")).toHaveText("1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(surface).toHaveAttribute("data-motion", "off");
  const reduced = await glass.evaluate((e) => getComputedStyle(e).transform);
  await page.mouse.move(510, 240);
  await expect(glass).toHaveCSS("transform", reduced);
  await toggle.uncheck();
  await expect(surface).toHaveAttribute("data-motion", "off");
  await page.close();
  await settings.close();
});

test("Support and transaction dropdowns overlay their form without changing the following row", async () => {
  const page = await context.newPage();
  for (const route of ["/support", "/transactions"]) {
    await page.route("https://www.roblox.com" + route, (r) =>
      r.fulfill({
        body: auditedPage(
          '<div class="user-transactions-container"><div class="dropdown btn-group"><button id="select" aria-expanded="false">Choose</button><ul role="menu" class="dropdown-menu" style="display:none"><li><a href="#">Option</a></li></ul></div><div id="after" style="height:90px">Following row</div><table class="table table-striped"><tr><td>Preserved amount</td><td>120</td></tr></table></div><script>document.querySelector("#select").onclick=()=>{document.querySelector("[role=menu]").style.display="block";document.querySelector("#select").setAttribute("aria-expanded","true")}</script>',
        ),
        contentType: "text/html",
      }),
    );
    await page.goto("https://www.roblox.com" + route);
    await expect(page.locator("html")).toHaveAttribute(
      "data-rc-shell",
      "ready",
    );
    const before = await page.locator("#after").boundingBox();
    await page.getByRole("button", { name: "Choose" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect((await page.locator("#after").boundingBox())!.y).toBe(before!.y);
    if (route === "/transactions") {
      await expect(page.locator("td").first()).toHaveCSS(
        "background-color",
        "rgb(0, 0, 0)",
      );
      await expect(page.locator("td").first()).toHaveCSS(
        "border-bottom-width",
        "1px",
      );
    }
  }
  await page.close();
});

test("profile About reuses native information inline and retains its collapse action", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/users/123/profile", (r) =>
    r.fulfill({
      body: auditedPage(
        '<div id="user-profile-header-bg"><div><pre class="description-content">A native bio</pre><button class="more-btn">more</button></div></div><script>document.querySelector(".more-btn").onclick=()=>{const d=document.createElement("div");d.className="foundation-web-dialog-content";d.setAttribute("role","dialog");d.innerHTML=`<button aria-label="Close">Close</button><div><span class="group-description-dialog-body-header">Social links</span><a href="https://www.roblox.com/home">Native link</a></div><div><span class="group-description-dialog-body-header">Statistics</span>Join Date 10/1/2026</div>`;document.body.append(d);d.querySelector("button").onclick=()=>d.remove()};</script>',
      ),
      contentType: "text/html",
    }),
  );
  await page.goto("https://www.roblox.com/users/123/profile");
  await expect(page.locator("html")).toHaveAttribute(
    "data-rc-family",
    "profile",
  );
  await page.getByRole("button", { name: "more", exact: true }).click();
  await expect(page.locator(".rc-inline-about")).toContainText(
    "Join Date 10/1/2026",
  );
  await expect(page.locator(".foundation-web-dialog-content")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Native link" })).toBeVisible();
  await page.getByRole("button", { name: "Show less", exact: true }).click();
  await expect(page.locator(".rc-inline-about")).toBeHidden();
  await page.close();
});

test("recommendations fill two responsive rows and hover never moves neighboring cards", async () => {
  const page = await context.newPage();
  await page.route("https://www.roblox.com/home", (r) =>
    r.fulfill({ body: realisticHome(), contentType: "text/html" }),
  );
  await page.goto("https://www.roblox.com/home");
  for (const width of [1280, 1722, 2560]) {
    await page.setViewportSize({ width, height: 1080 });
    const columns = await page
      .locator(".home-game-grid")
      .first()
      .evaluate(
        (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
      );
    await expect(page.locator(".home-game-grid>li:visible")).toHaveCount(
      columns * 2,
    );
  }
  const cards = page.locator(".home-game-grid>li:visible");
  await cards.first().scrollIntoViewIfNeeded();
  const before = await cards.nth(1).boundingBox();
  await cards.first().hover();
  expect(await cards.nth(1).boundingBox()).toEqual(before);
  await page.close();
});

test("chat defaults to hidden and Help uses Cinema navigation without losing native actions", async () => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true } }),
  );
  const page = await context.newPage();
  await page.route("https://www.roblox.com/help-safety", (r) =>
    r.fulfill({
      body: auditedPage(
        '<div id="chat-container"><button>Chat</button></div><div class="safety-support-page"><h1>Help and safety</h1><ul class="foundation-web-list"><a href="/support"><li><button class="foundation-web-list-item">Help center</button></li></a></ul></div>',
      ),
      contentType: "text/html",
    }),
  );
  await page.goto("https://www.roblox.com/help-safety");
  await expect(page.locator("html")).toHaveAttribute("data-rc-shell", "ready");
  await expect(page.locator("#chat-container")).toBeHidden();
  await expect(page.getByRole("button", { name: "Help center" })).toBeVisible();
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true, showChat: true } }),
  );
  await expect(page.locator("#chat-container")).toBeVisible();
  await page.close();
});
