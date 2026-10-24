import { build } from "vite";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    development: { type: "boolean", default: false },
    "development-test": { type: "boolean", default: false },
    "build-id": { type: "string" },
  },
});
const development = values.development || values["development-test"];
const outDir = values["development-test"]
  ? ".cinema-dev/test-build"
  : development
    ? ".cinema-dev/build"
    : "dist";
const buildId = values["build-id"] || new Date().toISOString();
let devEndpoint = "";
if (development) {
  const config = JSON.parse(
    await readFile(
      values["development-test"]
        ? ".cinema-dev/test-session.json"
        : ".cinema-dev/session.json",
      "utf8",
    ),
  );
  if (
    !Number.isInteger(config.port) ||
    config.port < 1024 ||
    config.port > 65535 ||
    !/^[a-f0-9]{64}$/.test(config.token) ||
    !/^[a-f0-9-]{36}$/.test(buildId)
  )
    throw new Error("Start development builds with npm run dev:extension.");
  devEndpoint = `ws://127.0.0.1:${config.port}/reload?token=${config.token}`;
}
const shared = {
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  define: {
    __RC_EXTENSION__: false,
    __RC_BUILD__: JSON.stringify(buildId),
    __RC_DEV_ENDPOINT__: JSON.stringify(devEndpoint),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
};
await build({
  ...shared,
  define: {
    __RC_EXTENSION__: true,
    __RC_BUILD__: JSON.stringify(buildId),
    __RC_DEV_ENDPOINT__: JSON.stringify(devEndpoint),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir,
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
    outDir,
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
    outDir,
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
    outDir,
    emptyOutDir: false,
    rollupOptions: { input: ["options.html", "popup.html"] },
  },
});
await build({
  ...shared,
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: "src/options/dialog.ts",
      formats: ["es"],
      fileName: () => "preferences.js",
    },
  },
});
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (development) {
  manifest.name += " (Development)";
  manifest.version_name = `${manifest.version} development`;
  manifest.host_permissions.push(
    `http://127.0.0.1:${new URL(devEndpoint).port}/*`,
  );
  manifest.content_scripts[0].js.push("dev-page.js");
  await build({
    ...shared,
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: "src/dev/page.ts",
        formats: ["iife"],
        name: "CinemaDevelopmentPage",
        fileName: () => "dev-page.js",
      },
    },
  });
}
await writeFile(
  `${outDir}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await copyFile("NOTICE.md", `${outDir}/NOTICE.md`);
await mkdir(`${outDir}/licenses`, { recursive: true });
await Promise.all([
  copyFile("node_modules/lucide/LICENSE", `${outDir}/licenses/Lucide.txt`),
  copyFile("node_modules/react/LICENSE", `${outDir}/licenses/React.txt`),
  copyFile("node_modules/react-dom/LICENSE", `${outDir}/licenses/ReactDOM.txt`),
  copyFile(
    "node_modules/liquid-glass-react/LICENSE",
    `${outDir}/licenses/LiquidGlass.txt`,
  ),
]);
await mkdir(`${outDir}/icons`, { recursive: true });
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
    `${outDir}/icons/${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
if (!development)
  await build({
    ...shared,
    build: {
      outDir: "design-preview",
      emptyOutDir: true,
      rollupOptions: { input: "preview.html" },
    },
  });
console.log(
  development
    ? "Development build complete."
    : "Built dist/ (load unpacked) and design-preview/ (reference-based preview).",
);
