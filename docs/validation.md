# Validation and mobile playback checklist

This is an initial implementation, not a production-readiness or universal mobile-support claim.

## Automated checks

- `npm test`: Node's test runner exercises isolated SQLite databases, generated audio, authentication, password hashing, session revocation/expiry, CSRF/origin failures, private media authorization, track listing, full/range/suffix/HEAD audio, invalid ranges, auth throttling, PWA assets, queue selection/shuffle/repeat, and disabled accounting.
- `npm run test:browser`: Playwright Chromium tests registration/login/logout, real audio progress, pause, seeking, track selection, actual end-of-track queue transition, repeat/shuffle, session restoration, Media Session metadata, service-worker activation, private-cache exclusion, attribution, and small-screen layout.
- These tests do not prove Bluetooth, lock-screen behavior, or actual PWA installation on a phone. Desktop viewport resizing is not an iOS/Android device test.
- Container validation and executed results are recorded below.

## Physical devices required before declaring mobile support

Record device model, OS/browser version, installed versus browser mode, audio format, test duration, results, and limitations for each run. Start with current iOS Safari plus Home Screen mode, and Android Chrome plus installed mode; expand only as verified.

| Capability | Required physical-device validation |
| --- | --- |
| Installation | HTTPS origin, icons/name, Android install menu/prompt, iOS Share → Add to Home Screen, standalone launch, updating the shell. |
| Background and screen lock | Long playback while locked, app switching, low-power modes, prolonged backgrounding, and whether the next track starts automatically. The OS can suspend JavaScript or terminate the app. |
| Lock-screen controls | Correct artist/title, play/pause, previous/next, seeking where supported; UI and system state remain consistent. |
| Bluetooth/headphones | Transport buttons, reconnect, disconnect, routing changes, and whether playback pauses appropriately. Media Session uses OS media routing, not Web Bluetooth. |
| Continuous queue | End-to-next while locked/backgrounded, repeat-one/all, shuffle, and seeking near track boundaries. Auto-advance depends on browser event execution and may be interrupted by suspension. |
| Interruptions | Phone calls, alarms, another audio app, headset removal, route changes, and recovery requiring a user gesture. |
| Connectivity | Wi-Fi/cellular handover, stalled range requests, disconnection, return online, explicit retry, session expiry/revocation. No offline audio is provided. |
| Controls and accessibility | Touch seeking, native volume restrictions (notably iOS), screen reader labels, focus, text scaling, contrast with configured accent, and orientation. |

A service worker cannot guarantee continuous background execution. The app uses one persistent native audio element and does not run credit heartbeats, renew accounting leases, or pause playback due to missing accounting callbacks. Background playback can still be interrupted by OS policy, session expiry, unavailable media/network, or delayed next-track events. Do not conceal these limits or bill unobserved intervals later.

## Security and remaining scope

Automated checks cover representative failures, not a complete security audit. Before public production use, review proxy/TLS configuration, brute-force protection, capacity, backup/restore, accessibility, supported media codecs, and dependencies. The administration surface has role/CSRF checks and bounded signature-checked uploads; there is no analytics collection, feedback, or commerce. No credit deductions, reservation state, or ledger exists; the accounting boundary always authorizes authenticated catalog playback without charge.

## Previous initial-slice results

- `npm ci --ignore-scripts`: passed using the repository-local npm cache configuration.
- `npm test`: **15 passed, 0 failed, 0 skipped** (API, queue/domain, operator tools, persistence, registration policy, and Secure-cookie checks).
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: **2 passed**, using real synthesized-audio playback in headless desktop Chromium. The small-screen test checks layout only.
- `docker build -t musixene-artist-platform:local .`: passed.
- Isolated container smoke check: passed with non-root user, read-only root filesystem, dropped capabilities, temporary named data volume, synthetic import, listener registration, Secure-cookie configuration, anonymous-media denial, and authenticated byte ranges. Session, catalog, and media persisted through container restart. The temporary container/volume were removed afterward. HTTPS termination itself was not tested; the smoke client used loopback HTTP with the configured HTTPS Origin header and explicit cookie transport.
- Documentation links/code fences, exact attribution, JavaScript syntax checks, and `git diff --check`: passed.
- Physical Android/iOS, actual Bluetooth hardware, long-running locked-screen playback, TLS reverse-proxy deployment, load/security/accessibility audit, and a full backup/restore drill: **not run**.

