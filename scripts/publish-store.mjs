import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function versionParts(version) {
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version))
    throw new Error("Invalid store version");
  return [...version.split(".").map(Number), 0].slice(0, 4);
}
const atLeast = (a, b) => {
  const left = versionParts(a),
    right = versionParts(b);
  for (let i = 0; i < 4; i++)
    if (left[i] !== right[i]) return left[i] > right[i];
  return true;
};
export async function publishStore({
  env,
  version,
  packageBytes,
  fetcher = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const names = [
    "CWS_PUBLISHER_ID",
    "CWS_EXTENSION_ID",
    "CWS_CLIENT_ID",
    "CWS_CLIENT_SECRET",
    "CWS_REFRESH_TOKEN",
  ];
  if (names.some((name) => !env[name]))
    throw new Error(
      "Missing Chrome Web Store publishing configuration. See docs/UPDATES.md.",
    );
  if (
    !/^[A-Za-z0-9_-]+$/.test(env.CWS_PUBLISHER_ID) ||
    !/^[a-p]{32}$/.test(env.CWS_EXTENSION_ID)
  )
    throw new Error("Invalid Chrome Web Store item configuration");
  versionParts(version);
  async function request(url, options, label) {
    let response;
    try {
      response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error(
        `${label} failed. Check connectivity and Web Store configuration.`,
      );
    }
    if (!response.ok)
      throw new Error(
        `${label} failed (HTTP ${response.status}). Check the developer dashboard.`,
      );
    try {
      return await response.json();
    } catch {
      throw new Error(`${label} returned an invalid response.`);
    }
  }
  const auth = await request(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.CWS_CLIENT_ID,
        client_secret: env.CWS_CLIENT_SECRET,
        refresh_token: env.CWS_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    },
    "Store authentication",
  );
  if (typeof auth.access_token !== "string" || !auth.access_token)
    throw new Error("Store authentication returned no access token");
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
  const status = () =>
    request(
      `https://chromewebstore.googleapis.com/v2/${item}:fetchStatus`,
      { headers },
      "Store status check",
    );
  const current = await status();
  if (current.takenDown || current.warned)
    throw new Error(
      "Resolve the item's Web Store policy notice before publishing.",
    );
  if (
    current.publishedItemRevisionStatus?.distributionChannels?.some(
      (channel) => channel.crxVersion && atLeast(channel.crxVersion, version),
    )
  )
    return "This version is already published; no upload needed.";
  const submitted = current.submittedItemRevisionStatus;
  if (submitted?.state === "PENDING_REVIEW" || submitted?.state === "STAGED") {
    if (
      submitted.distributionChannels?.some(
        (channel) => channel.crxVersion && atLeast(channel.crxVersion, version),
      )
    )
      return "This version is already submitted; no duplicate upload.";
    throw new Error(
      "Another version is awaiting Web Store review. Retry after that submission finishes.",
    );
  }
  const upload = await request(
    `https://chromewebstore.googleapis.com/upload/v2/${item}:upload`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/zip" },
      body: packageBytes,
    },
    "Store upload",
  );
  let state = upload.uploadState;
  for (
    let attempt = 0;
    ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(state) && attempt < 30;
    attempt++
  ) {
    await wait(2000);
    state = (await status()).lastAsyncUploadState;
  }
  if (state !== "SUCCEEDED")
    throw new Error(
      "Store upload did not complete successfully. No publish request was sent.",
    );
  if (upload.crxVersion && upload.crxVersion !== version)
    throw new Error(
      "Store upload version differs from the manifest. No publish request was sent.",
    );
  const result = await request(
    `https://chromewebstore.googleapis.com/v2/${item}:publish`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        publishType: "DEFAULT_PUBLISH",
        blockOnWarnings: true,
      }),
    },
    "Store publication",
  );
  if (!["PENDING_REVIEW", "PUBLISHED", "STAGED"].includes(result.state))
    throw new Error(
      "Store did not confirm submission. Check the developer dashboard.",
    );
  return `Store submission accepted (${result.state}). Users receive the update after approval and browser rollout.`;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
    if (manifest.version_name?.includes("development"))
      throw new Error("Development builds cannot be published.");
    const packageBytes = await readFile(
      `artifacts/Roblox-Cinema-${manifest.version}-store.zip`,
    );
    console.log(
      await publishStore({
        env: process.env,
        version: manifest.version,
        packageBytes,
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
