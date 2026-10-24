import { allowedCdnImage } from "./urls";

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K];
export function element(
  tag: string,
  className?: string,
  text?: string,
): HTMLElement;
export function element(
  tag: string,
  className = "",
  text?: string,
): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function link(label: string, href: string, className = "") {
  const node = element("a", className, label);
  node.href = href;
  return node;
}
export function safeLink(raw: string, base: URL): string | null {
  try {
    const url = new URL(raw, base);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export interface Identity {
  id: string;
  name: string;
  username: string;
  image?: string;
  hasVerifiedBadge?: boolean;
}
export function readIdentity(): Identity | null {
  const meta = document.querySelector<HTMLElement>('meta[name="user-data"]');
  const own = document.querySelector<HTMLAnchorElement>(
    '#header a[href*="/users/"][href*="/profile"], #navigation a[href*="/users/"][href*="/profile"], [data-testid="navigation-profile"]',
  );
  const id =
    meta?.dataset.userid ||
    own?.getAttribute("href")?.match(/\/users\/(\d+)\/profile/)?.[1];
  if (!id || !/^\d+$/.test(id) || id === "0") return null;
  const username =
    meta?.dataset.name ||
    own?.textContent?.trim().replace(/^@/, "") ||
    "Player";
  const image = own?.querySelector("img")?.src;
  return {
    id,
    username,
    name: meta?.dataset.displayname || username,
    image: allowedCdnImage(image) ? image : undefined,
  };
}
export function markAll(root: ParentNode, selectors: string, attr: string) {
  const nodes: Element[] = [...root.querySelectorAll(selectors)];
  if (root instanceof Element && root.matches(selectors)) nodes.unshift(root);
  for (const node of nodes)
    if (!node.closest("[data-rc-owned]"))
      !node.hasAttribute(attr) && node.setAttribute(attr, "");
}
export function clearMarks() {
  for (const page of document.querySelectorAll<HTMLElement>(
    "[data-rc-artwork]",
  ))
    page.style.removeProperty("--rc-artwork");
  for (const play of document.querySelectorAll("[data-rc-play-label]"))
    play.removeAttribute("aria-label");
  for (const node of document.querySelectorAll(
    "[data-rc-main],[data-rc-card],[data-rc-media],[data-rc-grid],[data-rc-shelf],[data-rc-paged],[data-rc-events],[data-rc-panel],[data-rc-tabs],[data-rc-upsell],[data-rc-sponsored],[data-rc-friends],[data-rc-secondary],[data-rc-continue],[data-rc-home-flow],[data-rc-ratio],[data-rc-wide],[data-rc-artwork],[data-rc-play-label]",
  )) {
    for (const attr of [...node.attributes])
      if (attr.name.startsWith("data-rc-")) node.removeAttribute(attr.name);
  }
}
