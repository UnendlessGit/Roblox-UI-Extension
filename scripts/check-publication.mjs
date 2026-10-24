import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";

// These four documentation screenshots were explicitly supplied for public display.
// Approve exact reviewed bytes only; other images and release contents stay restricted.
const approvedScreenshots = new Map([
  [
    "docs/screenshots/home.png",
    "7279717b71110e2debd4bcc7da822dc944028356c01246aac75a920fb7eaba10",
  ],
  [
    "docs/screenshots/home-shelves.png",
    "badce3c5c64f677fc060b46b401edd85c0601218f8450da6bcc25a42def1c52c",
  ],
  [
    "docs/screenshots/avatar-editor.png",
    "7104eaa126c772df92a0704afd38c900dd74d77377d25329eacad664d9d80df2",
  ],
  [
    "docs/screenshots/marketplace.png",
    "d37531b191bd2e57e3f6df6c6b180b4d651c359d5475383e293154819123959e",
  ],
]);

const args = process.argv.slice(2);
const option = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const directory = option("--directory");
const markers = option("--private-markers");
const privateMarkers = markers ? JSON.parse(readFileSync(markers, "utf8")) : [];
const root = resolve(directory || ".");
function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const file = join(path, name);
    if (lstatSync(file).isSymbolicLink())
      throw new Error("Publication cannot contain symlinks");
    return lstatSync(file).isDirectory() ? walk(file) : [relative(root, file)];
  });
}
const files = directory
  ? walk(root)
  : execFileSync("git", ["ls-files", "--cached", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
const secrets = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /_\|WARNING:-DO-NOT-SHARE-THIS\.\|_[A-Za-z0-9]{30,}/,
];
const failures = [];
for (const file of files) {
  if (
    /(^|\/)(?:Roblox Current UI|Apple TV UI|artifacts|node_modules|test-results|playwright-report|\.cinema-dev)(\/|$)/i.test(
      file,
    ) ||
    /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|id_rsa.*|id_ed25519.*)$|\.(?:pem|key|p12|pfx|map|zip)$/i.test(
      file,
    ) ||
    (!directory && /^(?:dist|design-preview)\//.test(file))
  ) {
    failures.push(`${file}: excluded/private path`);
    continue;
  }
  const path = resolve(root, file);
  if (directory && file === "dev-page.js") {
    failures.push(`${file}: development helper cannot be published`);
    continue;
  }
  if (lstatSync(path).isSymbolicLink()) {
    failures.push(`${file}: symlink`);
    continue;
  }
  const bytes = directory
    ? readFileSync(path)
    : execFileSync("git", ["show", `:${file}`], {
        maxBuffer: 20 * 1024 * 1024,
      });
  if (/\.(?:png|jpe?g|webp|gif|avif|heic)$/i.test(file)) {
    const approved = directory
      ? /^icons\/(?:16|32|128)\.png$/.test(file)
      : approvedScreenshots.get(file) ===
        createHash("sha256").update(bytes).digest("hex");
    if (!approved) failures.push(`${file}: unapproved bitmap`);
    continue;
  }
  if (bytes.includes(0)) {
    failures.push(`${file}: unreviewed binary`);
    continue;
  }
  const text = bytes.toString("utf8");
  if (secrets.some((pattern) => pattern.test(text)))
    failures.push(`${file}: possible credential`);
  if (
    privateMarkers.some(
      (marker) =>
        typeof marker === "string" &&
        marker &&
        text.toLowerCase().includes(marker.toLowerCase()),
    )
  )
    failures.push(`${file}: private marker`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Publication check passed: ${files.length} ${directory ? "distribution" : "staged"} files; no matching secrets, private markers, or forbidden files.`,
  );
