import { build } from "vite";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
const buildId = new Date().toISOString();
const shared = {
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  define: {
    __RC_EXTENSION__: false,
    __RC_BUILD__: JSON.stringify(buildId),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
};
await build({
  ...shared,
  define: {
    __RC_EXTENSION__: true,
    __RC_BUILD__: JSON.stringify(buildId),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/content/index.ts",
      name: "RobloxCinema",
      formats: ["iife"],
      fileName: () => "content.js",
      cssFileName: "theme",
    },
  },
});
await build({
  ...shared,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/ui/glass.ts",
      formats: ["es"],
      fileName: () => "glass.js",
    },
  },
});
await build({
  ...shared,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/background.ts",
      formats: ["es"],
      fileName: () => "background.js",
    },
  },
});
await build({
  ...shared,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: { input: ["options.html", "popup.html"] },
  },
});
await build({
  ...shared,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/options/dialog.ts",
      formats: ["es"],
      fileName: () => "preferences.js",
    },
  },
});
await copyFile("manifest.json", "dist/manifest.json");
await copyFile("NOTICE.md", "dist/NOTICE.md");
await mkdir("dist/licenses", { recursive: true });
await Promise.all([
  copyFile("node_modules/lucide/LICENSE", "dist/licenses/Lucide.txt"),
  copyFile("node_modules/react/LICENSE", "dist/licenses/React.txt"),
  copyFile("node_modules/react-dom/LICENSE", "dist/licenses/ReactDOM.txt"),
  copyFile(
    "node_modules/liquid-glass-react/LICENSE",
    "dist/licenses/LiquidGlass.txt",
  ),
]);
await mkdir("dist/icons", { recursive: true });
// Original geometric extension icon. PNG encoding avoids external build-time tools.
function crc32(buffer) {
  let crc = -1;
  for (const value of buffer) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
for (const size of [16, 32, 128]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size - 0.5,
        ny = (y + 0.5) / size - 0.5,
        a = Math.PI / 10;
      const xx = Math.abs(nx * Math.cos(a) + ny * Math.sin(a)),
        yy = Math.abs(-nx * Math.sin(a) + ny * Math.cos(a));
      const ink = Math.max(xx, yy) < 0.31 && Math.max(xx, yy) > 0.115;
      const index = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set(ink ? [245, 247, 255, 255] : [9, 10, 14, 255], index);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    `dist/icons/${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
await build({
  ...shared,
  build: {
    outDir: "design-preview",
    emptyOutDir: true,
    rollupOptions: { input: "preview.html" },
  },
});
console.log(
  "Built dist/ (load unpacked) and design-preview/ (reference-based preview).",
);
