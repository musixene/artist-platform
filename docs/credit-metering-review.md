# Qualifying plays and listener credits — 0.4

The artist approved the following replacement for the former proportional per-minute/renewable-allowance proposal on 2026-11-26. This file describes the implemented review candidate, not an independent deployment authorization.

## One engagement, one threshold

An engagement starts when a track is manually selected, the queue advances to another track, or repeat-one restarts a completed track. Pause/resume, buffering, seeking and Player/Store/catalog browsing keep the current engagement. The existing active-row play/pause button remains a transport control, not a fresh selection. A fresh selection after leaving the track is a new engagement. Reload does not automatically resume audio; the next manually initiated playback starts a fresh engagement at the beginning.

At 60,000 milliseconds of conservatively observed playback, submit one qualifying play and settle the track's fixed price once. More playback within the same engagement adds neither a count nor a charge. Tracks shorter than 60 seconds never qualify or charge, including repeat-one loops; Likes and private notes remain available. No skip metrics, full-completion claims, per-minute pricing, per-HTTP fees, balances invented on migration, purchases or payment integrations.

The clock uses advancing media position bounded by monotonic time, rejects seek jumps, excludes paused/waiting/seeking intervals and gaps over two seconds, and caps its total at 60 seconds. A background gap is not reconstructed from wall-clock or media-position difference. This favors the listener and can undercount background playback. Client observations do not prove human attention or resist a modified client. Known short duration is taken from browser metadata; no existing recordings are transcoded or parsed/reimported by migration.

## Credits and unlimited eligibility

Each track has an exact fixed price, 0–1,000,000 credits, in increments of 0.001 credit (1,000 integer units per credit). Price zero is free. The artist administrator explicitly controls unlimited eligibility per listener, can grant/subtract exact credits, and must supply an audit reason. Unlimited listeners still generate qualifying plays but never reserve or consume credits. Changes and zero-amount eligibility decisions enter the append-only credit ledger with the administrator's identity. Retries reuse an operation UUID; conflicting reuse fails. Corrections append compensating adjustments rather than rewriting history.

Charging defaults off. Schema-5 upgrades preserve accounts, passwords, roles, sessions, invitations, diagnostics, Likes, notes, visibility, catalogs/order, branding and media. Track prices and balances default to zero; unlimited defaults false. The administrator configures prices, grants funds/eligibility, then explicitly enables charging. Disabling charging or granting unlimited releases pending holds without later retroactive settlement. Removing unlimited applies to subsequent engagements; existing unlimited engagements stay free.

A finite paid engagement reserves its full displayed price before the normal player starts. Price/policy disagreement with a stale catalog rejects the authorization rather than applying an undisclosed price. Available = posted balance minus unexpired open holds. Holds are not charges. Atomic SQLite transactions prevent two tabs spending the same funds. At qualification, one transaction records the unique play, appends any debit, reduces the posted balance, and releases the hold. Duplicate qualify/close/start requests return the persisted result. Leaving before qualification releases the hold and produces no analytics row. Short audio never needs a hold. Explicit insufficient funds blocks a new paid start, while free tracks and feedback remain usable.

Open authorizations expire after 24 hours; no hold becomes a charge on expiry. Crash/orphaned holds can remain until that expiry. Pauses/resumes within a live engagement retain observed progress; after expiry any later qualification is refused and no debt is invented. A completed qualification can be retried using the same UUID without charging twice. Price snapshots never change retroactively. An administrator cannot subtract encumbered funds or exceed the balance limit.

## Delivery and uncertainty limitations

Credit enforcement is best-effort in the supplied player, not DRM. Existing authenticated byte-range transport is preserved: the media endpoint does not deduct credits, enforce engagement tokens or prevent an authenticated modified client from fetching a visible recording. Buffered bytes cannot be recalled. Client duration/progress reports can be fabricated or withheld; server elapsed-time and identity checks limit accidents but do not independently verify rendered audio. A browser reload loses unqualified progress; no charge is inferred for it. This implementation does not promise strict paid-content enforcement against adversarial clients.

Qualification reporting failures never pause already playing audio. A browser-local outbox stores at most 20 qualification receipts (engagement UUID, owner UUID, expiry; no credentials or audio), with a 24-hour retry window. Retry occurs at qualification, authenticated page startup, foreground return or online recovery; there is no continuous event upload or heartbeat. Reports from another listener's outbox are not submitted under the active listener. Storage failures allow in-memory retries but cannot promise crash recovery. There is no unload/beacon delivery assumption. Expired or unobserved evidence is not charged.

## Analytics and privacy

The private administrator dashboard reports qualifying plays per track and UTC day over 90 days. It does not collect skips, selection counts, progress streams, geolocation or external analytics identifiers. Unlimited and free qualifying plays count equally. Incomplete engagement rows are operational holds/authorization receipts, not skip analytics; closed unqualified records are deleted seven days after expiry. Free/unlimited qualification receipts expire with the 90-day analytics window; paid receipts and append-only credit records remain for reconciliation. Pruning runs on startup and listening API requests, so an idle instance can retain rows until its next maintenance request.

Listeners can export their play and credit data from the account menu (paginated server reads) and unlink their identity from existing analytic rows. Anonymous aggregate totals and financial audit records remain. Future qualifying plays are still recorded. The administrative dashboard shows aggregates and the most recent 100 audit entries; it exposes no public listener activity. Existing private Like/note export and deletion remain independent. Device-local receipts expire or are acknowledged; clearing browser storage removes them but does not erase server records. Full account erasure and financial-retention policy require operator review; do not delete ledger rows manually.

Diagnostics retain their separate operator/instance/administrator gates, bounded local recorder, private reports and explicit upload model. Ordinary analytics neither enable nor stream the diagnostic recorder.

## Release and validation

Version 0.4.0, additive schema 6. Back up the stopped instance before upgrade. Old application versions reject schema 6: rollback requires the matching stopped-instance data backup, not only old code. Never restore a database alone over newer accounting/media state or delete named volumes. No production media/database is used by development tests.

Synthetic tests cover exact arithmetic, threshold boundaries, pause/buffer/seek/gaps, idempotency, concurrency, eligibility, grants/adjustments, price snapshots, short/free tracks, authorization, privacy, expiry, persistence and migration rollback/repeated startup. Browser simulations are labeled synthetic; real Android/iOS lock-screen tests with charging off are still required before enabling paid listening. Verify the 60-second threshold, pause/resume and repeat-one on physical devices; compare with server ledger results and report uncertainty rather than declaring exact metering.
