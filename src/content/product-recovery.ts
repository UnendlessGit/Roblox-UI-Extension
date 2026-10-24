import type { ResourceBridge } from "../core/bridge";
import { element, link } from "../core/dom";
import { allowedCdnImage } from "../core/urls";

type Item = {
  id: string;
  name: string;
  type: "Asset" | "Bundle";
  creator?: { id: string; name: string; type: "User" | "Group" };
  price?: number;
  offSale?: boolean;
  image?: string;
};
type State = {
  root?: HTMLElement;
  host?: HTMLElement;
  started: boolean;
  pending: boolean;
  items?: Item[];
};
function clearHost(state: State) {
  state.host?.remove();
  state.host = undefined;
}
const validId = (value: unknown): value is string | number =>
  /^[1-9]\d{0,19}$/.test(String(value)) &&
  (typeof value === "string" || Number.isSafeInteger(value));
function creator(raw: any): Item["creator"] {
  const id = raw?.CreatorTargetId ?? raw?.id ?? raw?.Id;
  const name = raw?.name ?? raw?.Name;
  const type = raw?.type ?? raw?.CreatorType;
  return validId(id) &&
    typeof name === "string" &&
    ["User", "Group"].includes(type)
    ? { id: String(id), name, type }
    : undefined;
}
function nativeItems(root?: HTMLElement) {
  return (
    !!root &&
    [
      ...root.querySelectorAll('a[href*="/catalog/"],a[href*="/bundles/"]'),
    ].some((node) => !node.closest("[data-rc-owned]"))
  );
}

