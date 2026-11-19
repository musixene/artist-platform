# Player and catalog redesign

## Assessment and implementation stages

Baseline: main b1f8519, schema 3, Node 24/plain browser modules/SQLite/private local media. Existing Like and Note to Artist APIs, authorization, rate limits, data export/deletion, byte-range playback and operator tools are retained. The old browser conflated visible tracks, queue and catalog selection, rebuilding audio on filter changes. Branding was text/accent only, and collection visibility was labeled Published. No architecture replacement is needed.

1. Extend schema and server validation additively; preserve old visibility and curated memberships. Introduce metadata and bounded dynamic rules. Make artist branding assets administrator-configurable.
2. Build the mobile-first player shell, independent browsing/queue state, Store/Credits placeholders, compact rows, active-track feedback and configured PWA identity. Keep one audio element.
3. Add grouped administrator classification, catalog and appearance controls. Exercise all changes with synthetic catalog/asset fixtures.
4. Run preservation/failure/repeated-startup migrations, authorization/privacy, catalog/queue/browser/viewport tests and isolated container validation. Review the implementation in a PR; no automatic merge/deployment.

## Decisions and semantics

- `visible` retains its exact existing access meaning. The administrator label is **Available to listeners**, or Hidden. Release status is a separate artist-supplied designation, not a legal copyright-publication determination.
- Schema 4 adds `release_status` (Published / Unpublished), `explicit_status` (Explicit / Non-Explicit / Unreviewed), `content_type`, `genres`, and `tags`. Existing records default mechanically to Unpublished, Unreviewed, Other and empty genre/tag lists. These defaults do not assert that existing music has been reviewed. Administrators should classify legacy recordings deliberately. No recordings are inferred from the mockup.
- Content type is extensible lowercase text, with Music, Interview, Spoken Word and Other suggestions. Genres/tags are distinct bounded lists (20 terms, 50 characters each), independent from curated membership.
- Existing collections become Curated without changing IDs, availability or ordered membership. Dynamic catalogs use optional release/explicit/type equality and any-of genre/tag filters. Fields combine with AND; within each genre/tag list, any case-insensitive match is sufficient. At least one rule is required. Non-Explicit never includes Unreviewed. No user-supplied SQL or generic query language is accepted. The catalog kind is chosen at creation in the administrator UI.
- All Catalogs contains every accessible track once, including unassigned tracks. All Published Works and All Unpublished Works filter release status, independently of collection membership. Hidden tracks are excluded from every listener view, and existing direct audio/artwork authorization stays enforced.

## Queue and feedback policy

Catalog changes only browse; they do not change audio source, position, active metadata or the established queue. Selecting a track establishes a snapshot of the displayed catalog's ordered IDs. Next/previous/shuffle/repeat use that snapshot until another explicit selection. The active track stays in the full player even if absent from the displayed catalog, with a caption identifying the playing queue. Selecting the active row establishes that catalog queue and toggles playback without restarting its position. Previous restarts the track after three seconds, otherwise moves back; repeat-one applies on natural ending, and repeat-all wraps.

Like and Note to Artist appear once in the full player. The existing private backend is reused. Feedback components are retained in memory per track, so a draft survives switching away and back during that signed-in session. If playback advances while a note dialog is open, the dialog switches explicitly to the new active track; the prior draft is retained for its own track, not submitted under a new ID. Drafts are not persisted in browser storage and are discarded at sign-out/reload. Store navigation and account/privacy controls do not reinitialize audio. There is no second mini-player and no custom OS Like action.

## Appearance and installation

Artist name, optional wordmark/tagline, PWA name/short name and accent are editable. Empty PWA names fall back to artist name. Generic icons are neutral record/music symbols, not a Musixene or LP-19 identity. Header logo, favicon and PWA icons are optional administrator uploads into a separate branding directory. They do not replace music/artwork files.

