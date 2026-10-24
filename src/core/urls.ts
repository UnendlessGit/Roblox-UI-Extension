/** Images may only come from Roblox's HTTPS CDN, including its subdomains. */
export function allowedCdnImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /(^|\.)rbxcdn\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}
