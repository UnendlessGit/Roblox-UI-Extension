export const RELEASES =
  "https://github.com/UnendlessGit/Roblox-UI-Extension/releases";
export const RELEASE_API =
  "https://api.github.com/repos/UnendlessGit/Roblox-UI-Extension/releases/latest";
export const UPDATE_KEY = "cinema-release-update";
export interface UpdateState {
  checkedAt: number;
  failed?: boolean;
  release?: { version: string; download: string };
}
function parts(version: string): number[] | null {
  if (!/^\d{1,5}(?:\.\d{1,5}){2,3}$/.test(version)) return null;
  const values = version.split(".").map(Number);
  return values.every((n) => n <= 65535) ? values : null;
}
export function isNewer(candidate: string, installed: string): boolean {
  const a = parts(candidate),
    b = parts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}
export function releaseInfo(data: unknown): UpdateState["release"] {
  if (!data || typeof data !== "object") return;
  const r = data as Record<string, unknown>;
  if (
    r.draft !== false ||
    r.prerelease !== false ||
    typeof r.tag_name !== "string"
  )
    return;
  const version = r.tag_name.replace(/^v/, "");
  if (
    !parts(version) ||
    r.tag_name !== `v${version}` ||
    !Array.isArray(r.assets)
  )
    return;
  const name = `Roblox-Cinema-${version}.zip`;
  const download = `${RELEASES}/download/v${version}/${name}`;
  if (
    !r.assets.some(
      (a) =>
        a &&
        a.name === name &&
        a.state === "uploaded" &&
        a.size > 0 &&
        a.browser_download_url === download,
    )
  )
    return;
  return { version, download };
}
