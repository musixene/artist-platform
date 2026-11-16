# Continuity audit and proposed next development

Status: audit and planning only, ready for maintainer review. No application code, database schema, or license terms changed. No production services, media, accounts, credentials, databases or backups accessed. Development uses synthetic data on loopback.

## Baseline and executed evidence

Audited `origin/main` at `14429c3a2c22c4b22f15dd28fdec64ca4d46eaa8`, matching the supplied baseline. Local review branch: `review/continuity-audit`, created from that main revision. Application version: `0.1.0`; database schema: 2; Node: 24.22.1. Git history includes merges for PRs #1 and #2. The production revision is unknown and was deliberately not inspected.

| Check | Fresh result on the licensed baseline |
| --- | --- |
| `npm ci` | Passed; no production npm dependencies. |
| `npm test` | 21 passed, 0 failed, 0 skipped. Includes API/auth, roles/invitations, migration preservation/rollback, private uploads, collections, player/domain, operator tools and synthetic archive restore. |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` | 2 passed, 1 failed. Player test fails at its attribution assertion; mobile layout and administrator/invitation/upload/collection tests pass. |
| Comment-capable application, script, test and domain source headers | CPAL notices present in all scanned JS/CSS/HTML/SVG sources; JSON/PNG coverage is described by NOTICE. |
| Attribution/source links | Both pages include copyright, the exact linked phrase and a source-repository link near the beginning, plus the existing footer attribution. Local browser confirms both listener-page attribution links point to `https://musixene.com`. |
| Local Markdown links | No broken relative links under docs. |
| Physical devices, TLS/container rebuild, production revision, branch protection | Not verified in this audit. |

Implemented behavior matches the directive's delivered feature list: local accounts, administrator/listener roles, invite-only defaults and configurable signup, hashed single-use expiring invitations, listener management, private bounded signature-checked uploads, publication/order/artwork, collections, saved branding, authenticated range playback, queue controls, Media Session and a shell-only PWA cache. Likes, private notes, playback analytics, credit deductions and commerce are absent. Current accounting is explicitly no-charge. The baseline architecture remains Node 24/plain browser modules/SQLite/private local files, without a mandatory external service.

## Findings and recommended baseline repair

1. **Browser regression suite is red.** `tests/browser/player.spec.js:47` expects exactly one attribution link. The licensing UI adds a second, so Playwright reports a strict-mode violation. Both links have the correct text and destination. Playback, seeking, queue advancement and cache checks before that line pass; the later logout/login assertions are not executed in this run. Scope assertions separately to the opening notice and footer, preserve both notices, and verify copyright/source links and initial visibility. Do not remove attribution to satisfy the test.
2. **The new notice changes desktop grid placement.** `apps/web/index.html:15` inserts an ordinary paragraph as a child of the two-column main grid. It occupies the first cell, moves the introduction into the second, and pushes the authentication panel to the next row. Local Chromium at 1280×900 measured the authentication panel starting around y=557 and extending past y=1181; the notice grid box stretches to about 343px high. Give the attribution area a dedicated full-width grid row while preserving readable initial visibility. At 390×844 the opening notice is within the first viewport, but that is desktop emulation, not physical-device evidence.
3. **Container packaging omits license files.** Dockerfile copies application directories and package files, but not root LICENSE or NOTICE. Its source-file notices refer to LICENSE, which the image recipe does not supply. Include LICENSE, NOTICE and the covered-code change history in the runtime artifact; verify them in an isolated image. The UI's source link targets the general repository, not an immutable build revision. Document corresponding-source provenance for releases and modified deployments; a generic link alone does not establish that deployed modifications are available. This is a packaging observation, not certification of legal compliance.
4. **Upgrade instructions still use the original feature branch.** `docs/operations/administration.md:56`–58 selects `feature/initial-artist-platform`. Switch future release instructions to a reviewed main revision/tag, with immutable revision recording, backups and rollback. This audit does not upgrade either server.
5. **Roadmap and requirements lag the adopted sequence.** The previous roadmap prioritizes credits before feedback/analytics. Requirements still list registration/bootstrap design as unresolved even though implemented. Distinguish historical proposals from delivered behavior and keep the explicit deduction-review gate.
6. **Regression automation is not configured in the repository.** No checked-in `.github/workflows` exists. Recommend Node tests and Chromium smoke tests for PRs, plus license/attribution artifact checks. GitHub branch protection and required-check settings were not inspected; maintainers should confirm review requirements. The lockfile root metadata also omits the package's CPAL license field; synchronize it in a maintenance change, without changing third-party licenses.

