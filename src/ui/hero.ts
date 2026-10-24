import heroCss from "../styles/hero.css?inline";
import { element, link, type Identity } from "../core/dom";
import type { ResourceBridge } from "../core/bridge";
import type { Settings } from "../core/settings";
import { icon } from "./icons";
import { allowedCdnImage } from "../core/urls";
export function createHero(
  identity: Identity,
  bridge: ResourceBridge,
  settings: Settings,
) {
  const host = element("roblox-cinema-hero");
  host.dataset.rcOwned = "";
  host.dataset.user = identity.id;
  host.toggleAttribute("data-reduced-motion", settings.reducedMotion);
  host.toggleAttribute(
    "data-reduced-transparency",
    settings.reducedTransparency,
  );
  const root = host.attachShadow({ mode: "open" });
  const style = element("style");
  style.textContent = heroCss;
  const hero = element("section", "hero");
  hero.setAttribute("aria-label", "Your avatar");
  const info = element("div", "identity");
  const name = element("h1", "name", identity.name);
  function verified(show: boolean) {
    if (!show || name.querySelector(".verified")) return;
    const badge = element("span", "verified");
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", "Verified");
    badge.append(icon("verified", 28));
    name.append(badge);
  }
  verified(identity.hasVerifiedBadge === true);
  info.append(name, element("p", "username", `@${identity.username}`));
  const actions = element("div", "actions");
  const profile = link(
    "View profile",
    `https://www.roblox.com/users/${identity.id}/profile`,
    "primary",
  );
  profile.append(icon("chevron", 15));
  actions.append(profile);
  info.append(actions);
  const stage = element("div", "stage");
  const image = element("img", "avatar-image");
  const nativeImage = allowedCdnImage(identity.image)
    ? identity.image
    : undefined;
  image.alt = `${identity.name}'s avatar`;
  image.decoding = "async";
  image.fetchPriority = "high";
  image.onerror = () => {
    if (nativeImage && image.src !== nativeImage) image.src = nativeImage;
    else {
      image.hidden = true;
      placeholder.hidden = false;
    }
  };
  image.hidden = true;
  const placeholder = element("span", "placeholder");
  placeholder.append(icon("avatar", 120));
  placeholder.setAttribute("aria-hidden", "true");
  stage.append(placeholder, image);
  hero.append(info, stage);
  root.append(style, hero);
  const abort = new AbortController();
  void bridge
    .get<{ id?: number; hasVerifiedBadge?: boolean }>(
      `https://users.roblox.com/v1/users/${identity.id}`,
    )
    .then((result) => {
      if (!abort.signal.aborted && String(result.id) === identity.id)
        verified(result.hasVerifiedBadge === true);
    })
    .catch(() => {
      /* Identity and artwork paint independently of badge availability. */
    });
  const fallback = async () => {
    try {
      const result = await bridge.get<{
        data?: { state: string; imageUrl?: string }[];
      }>(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${identity.id}&size=720x720&format=Png&isCircular=false`,
      );
      if (abort.signal.aborted) return;
      const url = result.data?.find(
        (item) => item.state === "Completed",
      )?.imageUrl;
      if (allowedCdnImage(url)) {
        image.onload = () => {
          placeholder.hidden = true;
        };
        image.src = url;
        image.hidden = false;
      } else throw new Error("Avatar thumbnail unavailable");
    } catch {
      if (!abort.signal.aborted && nativeImage) {
        image.onload = () => {
          placeholder.hidden = true;
        };
        image.src = nativeImage;
        image.hidden = false;
      }
    }
  };
  void fallback();
  return {
    host,
    destroy() {
      abort.abort();
      host.remove();
    },
  };
}
