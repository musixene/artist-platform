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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function loadConfig(env = process.env) {
  const branding = env.BRANDING_FILE ? JSON.parse(readFileSync(env.BRANDING_FILE, 'utf8')) : {};
  const text = (value, fallback, limit) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : fallback;
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('APP_ORIGIN must be an HTTP(S) origin');
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production requires an HTTPS APP_ORIGIN');
  return {
    dataDir: resolve(env.DATA_DIR || 'data'), origin: origin.origin,
    secureCookies: origin.protocol === 'https:', registration: env.ALLOW_REGISTRATION === 'true',
    branding: {
      name: text(branding.name, 'Independent Artist', 100),
      tagline: typeof branding.tagline==='string'?branding.tagline.trim().slice(0,200):'A listening room of your own.',
      wordmark: text(branding.wordmark,'',100),
      pwaName: text(branding.pwaName,'',100),
      pwaShortName: text(branding.pwaShortName,'',30),
      accent: /^#[0-9a-f]{6}$/i.test(branding.accent || '') ? branding.accent : '#b8ef70'
    }
  };
}
