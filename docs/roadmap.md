# Development roadmap

The approved baseline is Node.js 24, plain browser modules, SQLite, private local media, local accounts and a single-artist modular monolith. CPAL 1.0 is adopted; preserve required attribution, source availability, notices and contributor rights. No mandatory Musixene account, hosting or central service is proposed.

This sequence follows the project continuity directive. See the [audit and scoped development proposals](development-review.md) for current test evidence, findings, physical-device procedures and decisions requiring review. Prior phase numbers are historical, not implementation-order requirements.

## 1. Repository, regression and mobile validation

Current baseline: main `14429c3`, application 0.1.0, schema 2. Administration/authentication/upload/collection/player/PWA features are delivered. Fresh audit: 21 Node tests pass; Chromium has two passes and one attribution-locator failure after licensing changes. Physical-device behavior remains unverified.

First propose a focused maintenance PR: repair attribution regression assertions and desktop notice grid placement, include license/notice files in the image, align release guidance with reviewed main revisions, and verify corresponding-source provenance. Add appropriate PR checks. No code fixes are included in the audit itself.

Run the physical Android/iOS browser/installed-PWA checklist against a separately authorized synthetic HTTPS test installation. Record installation, long locked/background playback, natural track advancement, lock-screen metadata/actions, Bluetooth, interruptions/connectivity, session recovery, accessibility and attribution visibility. Browser emulation is not physical-device evidence. Record failures, unsupported cases and unknowns before promising support.

## 2. Likes and private Note to Artist

After review, add idempotent track likes, caller-only state and private track-specific written notes. Administrators receive authorized, paginated track/listener feedback views; other listeners cannot access private notes. Retain the simple same-origin application and uninterrupted player.

Approve note length/multiplicity, editing/deletion, unpublished-track access, retention, abuse limits and export/account-deletion policies before finalizing schema 3. Require safe additive migrations, existing-account/media preservation, two-user privacy tests, server authorization, CSRF/origin failures, durable state, inert text rendering and browser interaction tests.

## 3. Playback analytics

After feedback, define an explicit event/privacy/retention policy and implement estimated playback reporting and an administrator dashboard. Distinguish selections, starts, observed progress, reported completions and explicit skips. Missing events and browser suspension remain uncertainty; downloaded bytes and wall-clock time are not verified listening.

Require idempotency, sequence validation, conservative duration estimates, seek/pause/buffering exclusion, bounded storage/retention, deletion/export controls and authorization tests. Telemetry failures must never block music. No external tracker or public listener activity by default. Review analytics separately from credits.

## 4. Listener credits and metered consumption — gated

Prepaid credits consumed proportionally at artist-configurable per-minute rates remain the approved direction, including free and differentiated content. Candidate protocol: renewable allowances, cumulative progress and incremental reconciliation. Approve the charging policy and explicitly authorize implementation before actual deductions.

Requirements: exact integer subdivisions, append-only ledger, administrator grants/adjustments, transactional reservations/settlement, idempotency/concurrency, distinct available/held/consumed balances, no session fee, no paused/buffering charges, explicit seek/replay/failure treatment and listener-favorable uncertainty. Background JavaScript suspension must not unnecessarily interrupt music. Current accounting remains disabled; this roadmap does not authorize activation.

## 5. Operational hardening and portability

Keep hardening alongside each release: security limitations, migration/rollback safety, repeatable install/upgrade, verified backups/isolated restore, retention/deletion/export, portability, accessibility, codec/resource limits, diagnostics, CI/reproducible releases and optional PWA branding/icons. Never overwrite a live database, delete persistent volumes or destroy existing music during routine upgrades. No central management platform.

## 6. Optional commerce and extended artist material

After relationship, analytics and approved credit foundations, consider artist-chosen optional processors, purchases, merchandise-linked credits and additional artist-controlled material. Verify signatures, duplicate/retry/reversal handling and rights in contributed material. Preserve useful free deployments; avoid premature commerce infrastructure.

## Workflow and release gates

Start focused branches from current main; make understandable commits and submit PRs for review instead of pushing directly to main. Align README, requirements, architecture, operations, roadmap and dated change history with delivered behavior. Preserve the exact linked Musixene attribution and covered-source notices.

Implementation, automated checks, physical-device evidence and production readiness are separate claims. Code changes, GitHub merges and live deployment are separate actions. Neither `app.lp19music.com` nor `stream.musixene.live` may be accessed or modified without explicit authorization. Authorized production work must first verify actual deployed revision, configuration, backups, migration/rollback plan and post-deployment checks. Preserve both music collections and their backups.