Branding accepts only bounded, checksummed, non-interlaced 8-bit RGB/RGBA PNGs up to 2 MiB, with decompressed pixel-size/filter checks. Logo: 64–2048 wide and 32–1024 high. Favicon: square, 32–256. Installed icons: exactly 512×512 or 192×192, uploaded separately. Uploaded icon dimensions are declared honestly in the manifest; when custom icons exist, generic icons are not mixed into that manifest. Missing files use generic route fallbacks. Failed uploads remove only their new file; replacing/clearing a configured asset retains old files for operator reconciliation.

Manifest, configured branding routes, theme and private APIs/media use network/no-store responses and are not intercepted by the shell service worker. Configured asset URLs include a revision value; the shell cache version changes with the UI and retains only public static assets. The browser/OS may cache installed identity independently; existing installations can require reopening or reinstalling to update icons/name. Offline audio is not supplied. Browser tabs need a reload after administration changes.

## Attribution and physical devices

The artist header, player, logo, artwork and installed icons contain no Musixene artistic identity. The exact linked phrase **Powered by an Open Source Concept from Musixene**, **© 2026 Musixene**, and a source link remain in a readable, persistent footer on login, session restoration, Player/Store and administration. The About panel states that Musixene is a trade name of Clara Vista Entertainment LLC and distinguishes software licensing from artist content.

Compliance concern: an ordinary footer after hundreds of rows would not reliably be prominent at launch/session start under the adopted CPAL provisions. This design keeps the footer outside the independently scrolling main/catalog areas and tests initial visibility at realistic viewport sizes. This is implementation evidence, not legal certification. Attribution must not be removed to fit a particular artist theme. Retain LICENSE, NOTICE, source notices and dated CHANGES.

Android/iOS installation, long locked/background playback, automatic advancement while suspended, lock-screen/Control Center metadata/actions, real Bluetooth hardware, interruptions and connection handover still require the physical-device procedure in development-review.md. Media Session support varies; browser automation does not prove universal OS support. No balances, deductions, reservations, products or transactions are introduced.

## Upgrade precautions

Schema 4 is transactional and additive. Accounts/password hashes, roles, sessions, invitations, track IDs/filenames/artwork/visibility, collection order, branding settings, notes and likes must survive. No media is overwritten, transcoded, reimported or deleted by migration. Back up the complete stopped data/configuration before any separately authorized deployment. Schema downgrades require matching code and a complete pre-upgrade restore. Neither app.lp19music.com nor stream.musixene.live is accessed during development.

## Executed release evidence

- 30 Node tests pass: existing account/auth/privacy/media regressions plus metadata validation, system and dynamic catalogs, branding PNG security/dimensions/fallbacks, queue snapshots, late schema-4 migration rollback and repeated startup with all schema-3 data intact. Archive restoration includes track classifications, dynamic rules, public branding, private feedback and unchanged music bytes.
- 7 Chromium tests pass: actual synthetic audio, play/pause/seek/end transitions, shuffle/repeat, queue/source/position continuity through catalog/Store changes, current-track Likes, private note drafts across Media Session action callbacks and repeat-one, safe note text/export/deletion, administrator classification/dynamic catalogs/PWA branding, and 240-row responsive scrolling. Viewports include 360×740, 390×844, 768×1024, 1280×900 and 844×390. Footer checks include login and administration, with simulated notch/home-indicator safe-area CSS; keyboard mode controls and rendered dark-accent primary-control contrast are covered. Media Session callback invocation is simulation, not physical lock-screen evidence.
- `npm run test:container` builds the image and checks non-root/read-only operation, distribution notices, health version/schema, generated audio/ranges, role/visibility filtering, metadata-driven catalogs, branding assets, private feedback and persistence after container restart. Only a newly created synthetic volume is mounted, then removed. This check also runs in PR CI. It uses loopback HTTP with explicit Origin/cookie handling, not a production TLS proxy.
- No production services, databases, accounts, music or backups were accessed. No credit ledger, reservations/deductions, commerce transactions or analytics collection are included. Physical devices, real TLS/reverse-proxy installation, load testing and a full accessibility/security audit remain unverified.
