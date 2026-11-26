# Validation and mobile playback checklist

This is an initial implementation, not a production-readiness or universal mobile-support claim.

## Automated checks

- `npm test`: Node's test runner exercises isolated SQLite databases, generated audio, authentication, password hashing, session revocation/expiry, CSRF/origin failures, private media authorization, track listing, full/range/suffix/HEAD audio, invalid ranges, auth throttling, PWA assets, queue selection/shuffle/repeat, qualifying-play credits and charging-off defaults.
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

Automated checks cover representative failures, not a complete security audit. Before public production use, review proxy/TLS configuration, brute-force protection, capacity, backup/restore, accessibility, supported media codecs, and dependencies. The administration surface has role/CSRF checks and bounded signature-checked uploads; private feedback and qualifying-play analytics/credits are implemented in the 0.4 review candidate, while commerce is absent. Charging defaults off. Normal-player finite-credit checks do not prevent modified authenticated clients from fetching visible audio; observed progress is not proof of human listening. See the current accounting specification.

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

## Private feedback release

Schema 3: **25 Node tests and 5 Chromium tests pass**. Added concurrent/idempotent likes and note retry protection, strict caller isolation, invalid/oversized text, role/CSRF/origin/disabled-session failures, hidden-track own-history access without media access, administrator filters/removal/audited export, pagination, persisted write limits, deletion cascades, schema-3 failure/retry and populated feedback backup/restore. Browser tests confirm reload persistence, inert note text, two-user privacy, administrator review/removal, private JSON downloads, own deletion and continued audio while liking. Credits stay disabled. Physical devices and live deployments remain untested.

## Player-first release (0.2 / schema 4)

**30 Node tests and 8 Chromium tests pass.** The full existing regression suite is retained and adapted to the active-player feedback layout and renamed availability controls. New tests cover schema-3 preservation/failure/repeated startup, metadata and bounded dynamic catalogs, hidden/direct-media denial, PNG validation/dimensions/public fallbacks, artist/PWA names/assets, queue snapshots, Store/catalog continuity, active feedback/draft context, repeat-one and responsive 240-row scrolling. Dark-accent primary controls have a rendered contrast check. See [the complete release evidence and limitations](player-redesign.md).

The isolated non-root/read-only container build/smoke check passes, including persisted roles/sessions, range bytes, dynamic catalogs, public icons and private feedback through restart. The reproducible `npm run test:container` uses only fresh synthetic storage and is included in PR CI. An initial browser invocation encountered a leftover local preview server on the test port; that process was stopped and the isolated suite rerun. Early assertions were adjusted for the new accessible catalog-region label and multiple users' private feedback; no production data was involved.

Physical Android/iOS installation, long background/locked playback, real Bluetooth/vehicle controls, OS interruption/handover and a full accessibility audit remain pending. Neither live application was visited or changed.

CI exposed a pending-save race in administration: a subsequent form could be edited before refresh completed. Administration now disables/inerts its fieldset while a save is pending, with a deliberately delayed-response regression. A separate delayed-Like/account-switch test protects the next listener’s UI state. CI uses Ubuntu 24.04/Node 24 and retains only synthetic failure traces for diagnosis.

## Diagnostic framework validation and Android field procedure

Automated diagnostics tests use synthesized tones and isolated temporary databases. Server coverage includes all three gates, CSRF/Origin, session ownership, role/disable/expiry changes, bounded validation, idempotence, private history/export/deletion, retention, registration quotas, restart persistence, schema-4 rollback/repeated migration, and preservation of legacy rows/media bytes. Browser coverage exercises navigation/reload, failed play promises, no event streaming, local bounds/privacy, offline recovery, storage failure during audio, permission/session changes and upload-before-logout with bounded timeout/retry/export/discard. Existing queue, feedback, branding, authorization, responsive and container suites remain required.

**Physical Android validation is outstanding. Chromium automation and the illustrative sample are not evidence of a successful locked-phone test or an established root cause.** Run the following matrix after an authorized deployment on an artist-controlled test installation or the approved application instance:

| Context | Audio output | Required runs |
| --- | --- | --- |
| Android Chrome tab | Built-in speaker | Short-lock, prolonged-lock, several transitions, unlock/relock, failed-transition recovery |
| Android Chrome tab | Bluetooth | Same runs, noting connection/disconnection |
| Installed Android PWA | Built-in speaker | Same runs |
| Installed Android PWA | Bluetooth | Same runs |

For each run, record device model, Android version, Chrome version, tab/PWA mode, output device, app version, start time and whether Android media controls are present. Use an administrator account; enable and explicitly start a fresh recording. Do not alter Android battery settings between comparisons without recording that fact.

