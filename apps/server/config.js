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
      tagline: text(branding.tagline, 'A listening room of your own.', 200),
      accent: /^#[0-9a-f]{6}$/i.test(branding.accent || '') ? branding.accent : '#b8ef70'
    }
  };
}
