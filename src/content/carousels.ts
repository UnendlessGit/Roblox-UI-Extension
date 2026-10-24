import { icon } from "../ui/icons";
import { element } from "../core/dom";

/** One scroll owner, integral cards, and an item anchor that survives width/zoom changes. */
export function createCarousels() {
  const entries = new Map<
    HTMLElement,
    { viewport: HTMLElement; measure: () => void; dispose: () => void }
  >();
  function update() {
    for (const [shelf, entry] of entries) {
      const current =
        shelf.querySelector<HTMLElement>(".horizontal-scroll-window") ||
        (shelf.matches('[data-testid="collection-carousel-viewport"]')
          ? (shelf.firstElementChild as HTMLElement)
          : shelf);
      if (
        !shelf.isConnected ||
        !entry.viewport.isConnected ||
        current !== entry.viewport
      ) {
        entry.dispose();
        entries.delete(shelf);
      } else entry.measure();
    }
    for (const shelf of document.querySelectorAll<HTMLElement>(
      "[data-rc-shelf]",
    )) {
      if (entries.has(shelf) || shelf.closest("[data-rc-owned]")) continue;
      const discovery = shelf.matches(
        '[data-testid="collection-carousel-viewport"]',
      );
      const viewport =
        shelf.querySelector<HTMLElement>(".horizontal-scroll-window") ||
        (discovery ? (shelf.firstElementChild as HTMLElement) : shelf);
      if (!viewport) continue;
      const paged = shelf.hasAttribute("data-rc-paged");
      const track =
        viewport.querySelector<HTMLElement>(".home-page-carousel") || viewport;
      const cards = () =>
        [...track.children].filter(
          (e): e is HTMLElement =>
            e instanceof HTMLElement &&
            !e.hasAttribute("data-rc-owned") &&
            e.matches(
              'li,.list-item,[data-rc-card],[data-testid="collection-carousel-item-slot"]',
            ),
        );
      const controls = element("div", "rc-shelf-controls");
      controls.dataset.rcOwned = "";
      const previous = element("button"),
        next = element("button");
      previous.type = next.type = "button";
      previous.setAttribute("aria-label", "Previous experiences");
      next.setAttribute("aria-label", "Next experiences");
      previous.append(icon("left", 18));
      next.append(icon("chevron", 18));
      controls.append(previous, next);
      const container = discovery ? shelf : shelf.parentElement;
      if (!container) continue;
      container.classList.add("rc-shelf-container");
      container.append(controls);
      let frame = 0,
        start = 0,
        slots = 1,
        lastWidth = 0,
        step = 0;
      let settling: ReturnType<typeof setTimeout> | undefined;
      const gap = 20;
      const visibilityAttrs = ["inert", "aria-hidden"] as const;
      const visibility = new Map<
        HTMLElement,
        { native: (string | null)[]; written: (string | null)[] }
      >();
      function rememberVisibility(node: HTMLElement) {
        const current = visibilityAttrs.map((name) => node.getAttribute(name));
        let state = visibility.get(node);
        if (!state) {
          state = { native: [...current], written: [...current] };
          visibility.set(node, state);
        } else
          current.forEach((value, i) => {
            if (value !== state!.written[i]) state!.native[i] = value;
          });
        return state;
      }
      function syncVisibility(list: HTMLElement[]) {
        if (!discovery) return;
        const bounds = viewport.getBoundingClientRect();
        for (const slot of list) {
          const node = slot.querySelector<HTMLElement>(
            ':scope > [data-testid^="sdui-carousel-item-"]',
          );
          if (!node) continue;
          const state = rememberVisibility(node),
            rect = slot.getBoundingClientRect();
          // Roblox calculates these flags from its original tile width. Use the
          // painted horizontal viewport, including shelves below the fold.
          const visible =
            rect.right > bounds.left + 1 && rect.left < bounds.right - 1;
          const desired = [visible ? null : "", visible ? "false" : "true"];
          visibilityAttrs.forEach((name, i) => {
            if (node.getAttribute(name) !== desired[i]) {
              if (desired[i] === null) node.removeAttribute(name);
              else node.setAttribute(name, desired[i]!);
            }
          });
          state.written = desired;
        }
      }
      const reduced = () =>
        document.documentElement.dataset.rcMotion === "reduce" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      function scrollToStart(animate: boolean) {
        viewport.scrollTo({
          left: start * step,
          behavior: animate && !reduced() ? "smooth" : "instant",
        });
      }
      function measure() {
        frame = 0;
        const list = cards(),
          width = viewport.clientWidth;
        if (!width || !list.length) {
          controls.hidden = true;
          return;
        }
        if (paged) {
          const count = Math.max(
            1,
            Math.round(
              (width + gap) /
                (list[0].matches("[data-rc-wide]") ||
                list[0].querySelector("[data-rc-wide]")
                  ? 360
                  : 280),
            ),
          );
          const changed = Math.abs(lastWidth - width) > 0.5 || slots !== count;
          slots = count;
          const cardWidth = (width - gap * (slots - 1)) / slots;
          step = cardWidth + gap;
          const value = `${cardWidth}px`;
          if (viewport.style.getPropertyValue("--rc-page-card") !== value)
            viewport.style.setProperty("--rc-page-card", value);
          // Pad only the final batch. This makes every remaining card reachable without duplicates.
          const tail = `${((slots - ((list.length - start) % slots)) % slots) * step}px`;
          if (track.style.getPropertyValue("--rc-page-tail") !== tail)
            track.style.setProperty("--rc-page-tail", tail);
          start = Math.min(start, Math.max(0, list.length - 1));
          if (changed) {
            clearTimeout(settling);
            lastWidth = width;
            scrollToStart(false);
          }
        }
        previous.disabled = paged ? start <= 0 : viewport.scrollLeft < 3;
        next.disabled = paged
          ? start + slots >= list.length
          : viewport.scrollLeft + width >= viewport.scrollWidth - 3;
        controls.hidden = paged
          ? list.length <= slots
          : viewport.scrollWidth <= width + 3;
        syncVisibility(list);
      }
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(measure);
      };
      const move = (direction: number) => {
        if (paged) {
          if (direction > 0 && start + slots < cards().length) start += slots;
          else if (direction < 0) start = Math.max(0, start - slots);
          measure();
          scrollToStart(true);
        } else
          viewport.scrollBy({
            left: direction * viewport.clientWidth,
            behavior: reduced() ? "instant" : "smooth",
          });
        schedule();
      };
      previous.onclick = () => move(-1);
      next.onclick = () => move(1);
      const onScroll = () => {
        if (discovery) schedule();
        if (!paged) {
          schedule();
          return;
        }
        clearTimeout(settling);
        settling = setTimeout(() => {
          const delta =
            Math.round((viewport.scrollLeft / step - start) / slots) * slots;
          start = Math.max(0, Math.min(cards().length - 1, start + delta));
          measure();
          scrollToStart(true);
          schedule();
        }, 160);
      };
      viewport.addEventListener("scroll", onScroll, { passive: true });
      const nativeVisibility = discovery
        ? new MutationObserver(schedule)
        : undefined;
      nativeVisibility?.observe(viewport, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [...visibilityAttrs],
      });
      const resize = new ResizeObserver(schedule);
      resize.observe(viewport);
      if (track !== viewport) resize.observe(track);
      measure();
      entries.set(shelf, {
        viewport,
        measure: schedule,
        dispose: () => {
          cancelAnimationFrame(frame);
          clearTimeout(settling);
          resize.disconnect();
          nativeVisibility?.disconnect();
          for (const node of visibility.keys()) {
            const state = rememberVisibility(node);
            visibilityAttrs.forEach((name, i) => {
              const value = state.native[i];
              if (value === null) node.removeAttribute(name);
              else node.setAttribute(name, value);
            });
          }
          visibility.clear();
          viewport.removeEventListener("scroll", onScroll);
          viewport.style.removeProperty("--rc-page-card");
          track.style.removeProperty("--rc-page-tail");
          controls.remove();
          container.classList.remove("rc-shelf-container");
        },
      });
    }
  }
  return {
    update,
    destroy() {
      for (const e of entries.values()) e.dispose();
      entries.clear();
    },
  };
}