1. **Short-lock baseline:** play a track, seek to about twenty seconds before its end, lock immediately, and observe whether the next track begins and OS controls remain visible.
2. **Prolonged lock:** start normally, lock for the full track and several consecutive transitions. Record approximate lock duration and each audible transition, including the first failure. Do not unlock simply to inspect the application during this run.
3. **Unlock/relock comparison:** repeat, unlocking shortly before a transition and immediately relocking; record whether the next track starts.
4. **Failure recovery:** if playback stops, note whether OS controls disappeared. Unlock, inspect selected track, position and paused state, then press Play once and record the result. Do not assume selection at 0:00 proves `play()` rejection.
5. Return to Diagnostics, Stop Debug and wait for Saved acknowledgment. Export the private JSON and associate it with the run worksheet. If upload fails, export the local report before ending the session. Inspect `ended-received`, `next-track-selected`, source/activation events, `play-requested`, promise resolve/reject and actual error name, buffering/error events, Media Session failures and lifecycle gaps in sequence order.

An `activation-failed` preceding a missing play request supports a different explanation from a recorded `NotAllowedError`. A resolved play request followed by pause/stall supports another. A large gap or absence of an event is only an observation: Android may have suspended JavaScript or the browser may not have committed the last local write. Do not label a hypothesis as confirmed until an actual exported report and device observations support it. Keep reports private; share manually only if the artist chooses.

For a responsive check, exercise Diagnostics at 390×844 and 1440×900: keyboard tab order, labeled controls, disabled gate explanations, modal focus/Escape, JSON horizontal wrapping/scroll, touch buttons and preservation of the existing player layout. No physical-device results are asserted by this change.

Local validation on 2026-11-20 (America/Denver): 37 Node tests passed; the existing eight Chromium regression tests and twelve diagnostics Chromium tests passed; Docker smoke passed for 0.3.0/schema 5 with non-root/read-only operation, private report upload and restart persistence. Diagnostics was visually inspected at 390×844, with automated overflow checks at 390×844 and 1440×900. These are development/CI checks using synthetic data, not physical Android results.

## Phase 2: inspect the original 2026-11-21 media failure first

The operator reports a hidden Android Chrome 157 / regular-tab / app 0.3.0 failure at approximately **2026-11-21 04:55:35 UTC**, for track `9e38b352-de27-4cda-8e4b-3097f4aff7f1`. Selection, source assignment, metadata update and play invocation succeeded; loadstart was followed about 23 ms later by MediaError 4 / Format error and a NotSupportedError rejection. This establishes a media-load/initialization failure, not an unsupported codec or an HTTP cause. The underlying report was summarized by the operator; no production report, media or logs were copied into this checkout.

No hosted-server access is established. Repository inspection found no Node per-request access log, response-header log, range log or connection-close log: the HTTP handler logs only a generic unexpected error code. Consequently there is **no finding about the original request's HTTP status, Range, headers, completion, proxy origin or whether it reached Node**. Existing Nginx/proxy logs may help if retained. Run these read-only commands on the artist server, not the streaming deployment:

```bash
cd /opt/musixene/artist-platform
export APP_ORIGIN=https://app.lp19music.com
# Existing application stdout/stderr only; no logging configuration changes.
docker compose logs --no-color --timestamps \
  --since '2026-11-21T04:54:30Z' --until '2026-11-21T04:56:30Z' artist
# Nginx service errors/start/stop messages, if it is the installed proxy.
sudo journalctl -u nginx --utc \
  --since '2026-11-21 04:54:30 UTC' --until '2026-11-21 04:56:30 UTC' --no-pager
# Inspect existing log paths/formats and routing. Do not publish full config/secrets.
sudo nginx -T 2>&1 | grep -E 'log_format|access_log|error_log|proxy_pass|proxy_cache|gzip'
# Search existing and rotated logs for the actual original endpoint.
media_path='/api/tracks/9e38b352-de27-4cda-8e4b-3097f4aff7f1/audio'
sudo zgrep -h -F "$media_path" /var/log/nginx/access.log* 2>/dev/null
sudo zgrep -h -F "$media_path" /var/log/nginx/error.log* 2>/dev/null
```

Use the actual configured log paths if different. Match approximately ±60 seconds around 04:55:35 **UTC**, converting any access-log local timestamp using its explicit numeric timezone offset. Standard combined Nginx access logs usually show request/status/bytes but not Range, Content-Type, Content-Length, Content-Range, upstream status or request completion. Only report those fields when the configured format actually logged them. An Nginx 499 indicates the client closed the connection before completion; other status codes alone do not prove full body delivery. `$status` describes the proxy response, `$upstream_status` (if logged) helps identify the upstream response, and error-log messages may identify upstream failures. A log line without a matching upstream field cannot establish whether Node or the proxy generated the status. Missing lines are inconclusive when logs are absent, rotated, filtered or incomplete. Do not reload Nginx or enable additional logging for this phase.

### Phase 2 administrator capture procedure

