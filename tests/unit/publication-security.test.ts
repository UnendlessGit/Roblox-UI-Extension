import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Keep resource-fetch assertions independent of the separately tested release checker.
vi.mock("../../src/update-checker", () => ({
  startReleaseChecks: vi.fn(),
  checkRelease: vi.fn(),
}));
import { allowedCdnImage } from "../../src/core/urls";
import { readIdentity } from "../../src/core/dom";
import { createHero } from "../../src/ui/hero";
import { DEFAULTS } from "../../src/core/settings";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("CDN image boundaries", () => {
  it.each([
    "https://rbxcdn.com/image.png",
    "https://tr.rbxcdn.com/image.webp",
    "https://t0.rbxcdn.com:443/image.png",
  ])("permits %s", (url) => expect(allowedCdnImage(url)).toBe(true));
  it.each([
    undefined,
    "",
    "not a url",
    "https://notrbxcdn.com/image.png",
    "https://rbxcdn.com.attacker.invalid/image.png",
    "https://user:password@tr.rbxcdn.com/image.png",
    "https://tr.rbxcdn.com:444/image.png",
    "http://tr.rbxcdn.com/image.png",
    "data:image/png;base64,AAAA",
    "/image.png",
    "https://tr.rbxcdn.com./image.png",
  ])("rejects %s", (url) => expect(allowedCdnImage(url)).toBe(false));
  it("does not propagate a foreign native-header avatar", () => {
    document.head.innerHTML =
      '<meta name="user-data" data-userid="123" data-name="DemoPlayer">';
    document.body.innerHTML =
      '<header id="header"><a href="/users/123/profile"><img src="https://notrbxcdn.com/avatar.png"></a></header>';
    expect(readIdentity()?.image).toBeUndefined();
  });
  it("keeps the placeholder instead of requesting an unsafe API image or fallback", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const hero = createHero(
      {
        id: "123",
        name: "Demo Player",
        username: "DemoPlayer",
        image: "https://notrbxcdn.com/fallback.png",
      },
      {
        get: vi.fn().mockResolvedValue({
          data: [
            {
              state: "Completed",
              imageUrl: "https://notrbxcdn.com/thumbnail.png",
            },
          ],
        }),
      },
      DEFAULTS,
    );
    document.body.append(hero.host);
    await vi.waitFor(() =>
      expect(
        hero.host
          .shadowRoot!.querySelector(".avatar-image")!
          .hasAttribute("src"),
      ).toBe(false),
    );
    expect(
      hero.host.shadowRoot!.querySelector<HTMLImageElement>(".avatar-image")!
        .hidden,
    ).toBe(true);
    hero.destroy();
  });
});

describe("worker fetch policy", () => {
  let receive: (
    message: unknown,
    sender: unknown,
    respond: (value: unknown) => void,
  ) => unknown;
  const sender = {
    id: "test-extension",
    tab: { id: 1 },
    url: "https://www.roblox.com/home",
  };
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: {
        id: "test-extension",
        onMessage: {
          addListener: (listener: typeof receive) => {
            receive = listener;
          },
        },
      },
    });
    await import("../../src/background");
  });
  const request = (url: string) =>
    new Promise((resolve) =>
      receive({ type: "resource", url, kind: "json" }, sender, resolve),
    );
  it("omits credentials and refuses redirects even for avatar thumbnails", async () => {
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("error");
      const response = await fetcher(url);
      Object.defineProperty(response, "url", { value: url });
      return response;
    });
    for (const url of [
      "https://thumbnails.roblox.com/v1/users/avatar?userIds=123&size=720x720&format=Png&isCircular=false",
      "https://users.roblox.com/v1/users/123",
    ])
      expect(await request(url)).toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not follow a redirect to a prohibited destination", async () => {
    const followed: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      if (init.redirect === "error") throw new TypeError("Redirect refused");
      followed.push("https://outside.invalid/");
      return new Response("{}");
    });
    expect(
      await request("https://users.roblox.com/v1/users/456"),
    ).toMatchObject({ ok: false });
    expect(followed).toEqual([]);
  });
  it("rejects prohibited resources before fetch", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await request("https://auth.roblox.com/v2/logout")).toMatchObject({
      ok: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
