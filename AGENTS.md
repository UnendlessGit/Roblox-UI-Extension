# Repository workflow

- Develop on `development`. Keep `main` for validated changes ready for release. User instructions take precedence.
- Use `npm run dev:extension` for live development. Reuse an existing watcher instead of starting a second copy. It rebuilds `dist/` and reloads the development extension and Roblox tabs automatically after one initial manual activation.
- Stop the watcher before `npm run build` or production browser tests, then restore the development build/watcher before returning to live development. A normal build replaces the helper with a release build.
- Run typecheck, relevant unit/tooling tests, production extension/preview tests, development reload integration and packaging/publication checks when changing update infrastructure. Development integration uses a disposable browser profile and separate test session; never use its installation/debugging controls against the user's browser.
- Merge tested development changes into `main` for release. Increment manifest/package versions for new store packages; same-version documentation changes do not publish another update. Store publication is disabled until its documented configuration is supplied.
- Keep `.cinema-dev/`, `artifacts/`, private screenshots, account exports and credentials out of Git. Only the four explicitly approved README screenshots are public documentation assets. Never add local development endpoints or reload helpers to release builds.

See [docs/UPDATES.md](docs/UPDATES.md) for setup and operating details.
