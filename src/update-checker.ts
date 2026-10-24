import {
  RELEASE_API,
  UPDATE_KEY,
  isNewer,
  releaseInfo,
  type UpdateState,
} from "./core/updates";
const ALARM = "cinema-check-releases";
let pending: Promise<UpdateState> | undefined;
async function badge(state: UpdateState) {
  const available =
    state.release &&
    isNewer(state.release.version, chrome.runtime.getManifest().version);
  await chrome.action.setBadgeBackgroundColor({ color: "#2878e8" });
  await chrome.action.setBadgeText({ text: available ? "NEW" : "" });
  await chrome.action.setTitle({
    title: available
      ? `Roblox Cinema — v${state.release!.version} available`
      : "Roblox Cinema",
  });
}
export function checkRelease(force = false): Promise<UpdateState> {
  if (pending) return pending;
  pending = (async () => {
    const cached = (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] as
      UpdateState | undefined;
    const age = Date.now() - (cached?.checkedAt || 0);
    if (
      cached &&
      age >= 0 &&
      age < (force ? 60_000 : cached.failed ? 15 * 60_000 : 6 * 60 * 60_000)
    ) {
      await badge(cached);
      return cached;
    }
    let state: UpdateState;
    try {
      const response = await fetch(RELEASE_API, {
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Release unavailable");
      const text = await response.text();
      if (text.length > 256_000) throw new Error("Release response too large");
      const release = releaseInfo(JSON.parse(text));
      if (!release) throw new Error("Release download unavailable");
      state = { checkedAt: Date.now(), release };
    } catch {
      state = { checkedAt: Date.now(), failed: true, release: cached?.release };
    }
    await chrome.storage.local.set({ [UPDATE_KEY]: state });
    await badge(state);
    return state;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export function startReleaseChecks() {
  const schedule = async () => {
    if (!(await chrome.alarms.get(ALARM)))
      await chrome.alarms.create(ALARM, { periodInMinutes: 360 });
    await checkRelease();
  };
  chrome.runtime.onInstalled.addListener(() => void schedule().catch(() => {}));
  chrome.runtime.onStartup.addListener(() => void schedule().catch(() => {}));
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void checkRelease().catch(() => {});
  });
  void schedule().catch(() => {});
}
