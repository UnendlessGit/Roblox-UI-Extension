import { glassSignature, type Settings } from "../core/settings";
import { material } from "../ui/material";

export const OVERLAY_SELECTOR =
  '.foundation-web-dialog-content, .filters-modal-container, .MuiPopover-paper, .MuiDialog-paper, .d-modal__container, .menu-panel, .select-kit-collection, .notification-stream-base, .popover, .dropdown-menu, .modal-content, .friends-carousel-dropdown, .friend-tile-dropdown, .friend-activity-card, [role="tooltip"], [role="dialog"].foundation-web-portal-zindex, [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper] > [data-state="open"]';
function containFilter(node: HTMLElement) {
  if (!node.matches(".filters-modal-container")) return () => {};
  let shift = 0;
  let maxHeight = 0;
  const place = () => {
    const rect = node.getBoundingClientRect();
    if (!rect.width) return;
    const left = rect.left - shift;
    const height = Math.max(160, innerHeight - Math.max(12, rect.top) - 12);
    if (Math.abs(maxHeight - height) >= 0.5) {
      maxHeight = height;
      node.style.setProperty("--rc-filter-height", `${height}px`);
    }
    const next = Math.max(
      12 - left,
      Math.min(0, innerWidth - 12 - left - rect.width),
    );
    if (Math.abs(shift - next) < 0.5) return;
    shift = next;
    node.style.setProperty("--rc-filter-shift", `${shift}px`);
  };
  const resize = new ResizeObserver(place);
  resize.observe(node);
  if (node.parentElement) resize.observe(node.parentElement);
  window.addEventListener("resize", place);
  place();
  return () => {
    resize.disconnect();
    window.removeEventListener("resize", place);
    node.style.removeProperty("--rc-filter-shift");
    node.style.removeProperty("--rc-filter-height");
  };
}
/** Watch only mounted overlay roots; never replace native event handlers or positioning. */
export function createOverlays() {
  const entries = new Map<
    HTMLElement,
    { dispose: () => void; signature: string }
  >();
  return {
    update(settings: Settings, scopes: ParentNode[] = [document]) {
      const signature = glassSignature(settings);
      for (const [node, entry] of entries) {
        if (
          !node.isConnected ||
          entry.signature !== signature ||
          !node.querySelector(":scope > .rc-glass-layer")
        ) {
          entry.dispose();
          node.removeAttribute("data-rc-overlay");
          entries.delete(node);
        }
      }
      const candidates = new Set<HTMLElement>();
      for (const scope of scopes) {
        if (scope instanceof HTMLElement && scope.matches(OVERLAY_SELECTOR))
          candidates.add(scope);
        for (const node of scope.querySelectorAll<HTMLElement>(
          OVERLAY_SELECTOR,
        ))
          candidates.add(node);
      }
      for (const node of candidates) {
        if (
          entries.has(node) ||
          node.closest("[data-rc-owned]") ||
          node.querySelector(OVERLAY_SELECTOR) ||
          node.closest("[data-rc-overlay]")
        )
          continue;
        node.setAttribute("data-rc-overlay", "");
        const disposeMaterial = material(node, settings);
        const disposePlacement = containFilter(node);
        entries.set(node, {
          signature,
          dispose: () => {
            disposePlacement();
            disposeMaterial();
          },
        });
      }
    },
    destroy() {
      for (const [node, entry] of entries) {
        entry.dispose();
        node.removeAttribute("data-rc-overlay");
      }
      entries.clear();
    },
  };
}
