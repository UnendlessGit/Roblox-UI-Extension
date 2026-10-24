import { defineConfig } from "vite";
export default defineConfig({
  define: {
    __RC_EXTENSION__: false,
    __RC_BUILD__: JSON.stringify("development"),
  },
  server: { host: "127.0.0.1", watch: { usePolling: true, interval: 500 } },
});
