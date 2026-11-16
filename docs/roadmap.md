# Phased development roadmap

Status: reference architecture and metering investigation direction accepted. Initial installation/authentication/player/PWA development is authorized and delivered. Phases express dependencies and review gates, not calendar commitments; later features remain planned.

## Phase 0 — Review the foundation

The single-artist modular monolith, transactional SQLite, private local media, container deployment, local accounts, artist-controlled configuration, authenticated byte ranges, and optional later PostgreSQL/object storage are approved. Review remaining layout, framework, requirements, and roadmap details. Resolve the metering protocol and other policy decisions. Evaluate CPAL 1.0 and alternatives for attribution, redistribution, compatibility, and contribution terms.

Exit: reviewed scope, decision records, clear licensing status, and explicit authorization to implement. Approve contribution terms before accepting external code; final license approval is required before software release.

## Phase 1 — Prove platform feasibility

After authorization, use generated audio in isolated infrastructure to test authenticated byte-range delivery, short-lived grants, installation, seeking, background playback, screen lock, interruptions, and Bluetooth on real Android/iOS devices. Validate SQLite durability and private local media backup/restore. Investigate cumulative metering, reservation recovery, and mobile event loss without assuming background timers remain active; credit deductions remain unauthorized; use the disabled accounting boundary for this phase. Select frameworks, versions, formats, baseline hardware, and capacity targets.

Exit: reproducible independent deployment, selected stack, and supported-platform matrix with limitations. Bring unmet mobile requirements back for a scope decision before expanding development.

## Phase 2 — Build a secure vertical slice

Create approved scaffolding, CI, migrations, synthetic fixtures, and deployment configuration. Add administrator bootstrap, listener accounts/recovery, roles, artist branding, private uploads, collections, authorized playback, attribution, health checks, and documentation.

Exit: a fresh isolated installation lets an administrator publish synthetic content and a listener play it. Negative authorization, upload validation, session, private-storage, and basic accessibility checks pass.

## Phase 3 — Add credits and manual administration

Only after metering approval and implementation authorization, implement per-minute fractional rates, reservations, incremental consumption, reconciliation, append-only ledger, audited manual grants/adjustments, rate versions, and clear held/available/consumed balances. Exercise pauses, buffering, seeks, replay, shuffle, concurrent sessions, duplicates, event gaps, mobile suspension, reconnects, interrupted settlement, free content, reversals, rounding, and price changes.

Exit: balances reconcile; retries cannot double-charge; concurrent sessions cannot overspend; duration-based consumption matches approved policy; no paused/buffering time is charged; uncertain intervals follow the explicitly reviewed policy. No payment integration is required.

## Phase 4 — Complete the feedback ecosystem

Add likes, private feedback, artist analytics, retention/deletion workflows, and portable exports. Verify privacy permissions, aggregate accuracy, and accessibility through complete workflows.

Exit: unrelated listeners cannot access private feedback/activity; analytics match synthetic scenarios; approved privacy and export criteria pass.

## Phase 5 — Harden independent operation and release

Complete install, upgrade, monitoring, backup, restore, and migration-failure guidance. Restore into a fresh isolated deployment and verify accounts, media, collections, balances, and permissions. Run security, accessibility, load, and real-device regressions. Publish supported versions, limitations, security reporting, contribution guidance, and approved license/notices.

Exit: required acceptance evidence recorded, critical defects resolved, and an independent operator can install, maintain, and restore without Musixene access. Release review confirms license and attribution compliance. Production deployment requires separate authorization.

## Phase 6 — Optional commerce integrations

After manual credits are stable, select an artist-requested provider. Implement verified, idempotent events, credit grants, refunds/chargebacks, reconciliation, and operator setup. Keep credentials out of source and clients; deployments without commerce remain functional.

Exit: sandbox purchase/reversal tests pass without production credentials or real transactions. Further features require separate scope decisions.

## Review priorities

Preserve the approved baseline. Select framework/runtime and resolve metering semantics before ledger implementation and validate mobile behavior before promising support. Resolve licensing and attribution before publishing software. Use isolated infrastructure and synthetic data throughout development unless separately authorized.

## Current delivery status

Phase 0 baseline and metering direction are accepted. The initial slice of Phases 1–2 supplies Node 24/SQLite/private media, container packaging, local listeners, operator import/recovery, configurable branding, player controls, PWA shell, and desktop automated tests. Schema 2 adds administrator bootstrap/roles, invite-only signup, single-use invitations, listener management, secure uploads, track controls, collections and saved branding, with migration/restore and browser tests. Physical Android/iOS feasibility and production hardening remain open. Phase 3 deductions have not begun; investigation must preserve background continuity when accounting callbacks are suspended. Phases 4–6 are not implemented.
