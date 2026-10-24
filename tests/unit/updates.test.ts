import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNewer,
  releaseInfo,
  RELEASES,
  RELEASE_API,
  UPDATE_KEY,
} from "../../src/core/updates";
import { checkRelease } from "../../src/update-checker";
import { mountUpdateNotice } from "../../src/options/update-notice";
const release = (version = "0.7.0") => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  assets: [
    {
      name: `Roblox-Cinema-${version}.zip`,
      state: "uploaded",
      size: 100,
      browser_download_url: `${RELEASES}/download/v${version}/Roblox-Cinema-${version}.zip`,
    },
  ],
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe("release boundaries", () => {
  it("compares numeric versions and ignores older, equal, invalid or preview versions", () => {
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("1.0.0.1", "1.0.0")).toBe(true);
    for (const version of [
      "0.6.2",
      "0.6.1",
      "v9.0.0",
      "9.0.0-beta",
      "999999.0.0",
    ])
      expect(isNewer(version, "0.6.2")).toBe(false);
  });
  it("accepts only a stable release with the exact uploaded extension ZIP", () => {
    expect(releaseInfo(release())?.version).toBe("0.7.0");
    expect(releaseInfo({ ...release(), prerelease: true })).toBeUndefined();
    expect(releaseInfo({ ...release(), draft: true })).toBeUndefined();
    expect(releaseInfo({ ...release(), assets: [] })).toBeUndefined();
    const unsafe = release();
    unsafe.assets[0].browser_download_url =
      "https://example.invalid/payload.zip";
    expect(releaseInfo(unsafe)).toBeUndefined();
    const store = release();
    store.assets[0].name = "Roblox-Cinema-0.7.0-store.zip";
    expect(releaseInfo(store)).toBeUndefined();
  });
});
describe("checking and notification", () => {
  let saved: Record<string, any>,
    fetcher: ReturnType<typeof vi.fn>,
    badge: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    saved = {};
    badge = vi.fn();
    fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(release())));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        getManifest: () => ({ version: "0.6.2" }),
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn(async () => saved),
          set: vi.fn(async (data) => Object.assign(saved, data)),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      action: {
        setBadgeText: badge,
        setBadgeBackgroundColor: vi.fn(),
        setTitle: vi.fn(),
      },
    });
  });
  it("checks anonymously, coalesces requests, caches checks and raises the NEW badge", async () => {
    await Promise.all([checkRelease(), checkRelease()]);
    await checkRelease();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      RELEASE_API,
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    expect(badge).toHaveBeenLastCalledWith({ text: "NEW" });
    saved[UPDATE_KEY].checkedAt -= 120_000;
    await checkRelease(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps known updates offline and clears the badge after installing the current version", async () => {
    saved[UPDATE_KEY] = { checkedAt: 1, release: releaseInfo(release()) };
    fetcher.mockRejectedValue(new Error("offline"));
    expect((await checkRelease()).failed).toBe(true);
    expect(badge).toHaveBeenLastCalledWith({ text: "NEW" });
    saved[UPDATE_KEY] = {
      checkedAt: Date.now(),
      release: releaseInfo(release("0.6.2")),
    };
    await checkRelease();
    expect(badge).toHaveBeenLastCalledWith({ text: "" });
  });
  it("renders a safe download and disposes its listener", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async () => ({
      ok: true,
      state: { checkedAt: Date.now(), release: releaseInfo(release()) },
    }));
    const dispose = mountUpdateNotice(document.body);
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("New version available"),
    );
    const download =
      document.querySelector<HTMLAnchorElement>(".update-download")!;
    expect(download.hidden).toBe(false);
    expect(download.href).toBe(release().assets[0].browser_download_url);
    expect(download.rel).toBe("noopener noreferrer");
    dispose();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });
});
