/**
 * Future accounting boundary. No credits, reservations, timers, or debits exist here.
 * authorizePlayback({ listenerId, trackId }) -> { allowed, mode }
 * Future allowances/reconciliation must preserve listener-favorable uncertainty.
 * Authorization must never rely on a background browser heartbeat in this phase.
 */
export class NoChargeAccounting {
  async authorizePlayback({ listenerId, trackId }) {
    if (!listenerId || !trackId) throw new Error('Playback identity required');
    return { allowed: true, mode: 'disabled', chargesEnabled: false };
  }
}
