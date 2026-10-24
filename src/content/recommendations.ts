import { element } from "../core/dom";

/** Reveal native cards in source order, across Roblox's split recommendation blocks. */
export function createRecommendations() {
  let batches = 1,
    columns = 3;
  let observed: HTMLElement | undefined;
  const resize = new ResizeObserver(() => {
    const next = observed
      ? getComputedStyle(observed).gridTemplateColumns.split(" ").length
      : 3;
    if (next !== columns) {
      columns = next;
      update();
    }
  });
  let controls: HTMLElement | undefined;
  let more: HTMLButtonElement | undefined;
  let less: HTMLButtonElement | undefined;
  const marked = new Set<Element>();
  function mark(node: Element, attr: string, value = "") {
    if (node.getAttribute(attr) !== value) node.setAttribute(attr, value);
    marked.add(node);
  }
  function update() {
    const grids = [
      ...document.querySelectorAll<HTMLElement>(".home-game-grid"),
    ];
    if (!grids.length) {
      controls?.remove();
      return;
    }
    if (observed !== grids[0]) {
      resize.disconnect();
      observed = grids[0];
      resize.observe(observed);
    }
    columns = Math.max(
      1,
      getComputedStyle(grids[0]).gridTemplateColumns.split(" ").length,
    );
    const limit = columns * 2 * batches;
    const flow = document.querySelector<HTMLElement>("[data-rc-home-flow]");
    let total = 0,
      shown = 0;
    let firstHeading = false;
    for (const grid of grids) {
      mark(grid, "data-rc-recommendations");
      const group =
        grid.closest('[data-testid="home-page-game-grid"]') ||
        grid.parentElement!;
      let top = group;
      if (flow?.contains(group)) {
        while (top.parentElement && top.parentElement !== flow)
          top = top.parentElement;
        mark(top, "data-rc-recommendation-group");
      }
      let visible = 0;
      for (const card of [...grid.children].filter(
        (child) =>
          child.matches("li, .list-item, [data-rc-card]") &&
          !child.matches('[data-testid*="sentinel"]'),
      )) {
        const sponsored =
          document.documentElement.hasAttribute("data-rc-hide-sponsored") &&
          !!card.querySelector("[data-rc-sponsored]");
        total += sponsored ? 0 : 1;
        if (!sponsored && shown < limit) {
          shown++;
          visible++;
          card.removeAttribute("data-rc-recommendation-hidden");
        } else mark(card, "data-rc-recommendation-hidden");
      }
      if (visible) top.removeAttribute("data-rc-recommendation-hidden");
      else mark(top, "data-rc-recommendation-hidden");
      const heading = group.querySelector(
        ".home-sort-header-container, .container-header",
      );
      if (heading) {
        if (firstHeading || !visible)
          mark(heading, "data-rc-recommendation-heading-hidden");
        else {
          heading.removeAttribute("data-rc-recommendation-heading-hidden");
          firstHeading = true;
        }
      }
    }
    if (!controls) {
      controls = element("div", "rc-recommendation-controls");
      controls.dataset.rcOwned = "";
      more = element("button", "", "Show more");
      less = element("button", "", "Show less");
      more.type = less.type = "button";
      more.onclick = () => {
        batches++;
        update();
      };
      less.onclick = () => {
        batches = 1;
        update();
        document
          .querySelector("[data-rc-recommendations]")
          ?.scrollIntoView({ block: "start", behavior: "instant" });
      };
      controls.append(more, less);
    }
    const parent =
      flow ||
      document.querySelector<HTMLElement>(".game-home-page-container") ||
      grids[0].parentElement!;
    if (controls.parentElement !== parent) parent.append(controls);
    more!.hidden = total <= shown;
    less!.hidden = batches <= 1;
    controls.hidden = more!.hidden && less!.hidden;
    // A native sentinel after the hidden feed must not collapse into the viewport.
    for (const grid of grids)
      for (const sentinel of grid.querySelectorAll(
        '[data-testid*="sentinel"]',
      )) {
        if (shown < total) mark(sentinel, "data-rc-feed-sentinel");
        else sentinel.removeAttribute("data-rc-feed-sentinel");
      }
  }
  return {
    update,
    destroy() {
      batches = 1;
      resize.disconnect();
      observed = undefined;
      controls?.remove();
      controls = undefined;
      more = less = undefined;
      for (const node of marked)
        for (const attr of [
          "data-rc-recommendations",
          "data-rc-recommendation-group",
          "data-rc-recommendation-hidden",
          "data-rc-recommendation-heading-hidden",
          "data-rc-feed-sentinel",
        ])
          node.removeAttribute(attr);
      marked.clear();
    },
  };
}
