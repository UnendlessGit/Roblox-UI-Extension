import { test, expect, chromium } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  rename,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createReloadServer } from "../../scripts/dev-server.mjs";

test("development builds reload the extension and Roblox pages automatically, preserving settings", async ({}, testInfo) => {
  test.setTimeout(90000);
  const token = randomBytes(32).toString("hex");
  let server = await createReloadServer({ port: 0, token });
  const port = server.port;
  const profile = await mkdtemp(join(tmpdir(), "cinema-development-test-"));
  await mkdir(".cinema-dev", { recursive: true });
  await writeFile(
    ".cinema-dev/test-session.json",
    JSON.stringify({ port, token }),
    {
      mode: 0o600,
    },
  );
  const build = async (revision: string) => {
    await promisify(execFile)(process.execPath, [
      "scripts/build.mjs",
      "--development-test",
      "--build-id",
      revision,
    ]);
    await rm(".cinema-dev/installed-test-previous", {
      recursive: true,
      force: true,
    });
    try {
      await rename(
        ".cinema-dev/installed-test",
        ".cinema-dev/installed-test-previous",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(".cinema-dev/test-build", ".cinema-dev/installed-test");
    server.publish(revision);
  };
  const first = randomUUID();
  await build(first);
  const executablePath = testInfo.project.use.launchOptions?.executablePath;
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: executablePath ? undefined : "chromium",
    executablePath,
    // Test-only: CLI --load-extension installations are disabled on self-reload.
    // Use the documented install API in this disposable browser, never a user profile.
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    await manager.locator("#devMode").click();
    const installer = await context.browser()!.newBrowserCDPSession();
    await installer.send("Extensions.loadUnpacked", {
      path: resolve(".cinema-dev/installed-test"),
    });
    await installer.detach();
    await manager.close();
    const manifest = JSON.parse(
      await readFile(".cinema-dev/installed-test/manifest.json", "utf8"),
    );
    expect(manifest.version_name).toContain("development");
    await context.route("https://**/*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta name="user-data" data-userid="123" data-name="TestPlayer" data-displayname="Test Player"></head><body><div id="header">Roblox</div><main id="HomeContainer"><h1>Home</h1></main></body></html>',
      }),
    );
    const page = await context.newPage();
    await page.goto("https://www.roblox.com/home");
    await expect(page.locator("html")).toHaveAttribute("data-rc-build", first);
    await expect.poll(() => server.connections()).toBe(1);
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settings: { enabled: true, homeWallpaperDim: 37 },
      }),
    );
    const originalOptions = await context.newPage();
    await originalOptions.goto(`chrome-extension://${id}/options.html`);
    const wallpaperId = await originalOptions.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      const dataUrl = canvas.toDataURL("image/png");
      await chrome.runtime.sendMessage({
        type: "wallpaper-set",
        image: {
          name: "Update test",
          width: 2,
          height: 2,
          bytes: atob(dataUrl.split(",")[1]).length,
          dataUrl,
          thumbnail: canvas.toDataURL("image/webp"),
        },
      });
      const gallery = await chrome.runtime.sendMessage({
        type: "wallpaper-list",
      });
      return gallery.images[0].id as string;
    });
    await originalOptions.close();
    const second = randomUUID();
    await build(second);
    await expect(page.locator("html")).toHaveAttribute(
      "data-rc-build",
      second,
      { timeout: 20000 },
    );
    await expect.poll(() => server.connections()).toBe(1);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    expect(
      await options.evaluate(
        async () =>
          (
            (await chrome.storage.local.get("settings")).settings as {
              homeWallpaperDim: number;
            }
          ).homeWallpaperDim,
      ),
    ).toBe(37);
    expect(
      await options.evaluate(
        async () =>
          (await chrome.runtime.sendMessage({ type: "wallpaper-list" }))
            .images[0].id,
      ),
    ).toBe(wallpaperId);
    // Stopping and restarting the local watcher doesn't require a manual reload.
    await server.close();
    server = await createReloadServer({ port, token });
    const third = randomUUID();
    await build(third);
    await expect(page.locator("html")).toHaveAttribute("data-rc-build", third, {
      timeout: 20000,
    });
    const production = JSON.parse(await readFile("dist/manifest.json", "utf8"));
    expect(production.version_name).toBeUndefined();
    expect(production.host_permissions).not.toContain(
      `http://127.0.0.1:${port}/*`,
    );
    const productionWorker = await readFile("dist/background.js", "utf8");
    expect(productionWorker).not.toContain("cinema-development-page");
    expect(productionWorker).not.toContain(token);
  } finally {
    await context.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
