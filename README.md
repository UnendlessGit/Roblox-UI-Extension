# Roblox UI Extension — Roblox Cinema

A macOS Chromium extension for a quieter Roblox: OLED black, an avatar-led Home, larger cinematic cards, a native overlay sidebar, and restrained motion.

## Install on your Mac

Download the ZIP from [GitHub Releases](https://github.com/UnendlessGit/Roblox-UI-Extension/releases/latest) and extract it. No terminal commands are needed to install the release. If you cloned the source repository, run `npm ci` and `npm run build` first; the generated extension is in `dist/`.

1. Open your Chromium browser's Extensions page (`chrome://extensions` in Chrome; `vivaldi://extensions` in Vivaldi).
2. Enable **Developer mode**.
3. Choose **Load unpacked**, then select the extracted **Roblox Cinema** folder containing `manifest.json` (or **`dist`** when building from source).
4. Refresh Roblox. Pin **Roblox Cinema** in the toolbar to access its preferences.

When replacing the build, click **Reload** on the extension's card and refresh the Roblox tabs. Turning Cinema off restores the website; uninstalling it also restores the native appearance. Your Roblox account's own theme preference is never changed.

## Optional design fixture

The repair and polish pass uses the installed extension on the real signed-in Roblox website. The fixture below is only a development aid.

Run `npm ci` and `npm run preview`, then open the local preview at `http://127.0.0.1:5173/preview.html`. Use the small preview toolbar to switch between Home, experience details, Marketplace, Settings, and additional page families. **Cinema settings** in that toolbar demonstrates the same preferences UI used by the extension.

The preview uses fictional sample identities, balances, names and activity, plus original local SVG artwork. It requires no signed-in account, private screenshots or remote avatar assets. Home uses a generic avatar placeholder, and the profile uses a neutral vector figure. The fixture demonstrates layout and preferences; it is not a replacement for Roblox. Preview source and artwork are excluded from the installed extension.

## Preferences

- **Enable Cinema:** apply or restore the redesign across Roblox.
- **Home avatar:** a normal full-body thumbnail. The interactive 3D renderer and its dependencies have been removed.
- **Show friends on Home:** hide or show the complete Home friends strip independently.
- **Show friends below game cards:** hide friend portraits without affecting the friends strip. When Roblox replaces a card’s statistics with portraits, Cinema requests only the public player/rating statistics for those games.
- **Show website chat:** restore the floating Roblox chat panel; hidden by default. Messages remain available in the rail.
- **Liquid glass:** enable/disable globally and save refraction, frosting, dark tint, saturation, color separation, and edge-light settings. Set edge light to zero to remove highlights. The initial preset matches the author's Standard demo: refraction 100, frosting 20px, no extra dark tint, saturation 140%, color separation 2, and both original edge highlights. The previous untouched preset migrates to this one; customized values are preserved.
- **Interactive glass:** mouse movement and elasticity from the library, off by default. Enabling it moves the glass background while native controls stay in place. Reduce motion, including the system setting, keeps it still.
- **Reduce motion / transparency:** use gentler transitions or solid surfaces. System accessibility preferences are also respected.
- **Hide promotional upsells / sponsored placements:** independent, off by default. Only recognized promotional components and explicitly identified ads are filtered.
- **Per-site enablement:** use the popup or in-page Cinema preferences on a Roblox site. Restore individual sites in All settings.

The compact 68px OLED-black rail provides Home, Avatar, Messages, and Me. Its hamburger reveals Roblox’s actual native sidebar, with its original links and handlers, while hiding the compact rail and hamburger. It covers the entire viewport height and blurs the page behind it, opens and closes with a short transition, and keeps its scrollbar hidden. Scrolling outside the open sidebar leaves the page in place. Clicking outside or pressing Escape collapses it. The gear at the bottom opens Cinema preferences directly on the page; the extension popup and options page use the same saved settings. The header provides Create, Marketplace, Discover, and inline search with destination suggestions; **⌘K** focuses search when you are not editing text. Its top is filled uniformly and only its bottom fades. The header and search field share one continuous glass background; there is no cutout or second tint around search. All six global glass controls affect that shared material, and edge light also controls the idle search outline. Search suggestions use the same saved glass settings. Creator Hub, docs, Help, and DevForum retain their own task navigation.

On Home, friends sit across the avatar stage’s lower foreground. Continue and related shelves fit a variable number of complete cards to the available width and advance by that number. Discovery keeps the visible cards clickable and available to keyboard focus after paging. Recommendations initially fill two rows across Roblox’s split feed blocks; Show more adds another two rows and Show less restores the initial selection. Zooming or resizing changes the count while preserving the shelf’s first item. Original artwork proportions and native controls remain intact.

Profiles place identity alongside the native avatar stage and reveal About information inline. Marketplace filter buttons stay in document flow, with readable floating lists bounded by the window. Avatar categories fill the available tab bar, and experience actions sit together at the right in the order Favorite, Notify, Like, Dislike. Financial tables use black rows with fine separators, and Help and Safety shares the player navigation. Inventory recommendations and UGC cart entry points are removed as requested. Bundle Included Items use an accessible dropdown that starts closed on each item page, keeps native item links and actions, and supports content arriving after the page opens. If Roblox leaves product recommendations or bundle contents empty, Cinema recovers their real public catalog records after allowing the native list to load. Included parts are requested only when the dropdown opens. Recovered cards link to the real item pages and disappear if Roblox’s own cards arrive. Public prices are labeled standard because account-specific discounts are shown on the destination item page. Sponsored placements remain native, with the existing independent sponsored preference.

## Development

Requires Node.js 22.12+ or a current LTS release, and npm. Tested locally with Node 26.

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm test
python3 scripts/package.py
```

`build` generates the loadable extension in `dist/` and the standalone preview build in `design-preview/`. Serve `design-preview/` over HTTP to use its production preview. `package.py` creates `artifacts/Roblox-Cinema-0.5.7.zip` from the extension build.

Browser tests require Playwright Chromium (`npx playwright install chromium`), or set `CHROMIUM_EXECUTABLE` to a compatible Chromium binary. The test configuration can also discover an existing macOS Playwright browser cache. Tests use temporary profiles and mock Roblox pages; they never use your real cookies or submit a transaction.

## Architecture

- `src/core`: route classification, typed local preferences, DOM helpers, and the restricted resource bridge.
- `src/content`: lifecycle management, native DOM annotations, explicit ad identification, native card ratios, and lifecycle-safe shelf controls.
- `src/styles`: shared tokens and player/subdomain treatments. All site styles require the activation attribute; new/unrecognized layouts keep native navigation.
- `src/ui`: isolated shadow-root navigation, accessible dialogs, and the Home hero.
- `src/options`: popup and full preferences, shared with the local preview.
- `src/preview`: fictional fixtures and original local SVG artwork, excluded from the extension package.

The content script runs on Roblox HTML documents. The separate bundled [liquid-glass-react](https://github.com/rdev/liquid-glass-react) module paints backgrounds after navigation is mounted; it owns none of Roblox’s controls and uses no continuous animation loop. Pointer tracking is installed only when Interactive glass is enabled and reduced motion is inactive. Reduced transparency uses solid materials. Normal avatar thumbnails, public verification, optional game statistics, and product recovery have a bounded worker-memory cache. Glass loads during idle time and only on visible surfaces. Its original warp layer retains the locally bundled SVG refraction filter, blur, saturation, shadows, and both highlight rims. The renderer follows each native surface's corner radius and leaves native controls in place. Its passive fixed surfaces live at the document boundary so Chromium can capture page artwork across native fixed wrappers; local anchors keep them aligned during scrolling, resizing and popup visibility changes. Visible game artwork can request Roblox’s 512px CDN variant using a removable srcset; the native source remains intact and is restored on errors or disable. Offscreen artwork waits for visibility. CSS ordering rearranges supported Home shelves without reparenting React-owned elements. Mutation processing is debounced, observes child changes rather than its own styling attributes, coalesces added subtrees, handles delayed component classes and image sources, and reconnects shelf controls after native rerenders. Removal-only mutations do not trigger full-page scans.

## Privacy and permissions

Preferences stay in `chrome.storage.local`. There is no analytics, backend, account registration, remote executable code, cookie-reading permission, or transaction automation.

Roblox host access enables styling its pages and reading the current account identity already present in the page. `activeTab` lets the popup identify the current site for its enable switch. The worker accepts only normal avatar-thumbnail, public user-verification, bounded public game-statistic, and specific public catalog item/recommendation/thumbnail lookups from the extension's Roblox content scripts. Every resource request is GET, with strict destination and parameter checks, rejected redirects, a streaming size limit, and timeouts. Public catalog recovery omits credentials and cannot invoke purchase, account, resale, or favorite endpoints. Every worker fetch, including avatar thumbnails, uses `credentials: "omit"`; no authentication is attached by the worker. Avatar URLs and the native-header fallback require HTTPS and an exact Roblox CDN host/subdomain boundary, with no embedded credentials or custom ports. Preference writes are serialized centrally to preserve rapid changes across open tabs.

## Coverage and limits

See [COVERAGE.md](COVERAGE.md) for automated checks and verification limits, and [SECURITY.md](SECURITY.md) for the publication audit fixes and release safeguards. Live website validation is recorded separately from controlled regression tests. Account experiments and future Roblox changes can still need adapter updates. A changed layout falls back to conservative styling and native controls. Third-party checkout providers and the native Roblox/Studio applications keep their own interfaces.

This is an independent customization project, inspired by the supplied Apple TV references. It is not affiliated with Roblox or Apple.

See [NOTICE.md](NOTICE.md) for native Roblox SVG and dependency attribution.
