# Metered credit accounting — decision review

Status: renewable playback allowances with incremental reconciliation accepted as the current direction for further investigation. Detailed protocol parameters remain unresolved. No credit deductions are authorized or implemented. The listener-favorable uncertainty policy is preserved. The SQLite/local-media modular monolith baseline is approved.

Additional accepted constraint: background playback must not be unnecessarily interrupted because accounting callbacks are delayed or suspended by the browser. Missing accounting events alone must not trigger an automatic pause. Resolve allowance renewal versus mobile continuity through real-device investigation before enforcing paid allowances; this phase uses a no-charge boundary without accounting timers.

## Required outcome and evidence boundary

Each content item has an artist-configurable credits-per-minute rate, including zero and fractional values. Consumption must be proportional to actual playback duration, excluding pauses, buffering, and seek jumps. Replay consumes duration again, even over the same media positions. Public releases may have a rate 1/20 of exclusive material. A session is an identity for accounting, never a fixed charge.

A normal web application cannot prove that a person heard audio. A browser's media timeline and playback events provide evidence of rendering/progress, not attention. Downloaded bytes, HTTP range requests, time since authorization, and buffer size do not establish playback. Background audio may continue while JavaScript timers/events are delayed or suspended. A missing interval cannot reliably be classified as playback versus pause/buffering. No approach below eliminates this uncertainty or tampering without changing scope or compromising the no-pause-charge principle.

“Actual playback duration” also needs a precise definition when playback speed changes. Proposed initial default: support normal speed only and count advancing media time during playback. If speed control is added, approve whether billing follows rendered media seconds or elapsed active listening seconds and adjust validation accordingly. Muting/volume behavior also needs a stated policy; neither establishes human attention.

## Three approaches

| Approach | Reservations, consumption, reconciliation | Advantages | Limitations |
| --- | --- | --- | --- |
| A. Cumulative client reports with periodic settlement | Reserve a limited allowance. Client reports cumulative active duration and state boundaries; server settles validated deltas, replenishes holds, and releases unused funds on close/expiry. Retry unacknowledged reports. | Fits byte-range audio and a small monolith; fewer writes when batched; duplicate reports need not duplicate charges. | Client can under-report or fabricate events. Long disconnected/suspended intervals may never be resolved. Playback can outlast the reserved allowance from already buffered media. |
| B. Short renewable playback leases with cumulative reconciliation | Same measurement as A, but each reservation funds a bounded playback allowance. Renew while reports are acknowledged; withhold new authorization at the limit. Reconcile accepted cumulative totals and release unused holds. | Bounds normal-client exposure, protects available balances across sessions, and makes failure recovery explicit. Compatible with existing reference architecture. | Requires connectivity for continued authorization. Background suspension may prevent renewal even while audio works. Lease expiry cannot stop bytes already buffered, and browser code is not a tamper-proof enforcement boundary. |
| C. Segmented delivery with reservation per bounded window and playback receipts | Reserve for a small segment/window; deliver on authorization; settle only reported played duration and release the remainder. Deduplicate receipts and reconcile windows. | More control over future delivery and prefetch; smaller delivery windows can limit unpaid exposure. | Segments may be buffered, skipped, or never played; delivery still cannot justify charging. More media processing, storage, player, and operational complexity. A suspended client can still lose receipts. Changes the approved byte-range default and needs separate approval. |

All three are viable as best-effort metering systems with explicit uncertainty policies, not exact or fraud-proof measurements. A wall-clock heartbeat fee or charge-per-delivered-byte scheme is not acceptable: it charges pauses, buffering, or prefetch rather than playback.

## Recommendation for review

Accepted direction for investigation: **B: bounded reservations and renewable authorization, using A's cumulative report protocol**, retaining authenticated HTTP byte ranges. Keep lease duration, reporting cadence, buffer policy, and reconciliation grace configurable only within tested limits; select values through real-device testing rather than inventing guarantees now. Do not introduce segmented streaming unless evidence justifies its added complexity.

