/** Upgrade only visible CDN artwork. Retain native src for errors and complete disable/restore. */
export function createArtwork() {
  const seen = new Map<
    HTMLImageElement,
    { srcset: string | null; source: string; failed: () => void }
  >();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target as HTMLImageElement,
          state = seen.get(img);
        observer.unobserve(img);
        if (!state) continue;
        const url = new URL(img.src);
        // Keep Roblox's asset format and ratio; enlarge only its supported image dimensions.
        url.pathname = url.pathname.replace(
          /\/(\d+)\/(\d+)\/(Image|GameIcon)\//,
          (_m, w, h, type) => {
            const factor = Math.max(1, 512 / Math.max(Number(w), Number(h)));
            return `/${Math.round(Number(w) * factor)}/${Math.round(Number(h) * factor)}/${type}/`;
          },
        );
        if (url.href !== img.src) {
          img.addEventListener("error", state.failed, { once: true });
          img.srcset = `${url.href} 1x`;
        }
      }
    },
    { rootMargin: "240px" },
  );
  function update(scopes: ParentNode[]) {
    for (const [img, state] of seen)
      if (!img.isConnected) {
        observer.unobserve(img);
        img.removeEventListener("error", state.failed);
        seen.delete(img);
      }
    for (const scope of scopes)
      for (const img of scope.querySelectorAll<HTMLImageElement>(
        "[data-rc-card] img[src]",
      )) {
        if (
          seen.has(img) ||
          !/^https:\/\/tr\.rbxcdn\.com\/[^/]+\/\d+\/\d+\/(Image|GameIcon)\//.test(
            img.src,
          )
        )
          continue;
        const srcset = img.getAttribute("srcset");
        const failed = () =>
          srcset === null
            ? img.removeAttribute("srcset")
            : img.setAttribute("srcset", srcset);
        seen.set(img, { srcset, source: img.src, failed });
        observer.observe(img);
      }
  }
  return {
    update,
    destroy() {
      observer.disconnect();
      for (const [img, s] of seen) {
        img.removeEventListener("error", s.failed);
        if (img.src === s.source) {
          if (s.srcset === null) img.removeAttribute("srcset");
          else img.setAttribute("srcset", s.srcset);
        }
      }
      seen.clear();
    },
  };
}
