import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
let executablePath = process.env.CHROMIUM_EXECUTABLE;
const cache = join(homedir(), "Library/Caches/ms-playwright");
if (!executablePath && existsSync(cache))
  for (const directory of readdirSync(cache)
    .filter((n) => /^chromium-\d+$/.test(n))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))) {
    const candidate = join(
      cache,
      directory,
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    );
    if (existsSync(candidate)) {
      executablePath = candidate;
      break;
    }
  }
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/options.html",
    reuseExistingServer: true,
  },
  metadata: { executablePath: executablePath || "Playwright default" },
});
