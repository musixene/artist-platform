# Requirements proposal

Status: architecture and metering direction accepted; first installation/authentication/player/PWA implementation delivered. Detailed metering protocol remains under review and no deductions are implemented. “Must” describes intended acceptance criteria, not implemented functionality.

## Functional requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| F01 | Fully self-hosted, no mandatory Musixene services. | Fresh installation and core flows work with Musixene destinations blocked. |
| F02 | Artist controls domains, infrastructure, branding, content, accounts, and commerce. | Two isolated instances have independent configuration and data, with no central account dependency. |
| F03 | Installable PWA on Android/iOS where supported. | Real-device matrix verifies HTTPS, manifest, icons, installation instructions, and shell launch. |
| F04 | Continuous background audio, lock-screen and Bluetooth controls subject to platform capabilities. | Record real-device results for screen lock, app switching, interruptions, and media actions; document limitations/fallbacks. |
| F05 | Authenticated streaming and private media storage. | Anonymous, expired, revoked, and unauthorized requests cannot obtain new grants; private storage denies public reads; authorized seeking works. |
| F06 | Artist-managed collections, availability, and per-content pricing including free content. | Create/edit/reorder/publish/unpublish synthetic content and change rates; listeners see only permitted content. |
| F07 | Individual listener accounts and separate administration. | Login/logout, recovery, session invalidation, and role checks pass; listeners cannot access administration. |
| F08 | Likes and private feedback. | Like/unlike and feedback work; unrelated listeners cannot read others’ feedback or private activity. |
| F09 | Artist analytics. | Synthetic sessions produce accurate documented aggregates; access and retention rules pass; delivery is not labeled verified listening. |
| F10 | Prepaid credits consumed proportionally to actual playback duration at artist-configurable per-minute rates, including zero and fractional rates. No fixed session fee; paused/buffering time is excluded. | Verify 1/20 rate ratios, fractional accumulation, pauses, buffering, seeks, replay, shuffle, duplicate/out-of-order/lost events, background suspension, reconnects, insufficient funds, concurrent reservations, interrupted settlement, reversals, and reconciliation against the reviewed protocol. |
| F11 | Manual credit administration initially. | Authorized grants/adjustments require audit reasons; unauthorized changes fail and history is preserved. |
| F12 | Extensible optional commerce. | Provider-neutral grant/reversal contracts are documented; later adapters verify signatures, duplicates, refunds, and reconciliation. |
| F13 | Portable data and independently maintainable deployments. | Export documented metadata/media and restore an isolated instance; verify accounts, collections, balances, and privacy. |
| F14 | Required linked attribution. | Exact text “Powered by an Open Source Concept from Musixene” links to https://musixene.com in the approved location without a service dependency. |

## Operational and quality requirements

- Reproducible installation, pinned dependencies, configuration reference, migrations, health checks, and operator guidance without proprietary Musixene tooling.
- Meaningful tests for authorization failures, credit concurrency/idempotency, private feedback, and secret redaction.
- Accessible playback/navigation and labeled forms. Proposed target: WCAG 2.2 AA, subject to approval and verification.
- Supported browser/OS/media-format matrix and resource requirements established through a feasibility spike. Background behavior must be documented per platform.
- Measurable performance/capacity targets selected against representative hardware and workload before release; validate concurrent streams, storage bandwidth, and database contention.
- Documented monitoring, security updates, backups, restore drills, upgrades, and recovery as operator responsibilities.
- Synthetic examples and test fixtures only; no music, personal data, credentials, or private keys in source control.

## Boundaries

No copyright registration, creative provenance, recording production, artist business operations, or determination of legal publication. Musixene supplies neither hosting nor technical support. Initial scope excludes shared multi-artist hosting, native apps, offline audio, DRM guarantees, public social feeds, and mandatory payment providers or external telemetry.

The intended software is AS IS under a final approved open-source license. CPAL 1.0 is only a candidate; these documents do not grant a license.

## Decisions required before implementation

1. Validate Node.js 24/plain browser modules and select the supported mobile/browser matrix within the approved single-artist, modular monolith, container, SQLite, private-local-storage, local-account, authenticated-byte-range baseline. PostgreSQL and object storage are optional later expansions.
2. Refine the accepted renewable-allowance direction into an approved [metering protocol](credit-metering-review.md): playback-duration evidence, reservations, incremental settlement, reconciliation, missing-event policy, fractional precision, rate snapshots, concurrency, refunds/reversals, expiry, and transferability. Sessions must never introduce a fixed charge.
3. Define account registration, administrator bootstrap/recovery, listener recovery, and any optional email configuration.
4. Approve analytics events, retention, account/data deletion, feedback handling, and export permissions.
5. Approve license, contribution terms, and attribution placement. Exact wording and destination remain fixed requirements.

## Release evidence

Require a clean self-hosted installation, private playback, approved credit behavior under failure/concurrency, manual administration, feedback isolation, mobile results, and an isolated restore. Report passed, failed, unsupported, and untested cases separately. A successful build or open port alone does not prove readiness.

## Accounting invariants

Reservations reduce available credits without becoming consumption charges. Settlement and reservation release must be transactional, idempotent, and auditable. Paused/buffering or seek-jump time must not be inferred as listening. Lost mobile events must remain explicit uncertainty rather than invented playback. Verify crash/retry and restore behavior using persistent SQLite; analytics failures must not corrupt credit history.

## Current phase coverage

The current application covers local listener authentication, operator configuration/account/media tools, private byte-range playback, queue/seek/shuffle/repeat, PWA shell, and progressive Media Session controls. Browser administration/collections, likes, feedback, analytics, portable logical exports, commerce, and metered deductions remain future work. Background accounting event loss must not unnecessarily interrupt playback. See [validation](validation.md) for executed versus physical-device checks.