Use a listener-favorable uncertainty rule initially: settle only validated playback evidence, never infer consumption solely from silence or reservation expiry. Release unused holds after a defined grace period. This avoids billing invented paused/buffering time but permits some unbilled playback and under-reporting. If that business risk is unacceptable, revisit delivery/player scope; automatically charging the hold would violate the stated requirements.

No lost-event interval should be reconstructed merely by subtracting the last and next media positions: a seek can mimic progress, and replay can return to the same position. A cumulative report can recover a lost request only when the client actually retained valid measurement; it cannot recover playback evidence never observed during suspension.

## Proposed accounting mechanics — not approved

1. **Reserve:** atomically check available balance, create an expiring hold, and bind a playback identity to account, content, immutable rate version, and authorization window. Available = posted balance minus active holds. A hold is not a consumption debit. Zero-rate content needs no funded hold.
2. **Measure:** track playback epochs with sequence numbers, cumulative billable duration, and explicit play/pause/waiting/seek/content-change boundaries. Use a monotonic clock to bound plausible advancement; do not integrate across unobserved gaps. Do not count seek distance or use one media position as a lifetime counter. Persist minimal unacknowledged reports in a bounded local outbox if security/privacy review permits; it contains no audio or reusable authentication secret.
3. **Settle incrementally:** validate report identity, sequence, state transitions, time plausibility, authorized allowance, and rate snapshot. In one short SQLite write transaction, accept the new cumulative high-water mark, append only the newly owed debit, reduce the hold by that amount, and record the idempotent result. Never debit beyond the authorized funds. Reject/quarantine contradictory evidence rather than silently clipping it into a false success.
4. **Renew:** atomically replenish the reservation only from still-available funds. Multiple sessions cannot reserve the same balance. Grant/report retries return the same persisted result, including after a response is lost. Keep available/held/consumed amounts clear to listeners.
5. **Reconcile:** on pause/close/end attempt a final report and release unused holds; do not depend on unload or beacon delivery. On restart/expiry process outstanding holds and acknowledged totals idempotently. During a defined grace window allow valid late evidence only under the existing funded authorization. After final release, do not silently create debt or debit newly available funds for stale reports; quarantine for the approved adjustment policy. Never convert an expired hold wholesale into a debit.

The database transaction cannot include guaranteed audio delivery to a device. An authorization/report/settlement state machine must therefore handle crashes between each external action. Every retryable operation requires a stable unique key and persisted outcome, enforced by constraints, not a process-memory deduplication cache. Append-only history makes normal application actions auditable; a server owner can still alter the database, so this is not external tamper-proof accounting.

### Fractional arithmetic

Use fixed-point integer subcredits or exact rational arithmetic, never binary floating-point credit balances. Store rates as exact approved decimal/rational values and duration in a defined integer resolution. For rate `r` credits/minute and accepted duration `d` milliseconds, exact cost is `r × d / 60000`.

Choose precision, limits, overflow handling, and rounding through review. Preserve fractional remainders at account level, partitioned/versioned as needed for rate calculations; do not round every heartbeat or drop remainders at session/track boundaries. Charge the difference between cumulative quantized obligation and prior settlement so packet frequency does not change the price. Define reserve rounding conservatively without treating the rounded hold as consumption.

Example: at 1 credit/minute exclusive and 0.05 credit/minute public, 30 accepted playback seconds cost 0.5 and 0.025 credits respectively. Splitting those seconds across reports must produce the same obligation. Audit records must preserve accepted duration, rate version, fractional carry, and rounding decisions.

### SQLite and auditing

Keep reserve/settle/release operations short, serialized transactionally, and durable on persistent local disk. Explicitly test simultaneous sessions, busy handling, constraint failures, crash recovery, and retries after commit but before response. Preserve grants, holds, releases, settlements, and compensating reversals with actor/reason, operation ID, content/rate, accepted evidence reference, and timestamps. Corrections append reversals/adjustments; never rewrite historical charges. Posted balances and active holds must reconcile to recorded history.