No change to adopted CPAL terms, exact attribution or contributor rights is proposed. LICENSE, completed attribution exhibits, NOTICE, CONTRIBUTING and dated CHANGES are present. Existing historical dates are retained. No missing source header was found in the scanned application sources.

Recommended first PR: narrowly repair the attribution assertions/layout, include distribution notices, align lockfile metadata and upgrade guidance, and add focused notice regression checks. Rerun both suites and inspect desktop/mobile viewports. Do not claim full mobile support from that PR. Submit it from current main for review; do not push directly to main or deploy automatically.

## Physical-device playback validation procedure

Use a separately authorized HTTPS test installation with synthetic audio, disposable listener/admin accounts and no production mounts or copied music. Do not use either live application under this assignment. Record code revision, configuration, device model, OS/browser version, date, format/codec, network, battery/low-power state, browser versus installed mode, duration and results. Record pass/fail/unsupported/not tested and reproducible failure steps; screenshots must exclude passwords/invitation tokens.

Minimum matrix: a physical Android phone with current Chrome in browser and installed-PWA modes; a physical iPhone with Safari in browser and Add-to-Home-Screen modes. Include the oldest OS version the project intends to support before publishing a support range. Exercise WAV/MP3/M4A/Ogg as appropriate and record codec-specific failures rather than assuming container support proves codec support.

| Procedure | Evidence to record |
| --- | --- |
| Install and reopen | Correct artist name/icons, install menu or Share → Add to Home Screen, standalone launch, session restoration, shell update after a test release. |
| First-screen notice | Exact attribution, Musixene copyright and source link readable on login, restored-session launch and admin entry; artist branding remains prominent. Check portrait/landscape and enlarged text. |
| Foreground playback | Full-track playback, pause/resume, touch seek, next/previous, collection filtering and repeat/shuffle. Check the same audio element advances through at least three tracks. |
| Locked/background playback | Play for at least 20 minutes, including several natural track endings, with screen locked and another app in front; repeat in low-power mode. Record pauses, delayed transitions and recovery gestures. A short tone loop can exercise transitions; also test longer synthetic tracks. |
| Lock-screen/media controls | Title/artist/artwork and play/pause/next/previous/seek where supported. Check displayed state against actual audio. |
| Bluetooth | Test headset controls, disconnect/reconnect and route changes. Test vehicle controls only while parked or with a passenger operating the phone. Record hardware and unsupported controls. |
| Interruptions | Trigger an alarm/call and another audio app. Observe pause/duck/resume behavior and whether a gesture is required to recover. |
| Connectivity | Wi-Fi/cellular handover, brief disconnection and return online. Check clear errors/retry and ensure no private recordings or API responses enter service-worker caches. Offline audio is not promised. |
| Session expiry/revocation | In the disposable environment, expire/revoke or disable the account during playback. Future media requests must be denied; already buffered bytes may continue. Verify sign-in and track reselection recovery. |
| Accessibility | VoiceOver/TalkBack labels, keyboard/focus where available, text scaling, touch targets, contrast with chosen accent, no horizontal overflow and no obscured controls. |

All physical-device entries remain **not tested** by this audit. Discrepancies become scoped issues with device evidence; do not bill uncertain time or add background timers as a playback prerequisite.

## Proposed Likes and Note to Artist release

Implement after baseline repair and maintainer review. Keep one same-origin application, SQLite and local accounts. No email, public feed, messaging broker or centralized Musixene service.

**Persistence and migration:** introduce schema 3 in a transaction. Proposed `track_likes(user_id, track_id, created_at)` has foreign keys and a composite primary key, making like/unlike idempotent. Proposed `track_notes(id, user_id, track_id, body, created_at)` supports multiple notes per listener/track; store plain text, not rendered HTML. Index notes by track/time and user/time. Preserve schema-2 users, sessions, catalog, collections and media byte-for-byte. Test fresh install, upgrade, reopen, injected migration failure, backups and restoration with populated new tables. Do not drop existing tables or files. Decide deletion/retention semantics before finalizing foreign-key cascades.

**Authorization and API:** derive listener identity from the current server session, never a submitted user ID. Like/unlike and note creation require an enabled account, published track, same-origin POST and valid CSRF. Return only the caller's like status and own notes from listener endpoints; do not include other listeners' identities or notes or expose public like counts by default. Add separately role-checked, paginated administrator views filtered by track/listener. Define whether authors can read/delete prior notes after a track is unpublished; proposed answer is yes for their own notes, without restoring access to hidden media. Administrators can inspect feedback for hidden tracks. Bound query sizes, body length and per-account write rates.

