import { watch } from "node:fs";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createReloadServer } from "./dev-server.mjs";

const branch = () =>
  execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
if (branch() !== "development")
  throw new Error(
    "Switch to the development branch first: git switch development",
  );
await mkdir(".cinema-dev", { recursive: true });
let session;
try {
  session = JSON.parse(await readFile(".cinema-dev/session.json", "utf8"));
} catch {}
if (!session || !/^[a-f0-9]{64}$/.test(session.token))
  session = { port: 13727, token: randomBytes(32).toString("hex") };
const port = Number(process.env.RC_DEV_PORT || session.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid RC_DEV_PORT");
const server = await createReloadServer({ port, token: session.token });
await writeFile(
  ".cinema-dev/session.json",
  JSON.stringify({ ...session, port }),
  { mode: 0o600 },
);
const run = (file, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Build failed; previous build retained.")),
    );
  });
let building = false,
  pending = false,
  closed = false,
  timer;
async function rebuild() {
  if (closed) return;
  if (building) {
    pending = true;
    return;
  }
  if (branch() !== "development") {
    console.log(
      "Reloads paused: only development can update the development build.",
    );
    return;
  }
  building = true;
  const revision = randomUUID();
  try {
    await run("node_modules/typescript/bin/tsc", ["--noEmit"]);
    await run("scripts/build.mjs", ["--development", "--build-id", revision]);
    if (closed || pending || branch() !== "development") return;
    await rm(".cinema-dev/previous", { recursive: true, force: true });
    let previous = false;
    try {
      await rename("dist", ".cinema-dev/previous");
      previous = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(".cinema-dev/build", "dist");
    } catch (error) {
      if (previous) await rename(".cinema-dev/previous", "dist");
      throw error;
    }
    server.publish(revision);
    console.log(
      "Development build ready in dist/. Connected development extensions and Roblox tabs refresh automatically.",
    );
  } catch (error) {
    console.error(error.message);
  } finally {
    building = false;
    if (pending && !closed) {
      pending = false;
      void rebuild();
    }
  }
}
function schedule() {
  if (building) {
    pending = true;
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(() => void rebuild(), 180);
}
const watchers = [
  watch("src", { recursive: true }, (_event, file) => {
    if (file && /\.(?:ts|css|svg)$/.test(String(file))) schedule();
  }),
  watch(".", (_event, file) => {
    if (
      [
        "manifest.json",
        "options.html",
        "popup.html",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
      ].includes(String(file))
    )
      schedule();
  }),
  watch("scripts", (_event, file) => {
    if (file === "build.mjs") schedule();
  }),
  watch(
    execFileSync("git", ["rev-parse", "--git-dir"], {
      encoding: "utf8",
    }).trim(),
    (_event, file) => {
      if (file === "HEAD") schedule();
    },
  ),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    closed = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    void server.close().then(() => {
      process.exitCode = 0;
    });
  });
console.log(
  `Watching development on 127.0.0.1:${port}. The first install needs one manual extension reload.`,
);
await rebuild();
