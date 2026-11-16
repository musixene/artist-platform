/*
 * The contents of this file are subject to the Common Public Attribution License Version 1.0
 * (CPAL-1.0); you may not use this file except in compliance with the License.
 * Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE.
 * The License is based on MPL 1.1; CPAL Sections 14 and 15 address attribution and network use.
 * Software distributed under the License is supplied AS IS, WITHOUT WARRANTY OF ANY KIND.
 * Original Code: Musixene Artist Platform.
 * Original and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC).
 * Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved.
 */
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