**Listener UI:** accessible Like toggle with pressed state, server-confirmed state and error recovery; a track-specific **Note to Artist** form labeled “Private: visible to you and this artist's administrators.” No promise of a reply. Keep controls outside the existing Play button so they neither nest interactive elements nor start/stop playback. Show submission progress/success and retain drafts after transient errors. Render all user text through textContent. Avoid browser persistence of private drafts by default.

**Administrator UI:** dedicated feedback section with track/listener filters, timestamped notes and current like status/count. Page results rather than adding all note bodies to the existing all-in-one `/api/admin/state`. Explain that unliking removes the current like, not a measured listening event. No outbound notifications in this scope.

**Recommended decisions for approval:** current likes rather than a historical like-event log; multiple immutable notes up to 2,000 Unicode characters, with author deletion; administrators may remove notes but do not edit authors' text; account disabling retains feedback, while an explicit deletion workflow removes personal feedback/likes. Notes remain until deleted, with the retention and backup expiry policy disclosed before release. Own-data export is available to the listener; artist exports containing private notes remain administrator-only and audited. A minimal delete/export path and privacy notice belong in this release if adopting these policies. These are proposals, not already approved policies.

**Acceptance tests:** repeated/concurrent like and unlike; persistent own state after reload; two-listener privacy isolation; ID substitution/direct endpoint attacks; missing/expired/disabled sessions; listener denial at admin routes; missing/wrong CSRF/origin; hidden/missing tracks; blank/oversized notes and write throttling; inert HTML/script text; paginated authorized admin filtering; deletion/export boundaries; migration rollback and restore; browser keyboard/touch controls that do not interrupt music. Credits stay disabled and attribution/source notices remain exact.

## Proposed listener analytics release, after feedback

Begin with a written event/retention policy, then a separate schema migration and PR. Proposed event vocabulary: selection, actual media play/start, pause, progress, seek, ended and explicit user skip. A selection is not a start. A missing final event is an unknown departure, not proof of a skip. Label dashboard values **estimated playback activity**; server byte delivery is not listening evidence.

Server assigns/binds playback identifiers to the authenticated user and track. Use bounded payloads, supported event types, sequence numbers and unique event IDs with database uniqueness for duplicate/retry protection. Validate finite positions/durations, reject impossible jumps and prevent an account from appending to another account's playback. Record server receipt time separately from client-reported media times. Use conservative positive media-position progress bounded by plausible elapsed intervals; exclude seeks, pauses and buffering, avoid double counting overlapping reports, and mark gaps/overlapping sessions as uncertain. A reported ended event and observed progress coverage should be separate metrics rather than a single “verified completion.”

Reporting must be asynchronous, bounded and best effort. No analytics request failure or missing renewal can pause or deny authorized music playback. Browser/OS suspension can lose evidence; do not invent duration for missing periods. Do not make analytics a credit ledger or enable deductions. Test duplicate, delayed, reordered, replayed and lost events, seeking, buffering, concurrent tabs, offline/reconnect and background suspension. Test explicitly that rejected telemetry leaves playback working.

Proposed administrator dashboard: time-range/track filters; selections, starts, reported completions, explicit skips, observed estimated duration and uncertainty; separate authorized listener detail view. No public listener activity, cross-user client endpoints, external tracker, IP/user-agent collection by default or claim of independent verification.

Recommended retention proposal for review: raw events 90 days, daily track aggregates 12 months, documented periodic pruning, bounded ingest quotas and administrator-only exports. Decide consent/notice and per-listener opt-out, account-deletion/pseudonymization rules, export formats and whether historical aggregates survive personal-data deletion before implementation. Decide whether duration is a conservative lower-bound observation or a separately labeled estimate; never silently substitute wall-clock time. Implement transparent deletion/export controls and tests with the selected policy. Backups require their own retention/expiry policy.

## Review sequence and boundaries

Review the findings and baseline maintenance PR scope first, then approve the feedback/privacy/UI decisions and schema-3 acceptance criteria. Execute the physical-device checklist in authorized isolated infrastructure. Implement feedback in a focused PR, followed by a separately reviewed analytics policy/implementation PR. Keep all source and change notices. Rebase future branches on current main; require review and repeat relevant checks before merging. Deployment is a distinct, explicitly authorized action with actual-revision verification, backup, migration/rollback checks and post-deployment validation.

Credits remain disabled until the charging policy and implementation are explicitly approved. Commerce comes after the relationship, analytics and approved credit foundations. Neither live application was visited, deployed, tested or modified for this audit.
