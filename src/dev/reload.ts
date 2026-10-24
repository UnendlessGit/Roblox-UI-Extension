// Compiled into development builds only. The local server sends build IDs, never code.
export function startDevelopmentReload(
  endpoint: string,
  build: string,
  settleWrites: () => Promise<unknown>,
) {
  const pages = new Set<chrome.runtime.Port>();
  const pendingKey = "cinema-development-reload";
  let finishing: Promise<void> | undefined;
  function finishReload() {
    return (finishing ||= (async () => {
      const saved = (await chrome.storage.local.get(pendingKey))[pendingKey] as
        { revision?: string; tabs?: number[] } | undefined;
      if (!saved || saved.revision !== build || !Array.isArray(saved.tabs))
        return;
      await chrome.storage.local.remove(pendingKey);
      for (const id of saved.tabs) {
        if (!Number.isInteger(id)) continue;
        try {
          const tab = await chrome.tabs.get(id);
          const url = new URL(tab.url || "");
          if (
            url.protocol === "https:" &&
            /(^|\.)roblox\.com$/.test(url.hostname)
          )
            await chrome.tabs.reload(id);
        } catch {
          /* The developer closed or navigated the tab. */
        }
      }
    })());
  }
  // onInstalled fires for unpacked reloads. Refresh pages only once the new
  // extension has loaded, rather than racing it with a content-script timer.
  chrome.runtime.onInstalled.addListener(() => {
    void finishReload();
  });
  void finishReload();
  let reloading = false;
  let retry = 1000;
  chrome.runtime.onConnect.addListener((port) => {
    if (
      port.name !== "cinema-development-page" ||
      port.sender?.id !== chrome.runtime.id
    )
      return;
    pages.add(port);
    port.onDisconnect.addListener(() => pages.delete(port));
  });
  function connect() {
    const socket = new WebSocket(endpoint);
    socket.onopen = () => {
      retry = 1000;
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 512) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ping") {
        socket.send("pong");
        return;
      }
      if (
        reloading ||
        message.type !== "build" ||
        typeof message.revision !== "string" ||
        !/^[a-f0-9-]{36}$/.test(message.revision) ||
        message.revision === build
      )
        return;
      reloading = true;
      void settleWrites()
        .catch(() => {})
        .then(async () => {
          // Include Roblox tabs opened before the helper was first installed.
          const openTabs = await chrome.tabs
            .query({ url: ["https://*.roblox.com/*"] })
            .catch(() => []);
          const tabs = [
            ...new Set(
              [
                ...openTabs.map((tab) => tab.id),
                ...[...pages].map((port) => port.sender?.tab?.id),
              ].filter((id): id is number => typeof id === "number"),
            ),
          ];
          await chrome.storage.local.set({
            [pendingKey]: { revision: message.revision, tabs },
          });
          chrome.runtime.reload();
        });
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (!reloading) {
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      }
    };
  }
  connect();
}
