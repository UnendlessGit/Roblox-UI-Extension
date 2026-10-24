// This separate content script is never included in normal builds.
const port = chrome.runtime.connect({ name: "cinema-development-page" });
window.addEventListener("pagehide", () => port.disconnect(), { once: true });