A first container smoke attempt failed after restart because the test retained an ephemeral host port that Docker reassigned. The corrected check re-read the mapped port after restart and passed; this was a test-harness issue, not observed data loss.

## Administration release validation

- `npm ci`: passed on Node 24.22.1.
- `npm test`: **21 passed, 0 failed, 0 skipped**. Added invite-only defaults, token hashing, username binding, expiry, revocation, concurrent single use, failed-registration rollback, role isolation, last-admin protection, disabled-account rejection, password reset/session revocation, saved branding/signup, private upload rejection/limits, retained superseded audio, publication/order/artwork, and collection filtering/atomic replacement.
- Schema-1 fixtures migrate twice without changing original user/password/session/track fields or media bytes; existing session access, old-password login and range playback work after migration. Injected migration failure rolls back new columns and version changes; retry succeeds after the conflict is removed. Newer schema versions are rejected.
- Automated stopped-instance tar backup/isolated restore: synthetic accounts, sessions, music bytes, saved settings and collection order survive; restored login and range playback pass. This validates the archive procedure locally; the documented Compose backup/deployment commands have not been executed against a live deployment in this change.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: **3 passed**, covering existing real audio/player behavior and mobile layout plus administrator login, branding/signup edits, draft audio upload/publication, ordered collection creation, invitation signup, listener collection filtering and administrator-page denial. The administrator viewport also has no horizontal overflow at 390px.
- Exact linked attribution remains on listening and administration pages. Credits remain disabled; CPAL 1.0 was subsequently adopted.
- No production services, `stream.musixene.live`, or backed-up MP3s were accessed or modified. Container rebuild/TLS deployment, physical mobile devices, full accessibility/security/load audits remain untested for this change.

## Licensing changes awaiting fresh tests

The previous automated test records predate the CPAL 1.0 license, UI notice and source-header changes. Rerun Node and browser suites, inspect attribution visibility on physical mobile devices, and verify any deployed instance makes its corresponding covered source available. No new test pass is asserted here.

## Fresh CPAL baseline audit

On main revision `14429c3a2c22c4b22f15dd28fdec64ca4d46eaa8` (application 0.1.0/schema 2), `npm ci` and all **21 Node tests passed** on Node 24.22.1. Chromium rerun with `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` produced **2 passed, 1 failed**. The player test fails at line 47 because the new opening notice and existing footer both contain the exact attribution link; the locator expects one element. Later logout/login assertions in that test were not reached. The mobile-layout and administrator tests passed. No application/test fix was applied during the audit.

Local desktop inspection also found the opening notice taking the first cell in the two-column main grid, displacing the authentication panel into the next row. The opening notice is within the initial 390×844 emulated viewport; this does not validate physical phones or legal compliance. Source headers, exact UI links and local documentation links were inspected. Container notice packaging and old-branch upgrade instructions need maintenance.

The prior “awaiting fresh tests” paragraph above is historical; this audit supplies the new partial regression result, not an all-green release claim. See [the audit and proposed device procedures](development-review.md). Physical Android/iOS, Bluetooth/vehicle hardware, long locked-screen playback, TLS deployment and production revisions remain unverified. Both live applications and all production data were untouched.

## Licensed baseline maintenance

After repairing the scoped attribution assertion and desktop notice row: **21 Node tests and 4 Chromium tests pass**. New viewport checks cover opening copyright, exact attribution/source links and desktop sign-in placement. The local Docker build passes; an isolated runtime container verifies LICENSE, NOTICE and CHANGES.md are present. PR CI now runs Node/Chromium checks and runtime notice packaging. Physical-device testing remains pending; no live services were accessed.
