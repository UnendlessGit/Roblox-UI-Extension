import { element } from "../core/dom";
import { icon } from "../ui/icons";

/** Collapse native bundle contents without moving or replacing Roblox's cards. */
export function createIncludedItems(onToggle?: () => void) {
  type Disclosure = {
    title: HTMLElement;
    heading: HTMLElement;
    content: HTMLElement;
    widget: HTMLElement;
    button: HTMLButtonElement;
    dispose: () => void;
  };
  const sections = new Map<HTMLElement, Disclosure>();
  let nextId = 0;

  function attach(
    section: HTMLElement,
    title: HTMLElement,
    heading: HTMLElement,
    content: HTMLElement,
    expanded = false,
  ): Disclosure {
    const originalId = content.getAttribute("id");
    const contentId = originalId || `cinema-included-items-${++nextId}`;
    if (!originalId) content.id = contentId;
    const widget = element("h2", "rc-included-heading");
    widget.dataset.rcOwned = "";
    const button = element("button", "rc-included-toggle");
    button.type = "button";
    button.setAttribute("aria-controls", contentId);
    button.append(
      element("span", "", heading.textContent?.trim() || "Included Items"),
      icon("chevron", 22),
    );
    const render = () => {
      button.setAttribute("aria-expanded", String(expanded));
      section.dataset.rcIncludedExpanded = String(expanded);
    };
    button.onclick = () => {
      expanded = !expanded;
      render();
      onToggle?.();
    };
    widget.append(button);
    title.append(widget);
    section.setAttribute("data-rc-included", "");
    heading.setAttribute("data-rc-included-title", "");
    content.setAttribute("data-rc-included-content", "");
    render();
    return {
      title,
      heading,
      content,
      widget,
      button,
      dispose() {
        widget.remove();
        button.onclick = null;
        section.removeAttribute("data-rc-included");
        section.removeAttribute("data-rc-included-expanded");
        heading.removeAttribute("data-rc-included-title");
        content.removeAttribute("data-rc-included-content");
        if (!originalId && content.id === contentId)
          content.removeAttribute("id");
      },
    };
  }

  return {
    update() {
      for (const [section, disclosure] of sections)
        if (!section.isConnected) {
          disclosure.dispose();
          sections.delete(section);
        }
      // The recommendations carousel uses the same card classes; only the native
      // bundle-contents root receives a disclosure, across all bundle IDs.
      for (const section of document.querySelectorAll<HTMLElement>(
        "#populated-item-list",
      )) {
        const title = section.querySelector<HTMLElement>(
          ".item-list-carousel-title",
        );
        const heading = title?.querySelector<HTMLElement>(
          "h1:not([data-rc-owned]),h2:not([data-rc-owned])",
        );
        const content = section.querySelector<HTMLElement>(
          ".item-list-carousel",
        );
        const previous = sections.get(section);
        if (!title || !heading || !content) {
          previous?.dispose();
          sections.delete(section);
          continue;
        }
        if (
          previous?.title === title &&
          previous.heading === heading &&
          previous.content === content &&
          previous.widget.isConnected
        )
          continue;
        const expanded =
          previous?.button.getAttribute("aria-expanded") === "true";
        previous?.dispose();
        sections.set(
          section,
          attach(section, title, heading, content, expanded),
        );
      }
    },
    destroy() {
      for (const disclosure of sections.values()) disclosure.dispose();
      sections.clear();
    },
  };
}
