# Validation

The extension is tested using temporary browser profiles and synthetic Roblox pages. Tests do not use the developer's browser profile, cookies, account screenshots, financial records, or saved preferences. Signed-in QA evidence remains private and is excluded from this repository.

## Run the checks

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:preview
python3 -m unittest discover -s tests -p 'test_package.py'
node scripts/check-publication.mjs
node scripts/check-publication.mjs --directory dist
node scripts/check-publication.mjs --directory design-preview
python3 scripts/package.py
```

The staged-file publication check requires a Git checkout with its index populated. CI uses the same tracked source. Local reviewers can supply `--private-markers path/to/private-markers.json` containing an array of strings to check for additional personal identifiers. Keep that file outside public source.

## Coverage

- Unit checks: route classification, normalized settings, caches, strict resource destinations, catalog recovery races, CDN host boundaries, header-avatar fallback, rejected redirects and credential omission.
- Packaged Chromium checks: native control preservation, enable/restore, viewport and zoom layouts, sidebar and filters, Home shelves, independent friend controls, public catalog recovery and lazy Included Items, shared header/search glass, original-library optical comparison, optional interaction and reduced motion/transparency.
- Wallpaper checks: pure-black default, independent copies after the source file is deleted, persistence across reloads, gallery selection/deletion, original-copy removal, background-only blur and surroundings, reduced transparency, bounded desktop/narrow layouts, saved controls, malformed image errors, import cancellation, large-file proceed/compress choices and resizing an 8K-wide source.
- Preview checks: fictional sample pages, original local SVGs, responsive layouts, search destinations, native-style interactions and preferences.
- Packaging checks: an exact 18-file release allowlist; unexpected files and symlinks fail before creating an archive.
- Publication checks: exact staged bytes, common credential signatures, excluded/private paths, unapproved bitmaps and optional local private markers. Built distributions are scanned separately.

## Limits

These checks are supporting evidence, not a complete penetration test. Roblox can change its markup, network behavior, account experiments and ad availability. A layout change can require an adapter update. No purchase, vote, friend-request action, account switch or real support submission is needed by the test suite. Private signed-in screenshots and original design-reference collections are not public acceptance fixtures.
