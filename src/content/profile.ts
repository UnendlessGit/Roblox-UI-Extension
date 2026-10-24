import { element } from "../core/dom";
/** Let Roblox load its own About data, then render a read-only inline copy and dismiss its modal. */
export function createProfileInfo() {
  let button: HTMLButtonElement | undefined, section: HTMLElement | undefined;
  let originalLabel: string | null = null;
  let loading = false,
    timeout: ReturnType<typeof setTimeout> | undefined;
  const click = (event: MouseEvent) => {
    const target = (event.target as Element)?.closest<HTMLButtonElement>(
      "#user-profile-header-bg .more-btn",
    );
    if (!target || document.documentElement.dataset.rcFamily !== "profile")
      return;
    if (button !== target) originalLabel = target.getAttribute("aria-label");
    button = target;
    if (section?.isConnected) {
      event.preventDefault();
      event.stopImmediatePropagation();
      section.hidden = !section.hidden;
      button.textContent = section.hidden ? "more" : "less";
      button.setAttribute("aria-expanded", String(!section.hidden));
      button.setAttribute(
        "aria-label",
        section.hidden ? "Show more" : "Show less",
      );
      return;
    }
    loading = true;
    document.documentElement.setAttribute("data-rc-profile-about-loading", "");
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      loading = false;
      document.documentElement.removeAttribute("data-rc-profile-about-loading");
    }, 1600);
  };
  document.addEventListener("click", click, true);
  const observer = new MutationObserver(() => {
    if (!loading || !button?.isConnected) return;
    const dialog = Array.from(
      document.querySelectorAll<HTMLElement>(".foundation-web-dialog-content"),
    ).find((e) => e.querySelector(".group-description-dialog-body-header"));
    const groups = dialog?.querySelectorAll(
      ".group-description-dialog-body-header",
    );
    if (!dialog || !groups?.length) return;
    section = element("section", "rc-inline-about");
    section.dataset.rcOwned = "";
    section.id = "cinema-profile-about";
    for (const heading of groups) {
      const group = heading.parentElement?.cloneNode(true) as
        HTMLElement | undefined;
      if (!group) continue;
      for (const e of group.querySelectorAll(
        'button,input,svg,script,style,[aria-hidden="true"]',
      ))
        e.remove();
      for (const e of [group, ...group.querySelectorAll("*")]) {
        e.removeAttribute("id");
        e.removeAttribute("aria-labelledby");
      }
      section.append(group);
    }
    button.parentElement?.append(section);
    button.textContent = "less";
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Show less");
    button.setAttribute("aria-controls", section.id);
    loading = false;
    clearTimeout(timeout);
    dialog
      .querySelector<HTMLButtonElement>('button[aria-label="Close"]')
      ?.click();
    document.documentElement.removeAttribute("data-rc-profile-about-loading");
    button.focus();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    destroy() {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      clearTimeout(timeout);
      section?.remove();
      if (button?.isConnected) {
        button.textContent = "more";
        button.removeAttribute("aria-expanded");
        button.removeAttribute("aria-controls");
        if (originalLabel === null) button.removeAttribute("aria-label");
        else button.setAttribute("aria-label", originalLabel);
      }
      document.documentElement.removeAttribute("data-rc-profile-about-loading");
    },
  };
}