After a separately reviewed/authorized 0.3.1 deployment, finish/export any older recording and reload the app/PWA so the new modules are loaded. Start a fresh recording with the existing operator/instance/admin gates. Record Android/device/Chrome version, regular tab or installed PWA, speaker or Bluetooth and wall-clock lock time. Stay in the player in the same tab. Reproduce the two-minute-or-longer lock-screen transition without manually retrying during the lock.

After failure, unlock and note the selected track/position and whether OS controls disappeared. Before manually resuming or stopping the recording, open the player account menu and select **Test Failed Media Source** once while visible. The action is optional, always a subsequent request, and may be skipped if preserving the failed state matters more. It does not change the audio element. Note its separate time. Then manually test Play if desired and record whether it resumes. Select Stop Debug, wait for saved acknowledgment, and export the report. Keep the report private. Do not reauthenticate to recover an unsaved report.

Compare resource start/response times, document ID and source generation across successful and failed transitions. Check `mediaAnalysis` candidate cases, original resource status availability, MIME/canPlayType hints, current/expected paths, ready/network states, buffer/seekable ranges, actual errors and overlapping-operation flags. A subsequent 206 probe cannot retroactively establish that the original request returned 206. Pair the report with the existing-log inspection above; record unavailable log fields as unavailable rather than inferring them. Automated synthetic success/failure tests are not evidence that prolonged locked Android playback works.

Phase-2 local validation (2026-11-20, America/Denver): 44 Node tests, 40 Chromium tests and the 0.3.1/schema-5 non-root/read-only container smoke passed. Cases cover native audio and manual probes returning 200/206/401/403/404/416/500, unsupported synthetic media, missing timing APIs/status, zero status, multiple ranges, overlap, gate failures, no probe body consumption/retention, legacy report uploads, canonical privacy, report-size reservation, and existing queue/authentication/streaming/logout regressions. The format-2 JSON Schema and sanitized example were also checked with a Draft 2020-12 validator. These are synthetic development checks, not a locked-phone result or a finding about the original server request.

## 0.4 qualifying-play and credit review candidate — 2026-11-26

The approved replacement policy counts one qualifying play and one fixed charge after 60 seconds observed per unique engagement, with no skip metrics and explicit artist-assigned unlimited eligibility. Schema 6 is additive; balances/prices default zero and charging defaults off. Node tests cover the threshold/jitter and uncertainty, exact prices, concurrent holds, duplicate/restart settlement, adjustment/eligibility authorization and audit, insufficient funds, short/free modes, expiry/privacy and full rollback of failed settlement. Schema-5 failure/retry/repeated-startup tests compare all existing row fields and original synthetic media bytes; legacy migration regressions still run.

Browser cases explicitly distinguish synthetic-clock threshold/retry simulations from native Chromium playback using a synthetic 70-second WAV. Tests cover pause/resume engagement identity, selecting another track and releasing its hold, report recovery after reload without duplicate debit, unlimited/short/insufficient cases, administrator controls, responsive layouts and existing authentication/feedback/diagnostics/queue regressions. Container smoke verifies exact persisted balance, unlimited eligibility, idempotent audit entry and track price after restart alongside existing data/media checks. See PR/CI results for final executed counts; these tests do not establish Android/iOS lock-screen support.

Before enabling charging on an installation, test physical Android and iOS devices with synthetic tracks longer than 60 seconds: foreground qualification; pause at 30 seconds and resume; seek across the threshold; lock for multiple natural advances; repeat-one; free/unlimited and finite funds; network loss/recovery; and app/OS interruption. Compare private ledger and play counts. Leave charging off during initial device validation. Missing background observations can undercount; no wall-clock reconstruction or automatic catch-up debit is permitted. A finite paid start waits for its hold and may need a further user gesture on browsers with stricter autoplay policies. No paid mobile-support guarantee or production activation is implied.

## 0.5 Artist Blog / Social review candidate

Server validation covers first-publication identical UTC timestamps, draft/private-image authorization, content-only updates, unpublish/republish chronology, stable normal/Pin/Top Pin ordering, exact conflict choices, concurrent assignments and replacements, rollback after an injected promotion failure, inert document validation and unsafe URL rejection, private enabled-only social management, pagination and full schema-6 row/media preservation with failure/repeated startup. Financial/user/track snapshots verify editorial operations do not alter accounting or classifications.

Browser tests cover toolbar formatting, private preview, local image conversion/upload, timestamps, all Top Pin choices, four-section native playback continuity, a funded engagement retained across navigation, paginated hostile-literal content, confirmed deletion, Social administration/security attributes and session-bound late-response suppression. The existing player/feedback/credits/diagnostics and responsive regression suites remain required. Docker smoke verifies article/image/social persistence after restart alongside accounts/media, branding, credit state/audit and diagnostics. Review screenshots are synthetic, not artist/production content. See the PR for final executed counts. No physical-device testing is claimed; follow the established Android/iOS checklist for navigation during lock-screen playback, external-link return and mobile composition/upload.
