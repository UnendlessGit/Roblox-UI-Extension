# Security and publication review

The publication review for version 0.5.7 addresses all findings in the supplied 24 October 2026 audit of version 0.5.6.

| Finding | Resolution |
|---|---|
| P1: private source screenshots | Original reference collections stay local and are ignored. Public builds no longer import them. |
| P2: signed-in QA artifacts | The entire artifacts directory, raw audit and test reports stay out of Git. Only the individually checked release ZIP and checksum are uploaded as release assets. |
| P3: personalized preview | Replaced identity, avatar, names, counts, balances and activity with fictional sample data. Artwork is original local SVG; no complete screenshot assets or account-linked CDN URLs are imported. |
| S1: redirects followed before validation | Worker fetches use `redirect: "error"`. Unexpected redirects fail without following the destination. Initial and final URL allowlists remain enforced. |
| S2: suffix-only CDN check | Avatar, native-header fallback and catalog images share parsed-URL validation: HTTPS, an exact `rbxcdn.com` host/subdomain boundary, no embedded credentials and no non-default port. Lookalike hosts are rejected. |

All worker resource fetches now omit credentials, including the public avatar endpoint. A cookie-free check of that endpoint returned a completed thumbnail. Preferences remain local; the manifest does not request cookie access. Account identity comes from the current viewer's page, not a developer fallback.

Version 0.6.0 adds a local wallpaper gallery. Selected raster images are decoded and optionally compressed on the device, then copied to extension-origin IndexedDB. No filesystem path, persistent file handle, remote image URL or upload is used. Image messages require the extension's own sender ID, validate raster data URLs and impose file/dimension/gallery limits. Writes are serialized with settings changes; failed activation rolls back a new copy, and failed deletion settings updates restore the removed image. Gallery listings return small previews rather than all originals. Deleting a gallery image removes its original stored copy and preview. Local photos and test screenshots are excluded from the repository and release archive.

## Release safeguards

- The packager requires its explicit 18-file distribution allowlist, including exactly one options script and stylesheet; extra files or symlinks fail the release.
- The publication checker reads exact staged bytes and rejects private directories, common credentials, unapproved bitmaps and unreviewed binaries. Optional private markers can be supplied locally without committing them.
- Source, built extension, built preview and the extracted release are reviewed separately. A clean source-only export must build without private reference folders.
- Public commits use a GitHub no-reply author address. Private evidence and historical release archives are not pushed.
- Dependency audit results apply at the time of the release; a clean result does not rule out unknown defects.

Do not attach cookies, tokens, signed-in financial/account screenshots or private settings exports to public issues. Review any new demo image both visually and for metadata before making it public.
