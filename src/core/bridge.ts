export type ResourceKind = "json" | "text" | "image";
export interface ResourceBridge {
  get<T = unknown>(url: string, kind?: ResourceKind): Promise<T>;
}
export const bridge: ResourceBridge = {
  async get<T>(url: string, kind: ResourceKind = "json"): Promise<T> {
    const result = await chrome.runtime.sendMessage({
      type: "resource",
      url,
      kind,
    });
    if (!result?.ok) throw new Error(result?.error || "Resource unavailable");
    return result.data as T;
  },
};
export function allowedResource(raw: string, kind: ResourceKind): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    if (url.hash) return false;
    if (url.hostname === "economy.roblox.com")
      return (
        kind === "json" &&
        /^\/v2\/assets\/[1-9]\d{0,19}\/details$/.test(url.pathname) &&
        !url.search
      );
    if (url.hostname === "catalog.roblox.com") {
      if (kind !== "json") return false;
      if (
        /^\/v1\/bundles\/[1-9]\d{0,19}\/(details|recommendations)$/.test(
          url.pathname,
        )
      )
        return !url.search;
      return (
        url.pathname === "/v2/recommendations/assets" &&
        [...url.searchParams.keys()].length === 3 &&
        /^[1-9]\d{0,19}$/.test(url.searchParams.get("assetId") || "") &&
        /^[1-9]\d{0,2}$|^1000$/.test(
          url.searchParams.get("assetTypeId") || "",
        ) &&
        url.searchParams.get("numItems") === "6"
      );
    }
    if (
      url.hostname === "thumbnails.roblox.com" &&
      ["/v1/assets", "/v1/bundles/thumbnails"].includes(url.pathname)
    ) {
      const idKey = url.pathname === "/v1/assets" ? "assetIds" : "bundleIds";
      return (
        kind === "json" &&
        [...url.searchParams.keys()].length === 4 &&
        [...url.searchParams.keys()].every((key) =>
          [idKey, "size", "format", "isCircular"].includes(key),
        ) &&
        /^[1-9]\d{0,19}(?:,[1-9]\d{0,19}){0,49}$/.test(
          url.searchParams.get(idKey) || "",
        ) &&
        url.searchParams.get("size") === "420x420" &&
        url.searchParams.get("format") === "Png" &&
        url.searchParams.get("isCircular") === "false"
      );
    }
    if (url.hostname === "users.roblox.com")
      return (
        kind === "json" &&
        /^\/v1\/users\/[1-9]\d{0,19}$/.test(url.pathname) &&
        !url.search &&
        !url.hash
      );
    if (url.hostname === "games.roblox.com") {
      const ids = url.searchParams.get("universeIds") || "";
      return (
        kind === "json" &&
        /^\/v1\/games(?:\/votes)?$/.test(url.pathname) &&
        !url.hash &&
        [...url.searchParams.keys()].length === 1 &&
        /^[1-9]\d{0,19}(?:,[1-9]\d{0,19}){0,49}$/.test(ids)
      );
    }
    return (
      kind === "json" &&
      url.hostname === "thumbnails.roblox.com" &&
      /^\/v1\/users\/avatar$/.test(url.pathname) &&
      [...url.searchParams.keys()].every((key) =>
        ["userId", "userIds", "size", "format", "isCircular"].includes(key),
      ) &&
      /^\d{1,20}$/.test(
        url.searchParams.get("userId") || url.searchParams.get("userIds") || "",
      )
    );
  } catch {
    return false;
  }
}
