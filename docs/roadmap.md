# Development roadmap

The approved baseline is Node.js 24, plain browser modules, SQLite, private local media, local accounts and a single-artist modular monolith. CPAL 1.0 is adopted; preserve required attribution, source availability, notices and contributor rights. No mandatory Musixene account, hosting or central service is proposed.

This sequence follows the project continuity directive. See the [audit and scoped development proposals](development-review.md) for current test evidence, findings, physical-device procedures and decisions requiring review. Prior phase numbers are historical, not implementation-order requirements.

## Delivered through 0.3.2

Administration, local accounts/invitations/private uploads, Likes/private Note to Artist, player-first UI, metadata/curated/dynamic catalogs, artist/PWA branding, passive private diagnostics and dismissible listening tips are delivered on main. The operator verified deployment of 0.3.2. Android Chrome battery optimization was implicated in background networking failures; the operator reports listening works with Chrome Unrestricted. This is device-specific evidence, not universal support. The playback-order experiment was abandoned without merging.

## Delivered 0.4 — qualifying plays and listener credits

The 2026-11-26 approved policy replaces proportional per-minute metering: one qualifying play and one fixed track price after 60 seconds of observed playback per unique engagement. No skip analytics; sub-minute tracks receive no play counts/charges but retain Likes and notes. Pause/resume is the same engagement. Repeat-one restart and a new track selection/automatic advancement create new engagements.

Implement private track/day aggregates, administrator grants/adjustments and unlimited eligibility, finite-price holds and atomic once-only settlement. Charging defaults off; existing tracks/balances default zero and unlimited is assigned explicitly. Preserve the single audio element and listener-favorable uncertainty. See [the current accounting specification](credit-metering-review.md) for evidence limits, privacy/retention, best-effort enforcement and migration/deployment gates.

Version 0.4.0/schema 6 was reviewed, merged and reported deployed/validated by the operator. Physical-device evidence remains installation-specific.

## 0.5 review candidate — private Artist Blog and Social

Four sections: Player, Blog, Social, Store. Add administrator-only formatted publishing and private image uploads, server UTC publication/update lifecycle, chronological Pins and atomic single Top Pin with explicit conflict choices. Blog is one-way: no audio, music integration, Likes/comments, sharing or public article pages. Add a private artist-managed HTTPS social-profile directory using local icons and safe external links, without embeds or platform APIs. Preserve all player/accounting/diagnostic behavior, artist branding and CPAL attribution. Additive schema 7, no seeded artist content. See [publishing behavior, screenshots and deployment/rollback](artist-publishing.md).

Store, external-commerce links, redemption codes and payments remain deferred. PR review and explicit merge/deployment approval are separate gates.

## 5. Operational hardening and portability

Keep hardening alongside each release: security limitations, migration/rollback safety, repeatable install/upgrade, verified backups/isolated restore, retention/deletion/export, portability, accessibility, codec/resource limits, diagnostics, CI/reproducible releases and optional PWA branding/icons. Never overwrite a live database, delete persistent volumes or destroy existing music during routine upgrades. No central management platform.

## 6. Optional commerce and extended artist material

After the qualifying-play and credit release has been reviewed and validated, consider artist-chosen optional processors, purchases, merchandise-linked credits and additional artist-controlled material. Verify signatures, duplicate/retry/reversal handling and rights in contributed material. Preserve useful free deployments; avoid premature commerce infrastructure.

## Workflow and release gates

Start focused branches from current main; make understandable commits and submit PRs for review instead of pushing directly to main. Align README, requirements, architecture, operations, roadmap and dated change history with delivered behavior. Preserve the exact linked Musixene attribution and covered-source notices.

Implementation, automated checks, physical-device evidence and production readiness are separate claims. Code changes, GitHub merges and live deployment are separate actions. Neither `app.lp19music.com` nor `stream.musixene.live` may be accessed or modified without explicit authorization. Authorized production work must first verify actual deployed revision, configuration, backups, migration/rollback plan and post-deployment checks. Preserve both music collections and their backups.