/** Recover public catalog content only when Roblox leaves its native list empty. */
export function createProductRecovery(bridge: ResourceBridge) {
  let key = "",
    id = "",
    bundle = false,
    generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const states: Record<"included" | "recommended", State> = {
    included: { started: false, pending: false },
    recommended: { started: false, pending: false },
  };
  function destroy() {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    key = "";
    for (const state of Object.values(states)) {
      state.host?.remove();
      state.host = state.root = undefined;
      state.started = state.pending = false;
      state.items = undefined;
    }
  }
  function paint(kind: keyof typeof states) {
    const state = states[kind],
      root = state.root;
    if (!root?.isConnected || nativeItems(root)) {
      state.host?.remove();
      state.host = undefined;
      return;
    }
    if (!state.started || state.host?.isConnected) return;
    const host = element("section", "rc-product-recovery");
    host.dataset.rcOwned = "";
    host.dataset.rcProductRecovery = kind;
    if (kind === "recommended") host.append(element("h2", "", "Recommended"));
    if (state.pending) {
      const status = element("p", "rc-product-status", "Loading items…");
      status.setAttribute("role", "status");
      host.append(status);
    } else if (!state.items?.length) {
      host.append(
        element("p", "rc-product-status", "Items couldn’t load. Try again."),
      );
      const retry = element("button", "rc-product-retry", "Retry");
      retry.type = "button";
      retry.onclick = () => {
        state.host?.remove();
        state.host = undefined;
        void load(kind);
      };
      host.append(retry);
    } else {
      const grid = element("div", "rc-product-grid");
      grid.setAttribute("role", "list");
      for (const item of state.items) {
        const card = element("article", "rc-product-card");
        card.setAttribute("role", "listitem");
        const anchor = link(
          "",
          `/${item.type === "Bundle" ? "bundles" : "catalog"}/${item.id}/${encodeURIComponent(
            item.name
              .trim()
              .replace(/[^\p{L}\p{N}]+/gu, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 100) || "Item",
          )}`,
        );
        const thumb = element("div", "rc-product-thumb");
        if (item.image) {
          const img = element("img");
          img.src = item.image;
          img.alt = "";
          img.loading = "lazy";
          thumb.append(img);
        }
        anchor.append(thumb, element("span", "rc-product-name", item.name));
        card.append(anchor);
        if (item.creator) {
          const by = element("div", "rc-product-creator", "By ");
          by.append(
            link(
              item.creator.name,
              `/${item.creator.type === "Group" ? "groups" : "users"}/${item.creator.id}${item.creator.type === "User" ? "/profile" : ""}`,
            ),
          );
          card.append(by);
        }
        if (item.offSale)
          card.append(element("div", "rc-product-price", "Off Sale"));
        else if (item.price !== undefined) {
          const price = element(
            "div",
            "rc-product-price",
            item.price === 0 ? "Free" : `${item.price.toLocaleString()} Robux`,
          );
          if (item.price > 0)
            price.append(element("span", "rc-product-standard", " · standard"));
          card.append(price);
        }
        grid.append(card);
      }
      host.append(grid);
    }
    state.host = host;
    if (kind === "included") root.append(host);
    else root.after(host);
  }
  async function thumbnails(items: Item[]) {
    for (const type of ["Asset", "Bundle"] as const) {
      const selected = items.filter((item) => item.type === type);
      for (let i = 0; i < selected.length; i += 50) {
        const batch = selected.slice(i, i + 50);
        const url =
          type === "Asset"
            ? `https://thumbnails.roblox.com/v1/assets?assetIds=${batch.map((item) => item.id).join(",")}&size=420x420&format=Png&isCircular=false`
            : `https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=${batch.map((item) => item.id).join(",")}&size=420x420&format=Png&isCircular=false`;
        try {
          const result = await bridge.get<{
            data?: { targetId: number; imageUrl?: string; state?: string }[];
          }>(url);
          for (const item of batch) {
            const image = result.data?.find(
              (entry) =>
                String(entry.targetId) === item.id &&
                entry.state === "Completed",
            )?.imageUrl;
            if (allowedCdnImage(image)) item.image = new URL(image).href;
          }
        } catch {
          /* Keep real item names and links when artwork is unavailable. */
        }
      }
    }
  }
  async function load(kind: keyof typeof states) {
    const state = states[kind],
      version = generation;
    const targetId = id,
      isBundle = bundle;
    state.started = state.pending = true;
    clearHost(state);
    paint(kind);
    let items: Item[] = [];
    try {
      if (kind === "included") {
        const details = await bridge.get<any>(
          `https://catalog.roblox.com/v1/bundles/${targetId}/details`,
        );
        if (String(details.id) !== targetId) throw new Error("Wrong bundle");
        items = (Array.isArray(details.items) ? details.items : [])
          .filter(
            (item: any) =>
              item.type === "Asset" &&
              validId(item.id) &&
              typeof item.name === "string",
          )
          .slice(0, 100)
          .map((item: any) => ({
            id: String(item.id),
            name: item.name,
            type: "Asset",
          }));
      } else if (isBundle) {
        const response = await bridge.get<any>(
          `https://catalog.roblox.com/v1/bundles/${targetId}/recommendations`,
        );
        items = (Array.isArray(response.data) ? response.data : [])
          .filter(
            (item: any) => validId(item.id) && typeof item.name === "string",
          )
          .slice(0, 6)
          .map((item: any) => ({
            id: String(item.id),
            name: item.name,
            type: "Bundle",
            creator: creator(item.creator),
            price:
              Number.isFinite(item.product?.priceInRobux) &&
              item.product.priceInRobux >= 0
                ? item.product.priceInRobux
                : undefined,
            offSale: item.product?.isForSale === false,
          }));
      } else {
        const current = await bridge.get<any>(
          `https://economy.roblox.com/v2/assets/${targetId}/details`,
        );
        if (
          String(current.AssetId) !== targetId ||
          !Number.isInteger(current.AssetTypeId) ||
          current.AssetTypeId <= 0 ||
          current.AssetTypeId > 1000
        )
          throw new Error("Unknown item type");
        const response = await bridge.get<{ data?: unknown[] }>(
          `https://catalog.roblox.com/v2/recommendations/assets?assetId=${targetId}&assetTypeId=${current.AssetTypeId}&numItems=6`,
        );
        const ids = [
          ...new Set(
            (Array.isArray(response.data) ? response.data : [])
              .filter(validId)
              .map(String),
          ),
        ].slice(0, 6);
        const details = await Promise.allSettled(
          ids.map((itemId) =>
            bridge.get<any>(
              `https://economy.roblox.com/v2/assets/${itemId}/details`,
            ),
          ),
        );
        items = details.flatMap((result, index) => {
          if (
            result.status !== "fulfilled" ||
            String(result.value.AssetId) !== ids[index] ||
            typeof result.value.Name !== "string"
          )
            return [];
          const item = result.value;
          return [
            {
              id: String(ids[index]),
              name: item.Name,
              type: "Asset" as const,
              creator: creator(item.Creator),
              price:
                Number.isFinite(item.PriceInRobux) && item.PriceInRobux >= 0
                  ? item.PriceInRobux
                  : undefined,
              offSale: item.IsForSale === false,
            },
          ];
        });
      }
      if (version !== generation) return;
      await thumbnails(items);
    } catch {
      /* One explicit retry, never a polling loop. */
    }
    if (version !== generation) return;
    state.items = items;
    state.pending = false;
    clearHost(state);
    paint(kind);
  }
  function needed(kind: keyof typeof states) {
    const state = states[kind];
    return (
      state.root?.isConnected &&
      !state.started &&
      !nativeItems(state.root) &&
      (kind === "recommended" ||
        (bundle &&
          document.querySelector('[data-rc-included-expanded="true"]')))
    );
  }
  function update(url: URL) {
    const match = url.pathname.match(
      /^\/(bundles|catalog)\/([1-9]\d{0,19})(?:\/|$)/,
    );
    if (!match) {
      if (key) destroy();
      return;
    }
    const nextKey = `${match[1]}/${match[2]}`;
    if (nextKey !== key) {
      destroy();
      key = nextKey;
      bundle = match[1] === "bundles";
      id = match[2];
    }
    const roots = {
      recommended:
        document.querySelector<HTMLElement>(
          "#item-list-container-recommendations",
        ) || undefined,
      included: bundle
        ? document.querySelector<HTMLElement>(
            "#populated-item-list .item-list-carousel",
          ) || undefined
        : undefined,
    };
    for (const kind of ["recommended", "included"] as const) {
      if (states[kind].root !== roots[kind]) {
        states[kind].host?.remove();
        states[kind].host = undefined;
        states[kind].root = roots[kind];
      }
    }
    for (const kind of ["recommended", "included"] as const) paint(kind);
    if (needed("included")) void load("included");
    if (!timer && needed("recommended"))
      timer = setTimeout(() => {
        timer = undefined;
        if (needed("recommended")) void load("recommended");
      }, 1600);
  }
  return { update, destroy };
}
