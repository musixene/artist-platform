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
| F06 | Artist-managed collections, availability, and per-content pricing including free content. | Create/edit/reorder/show/hide synthetic content and independently classify release status and change rates; listeners see only permitted content. |
| F07 | Individual listener accounts and separate administration. | Login/logout, recovery, session invalidation, and role checks pass; listeners cannot access administration. |
| F08 | Likes and private feedback. | Like/unlike and feedback work; unrelated listeners cannot read others’ feedback or private activity. |
| F09 | Private qualifying-play analytics only; no skip tracking. | One count after 60 seconds observed per engagement, including free/unlimited listeners; track/day aggregates, private export and identity unlinking, 90-day retention. |
| F10 | One fixed artist-configured track price after 60 seconds per unique engagement; sub-minute tracks never qualify or charge. Pause/resume keeps the engagement; new selection, automatic advancement and repeat-one restart create new engagements. | Verify exact integer prices, conservative observed duration, short/free/unlimited modes, atomic reservation/settlement, duplicates, concurrency, expiry and price snapshots. See the current accounting specification. |
| F11 | Administrator credit grants/adjustments and explicit unlimited eligibility. | Require administrator authorization, reasons, immutable audit entries and idempotency; unlimited plays count without charges. |
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

The covered platform software is licensed under CPAL 1.0 (see LICENSE), including its attribution and source-availability obligations. It is provided AS IS.

## Decisions required before implementation

1. Validate Node.js 24/plain browser modules and select the supported mobile/browser matrix within the approved single-artist, modular monolith, container, SQLite, private-local-storage, local-account, authenticated-byte-range baseline. PostgreSQL and object storage are optional later expansions.
2. The approved 2026-11-26 [qualifying-play policy](credit-metering-review.md) replaces renewable/per-minute metering. Physical-device validation and operator activation of charging remain release decisions.
3. Administrator bootstrap/recovery, invite-only signup and assisted password resets are delivered; optional email and complete account-deletion UI remain future decisions.
4. Player/catalog behavior, schema-4 defaults and artist/PWA branding are documented in [the redesign](player-redesign.md). Private feedback retention/export/deletion is documented in [privacy controls](privacy.md); the approved qualifying-play analytics policy is documented in the accounting specification.
5. Maintain adopted CPAL 1.0 compliance, source notices, contribution rights and required attribution. Exact wording and destination remain fixed requirements.

## Release evidence

Require a clean self-hosted installation, private playback, approved credit behavior under failure/concurrency, manual administration, feedback isolation, mobile results, and an isolated restore. Report passed, failed, unsupported, and untested cases separately. A successful build or open port alone does not prove readiness.

## Accounting invariants

Reservations reduce available credits without becoming consumption charges. Settlement and reservation release must be transactional, idempotent, and auditable. Paused/buffering or seek-jump time must not be inferred as listening. Lost mobile events must remain explicit uncertainty rather than invented playback. Verify crash/retry and restore behavior using persistent SQLite; analytics failures must not corrupt credit history.

## Current phase coverage

The current application covers local listener authentication, operator configuration/account/media tools, private byte-range playback, queue/seek/shuffle/repeat, PWA shell, and progressive Media Session controls. Browser administration, invitation signup, account roles, private uploads, track controls, collections and branding are implemented with schema-2 preservation tests. Private Likes and Note to Artist feedback, caller-only export/deletion, administrator review/removal and schema-3 migration are implemented. The 0.4 review candidate adds qualifying-play analytics, fixed-price credits, administrator grants and unlimited eligibility. Full-instance logical exports and commerce remain future work. Background accounting event loss must not unnecessarily interrupt playback. See [validation](validation.md) for executed versus physical-device checks.

## Player-first milestone (0.2 / schema 4)

Delivered on the redesign branch: single full player, compact independently scrolling rows, active-track feedback, Player/Store navigation, Credits Available Coming Soon, three permanent catalog views, curated/dynamic catalogs, release/visibility separation, content/explicit classifications, genres/tags, and configurable logo/favicon/PWA identity. Store remains a placeholder; the 0.4 candidate replaces the credits placeholder. No analytics, metering, purchases or production deployment is authorized by this milestone.

Acceptance includes queue/source/position continuity while browsing, coherent next/previous/shuffle/repeat, draft preservation across track changes, own Like state/privacy, hidden-track denial, safe PNG image uploads/fallbacks, additive schema-3 preservation/failure/repeated-startup checks, and responsive initial footer visibility. Physical OS/PWA reliability remains subject to device validation.
