# Development reloads and release updates

## Development

Use the `development` branch for ongoing changes. `main` contains tested releases.

```sh
git switch development
npm ci
npm run dev:extension
```

The command typechecks and builds into a staging directory, then replaces `dist/` only after success. Load `dist/` as an unpacked extension, or reload the existing installation **once** to activate the helper. Keep the command running while developing. Subsequent successful source builds reload the development extension and refresh its open Roblox tabs. Settings and the wallpaper gallery keep the same extension ID and local storage when the same `dist/` path is used. Failed builds retain the preceding build. Switching away from `development` pauses updates.

The helper binds only to `127.0.0.1`, authenticates an extension-origin WebSocket with a local session token, and sends build IDs rather than executable code. It serves no source files or images. Its private session lives in the ignored `.cinema-dev/` directory. Restarting the watcher reuses this session. `RC_DEV_PORT` changes the port if needed; changing the port/session requires one manual reload.

Use `npm run check:development` while developing. It builds production code into `.cinema-dev/release-check`, then runs production, preview, tooling, reload, packaging and publication checks without replacing the installed development build. Development integration tests use their own staging/session files and a temporary browser profile.

On a fresh checkout, `npm run build` produces the ordinary release build in `dist/`. It refuses to overwrite an existing development installation. To switch intentionally to a release, stop the watcher and run `npm run build -- --replace-development`. For store packaging during development, use `python3 scripts/package.py --build-dir .cinema-dev/release-check --store` after validation.

There is one initial manual activation because an already-installed release cannot execute helper code that is not in its loaded build. Development reloads use Chrome's [documented runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-reload).

## Regular users

GitHub ZIP installations use manual updates. Cinema checks the public GitHub release metadata at startup, every six hours while the browser runs, and when its settings or popup opens (using a six-hour cache). A **NEW** badge appears on the extension icon when a newer stable release with the extension ZIP is available. Cinema settings, including the in-page gear and popup, show **New version available** and a **Download update** button. **Check for updates** refreshes manually, limited to once a minute. Offline or rate-limited checks preserve a previously discovered update and retry later.

Download the ZIP, extract its contents into the same extension folder you originally loaded, then reload Roblox Cinema from your browser's extension controls and refresh Roblox. Keep the same folder and installation to preserve settings and wallpaper copies. Do not uninstall the extension. The updater downloads no executable code automatically and does not install packages. It contacts only GitHub's public release endpoint without credentials, cookies or account data. This release must be installed once manually before its update notices can appear. A commit on `main` alone does not trigger a notice: publish a higher-version stable GitHub release with its matching ZIP.

Chrome Web Store publication is optional and currently disabled. It is not needed for these update notices.

The repository includes a disabled-by-default Web Store publishing job. It runs only for pushes to `main`, after the complete validation job succeeds, and only when the repository variable `CWS_ENABLED` equals `true`. It builds a normal extension, scans the distribution, creates a root-manifest store ZIP, uploads through Google's official API and submits for ordinary review. It skips versions already published or submitted. Development pushes and pull requests never receive publishing credentials or run this job.

## One-time Web Store setup

1. [Register a Chrome Web Store developer account](https://developer.chrome.com/docs/webstore/register), complete the agreement and registration payment yourself, and enable the account's required two-step verification.
2. Create the Roblox Cinema listing, complete its store and privacy fields, and make its first publication from the developer dashboard. `python3 scripts/package.py --store` creates `artifacts/Roblox-Cinema-<version>-store.zip` with `manifest.json` at its root. The ordinary GitHub download ZIP remains a folder-based archive for manual installs.
3. Follow Google's [Web Store API setup](https://developer.chrome.com/docs/webstore/using-api) to enable the API and obtain OAuth publishing credentials. Store `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and `CWS_REFRESH_TOKEN` as **GitHub Actions repository secrets**, never as files or chat messages.
4. Set repository variables `CWS_PUBLISHER_ID` and `CWS_EXTENSION_ID` to the published item's identifiers. Set `CWS_ENABLED=true` only after the account, first listing and credentials are ready. No store publication has been enabled by this implementation.
5. For a new release, increment the manifest/package versions on `development`, validate, and merge the tested changes into `main`. CI submits the higher version. Once approved, store-installed users receive it through Chromium's normal updater. A docs-only commit at the same version does not resubmit the package.

The publisher never prints OAuth credentials or raw error responses. It fails rather than following redirects, replacing another in-review version, publishing a failed upload or bypassing review. Store secrets are supplied only to the final publish step. The release packager rejects development manifests and unexpected helper files.

## Checks

```sh
npm run test:tooling
npm run test:development
python3 -m unittest discover -s tests -p 'test_package.py'
```

Tooling tests use mocked store responses; they do not publish or authenticate to Google. The packaged development test uses a disposable browser profile and verifies actual extension reload, Roblox page refresh, settings persistence, watcher restart and absence of the helper from release builds.
