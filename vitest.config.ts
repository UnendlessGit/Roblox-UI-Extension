import { defineConfig } from "vitest/config";
export default defineConfig({
  define: { __RC_DEV_ENDPOINT__: JSON.stringify("") },
  test: { environment: "jsdom", include: ["tests/unit/**/*.test.ts"] },
});
