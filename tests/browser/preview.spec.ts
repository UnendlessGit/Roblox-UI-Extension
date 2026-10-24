import { test, expect } from "@playwright/test";
test("Home shows one hero, preserves square and wide images, and has no page overflow", async ({
  page,
}) => {
  await page.goto("/preview.html");
  await expect(page.locator("roblox-cinema-hero")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Roblox Cinema navigation" }),
  ).toBeVisible();
  const dimensions = await page
    .locator(".game-card-thumb-container img")
    .first()
    .evaluate((i) => ({
      width: i.getBoundingClientRect().width,
      height: i.getBoundingClientRect().height,
    }));
  expect(dimensions.width / dimensions.height).toBeCloseTo(1, 1);
  const wide = await page
    .locator(".featured-game-icon-container img")
    .first()
    .evaluate((i) => ({
      width: i.getBoundingClientRect().width,
      height: i.getBoundingClientRect().height,
    }));
  expect(wide.width / wide.height).toBeCloseTo(16 / 9, 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("navigation and settings survive repeated route changes without duplication", async ({
  page,
}) => {
  await page.goto("/preview.html");
  for (const destination of [
    "marketplace",
    "settings",
    "experience",
    "home",
    "home",
  ]) {
    await page.getByLabel("Preview page").selectOption(destination);
    await expect(page.locator("roblox-cinema-shell")).toHaveCount(1);
  }
  await expect(page.locator("roblox-cinema-hero")).toHaveCount(1);
  await page
    .getByRole("complementary", { name: "Design preview controls" })
    .getByRole("button", { name: "Cinema settings", exact: true })
    .click();
  await page.getByRole("switch", { name: /Hide sponsored placements/ }).check();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute("data-rc-hide-sponsored"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute("data-rc-hide-sponsored"),
      ),
    )
    .toBe(true);
});
test("disabling and re-enabling restores native navigation and content", async ({
  page,
}) => {
  await page.goto("/preview.html");
  await page
    .getByRole("complementary", { name: "Design preview controls" })
    .getByRole("button", { name: "Cinema settings", exact: true })
    .click();
  await page.getByRole("switch", { name: /Enable Cinema/ }).uncheck();
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(0);
  await expect(page.locator("#left-navigation-container")).toBeVisible();
  await page.getByRole("switch", { name: /Enable Cinema/ }).check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("roblox-cinema-shell")).toHaveCount(1);
  await expect(page.locator("#left-navigation-container")).toBeHidden();
});
test("search supports keyboard access, categories, and native route construction", async ({
  page,
}) => {
  await page.goto("/preview.html");
  await page
    .getByRole("searchbox", { name: "Search Roblox" })
    .fill("cinematic racing");
  await page.route("https://www.roblox.com/search/users**", (route) =>
    route.fulfill({
      body: "<h1>Search destination</h1>",
      contentType: "text/html",
    }),
  );
  await page
    .getByRole("option", { name: "cinematic racing in People", exact: true })
    .click();
  await expect(page).toHaveURL(
    "https://www.roblox.com/search/users?keyword=cinematic+racing",
  );
});
test("experience tabs retain native state changes and newly loaded servers are styled", async ({
  page,
}) => {
  await page.goto("/preview.html?page=experience");
  await page.getByRole("tab", { name: "Servers" }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next crew." }),
  ).toBeVisible();
  await expect(page.locator(".rbx-game-server-item[data-rc-card]")).toHaveCount(
    2,
  );
  await expect(page.getByRole("tab", { name: "Servers" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
test("unknown pages retain their navigation and subdomains retain task structure", async ({
  page,
}) => {
  for (const destination of ["generic", "docs", "forum", "help"]) {
    await page.goto(`/preview.html?page=${destination}`);
    await expect(
      page.getByRole("navigation", { name: "Roblox Cinema navigation" }),
    ).toBeHidden();
    await expect(page.locator("#left-navigation-container")).toBeVisible();
  }
});
for (const width of [768, 1280, 1920, 2560])
  test(`layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/preview.html");
    await expect(page.locator("roblox-cinema-hero")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const dock = await page
      .getByRole("navigation", { name: "Roblox Cinema navigation" })
      .boundingBox();
    expect(dock!.x).toBeGreaterThanOrEqual(0);
    expect(dock!.x + dock!.width).toBeLessThanOrEqual(width);
  });
test("reduced motion preference leaves a usable still avatar", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview.html");
  await expect(page.locator("roblox-cinema-hero .placeholder")).toBeVisible();
  await expect(page.locator("roblox-cinema-hero canvas")).toHaveCount(0);
  await expect(page.locator("roblox-cinema-hero .actions a").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
});
test("new content is styled and promo switches never remove ordinary cards", async ({
  page,
}) => {
  await page.goto("/preview.html");
  await page.evaluate(() => {
    const parent = document.querySelector(".game-grid")!;
    const li = document.createElement("li");
    li.innerHTML =
      '<div class="game-card-container" data-testid="new-card"><a href="https://www.roblox.com/games/4?isAd=true">Sponsored</a></div>';
    parent.append(li);
  });
  await expect(page.getByTestId("new-card")).toHaveAttribute(
    "data-rc-sponsored",
    "",
  );
  await page
    .getByRole("complementary", { name: "Design preview controls" })
    .getByRole("button", { name: "Cinema settings", exact: true })
    .click();
  await page.getByRole("switch", { name: /Hide sponsored placements/ }).check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("new-card")).toBeHidden();
  await expect(page.locator(".game-card-container").first()).toBeVisible();
});