Keep high-volume analytics outside the critical settlement transaction. Analytics may reuse accepted accounting summaries but must label client-reported, delivered, and uncertain activity separately. Losing an analytics batch must not lose a ledger entry. Retention/export rules must preserve sufficient billing evidence without retaining unnecessary listening detail indefinitely.

## Playback and failure cases

| Case | Proposed handling and limitation |
| --- | --- |
| Pause | End the active measurement interval; do not charge the paused interval. Stop reports need retries; missing boundaries produce uncertainty, not assumed playback. |
| Buffering/stall | Exclude time without media advancement and waiting/stalled intervals. A play intent alone is insufficient. |
| Seek | End the current epoch; exclude the jump; resume measuring actual playback at the destination. Range requests have no direct charge. |
| Replay/loop | New playback epoch; rendered duration consumes again. Deduplicate event identities, not media positions, so legitimate repeated listening remains billable. |
| Shuffle/track change | Close/reconcile the old content epoch, release its unused hold as appropriate, and authorize the next content at its own rate. Prefetch does not consume credits. |
| Price change | Snapshot the displayed rate for an authorization window. Apply a new rate only at a disclosed renewal boundary, never retroactively. Final boundary policy needs approval. |
| Duplicate/out-of-order event | Unique operation IDs and cumulative high-water marks prevent duplicate settlement. Older reports do not roll back accepted totals; contradictory transitions are flagged. |
| Request/response lost | Retry the same operation or send a valid cumulative report; retrieve persisted acknowledgments. Never create a fresh charge solely because a response was lost. |
| Network disconnect | Differentiate proven lack of funds from missing callbacks. Do not pause solely because browser suspension delayed accounting events. Connectivity loss may prevent delivery; buffered audio may continue and cannot be clawed back. The grace/renewal behavior balancing continuity and funded exposure remains unresolved; do not promise hard enforcement. |
| Background/lock screen/Bluetooth | Prefer native media transport and Media Session support. Audio/control actions may occur while application callbacks are suspended. Do not assume foreground timers or final events run; test devices and expose uncertainty. Web Bluetooth is not needed for ordinary media buttons. |
| Crash/tab close/server restart | Recover persisted reports/holds where possible; reconcile only accepted evidence. Expiry frees unused holds, never bills presumed elapsed time. |
| Insufficient credits | No new paid allowance; stop normal-client playback at the allowed boundary, show the reason, and retain free-content access. Exact boundary behavior requires testing against buffering. |
| Multiple devices/tabs | Each identity has its own reservation; shared balance changes are atomic. Decide whether to restrict simultaneous playback, rather than relying on an in-memory lock. |

## Decisions required before implementation

- Approach B is accepted for investigation, with listener-favorable uncertainty. Define a mobile-continuity policy and tolerable underbilling exposure without treating event silence as proof of consumption or as an automatic pause trigger.
- Define billable duration, playback-speed/mute policy, report validation, and uncertainty classification. No method can promise exact actual listening across arbitrary lost events.
- Select reservation size, renewal/expiry/grace windows, concurrency policy, late-evidence handling, and maximum tolerated exposure through device tests.
- Approve credit precision, rate limits, fractional carry, rounding, displayed estimates, and price-version boundaries.
- Define reversals, dispute evidence, retention/privacy, and listener-visible held/settled balances.

Required future evidence: known-duration synthetic playback at zero/fractional/1:20 rates; pause/buffer/seek/loop/shuffle cases; varied report batching; duplicate/reordered/dropped requests; response loss; crash/restart; concurrent funds exhaustion; disconnected playback; and real-device background/Bluetooth tests. Record discrepancies and uncertainty rather than declaring metering exact.
