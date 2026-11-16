/*
The contents of this file are subject to the Common Public Attribution License Version 1.0 (CPAL-1.0); you may not use it except in compliance with the License. Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE. CPAL is based on MPL 1.1, with Sections 14 and 15 added for attribution and network use.
Original Code: Musixene Artist Platform. Original Developer and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC). Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved. Software is provided AS IS, WITHOUT WARRANTY OF ANY KIND.
*/
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, retries: 0,
  use: { baseURL: 'http://localhost:3100', browserName: 'chromium', launchOptions: { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/e2e-server.js', url: 'http://localhost:3100/api/health', reuseExistingServer: false }
});
