import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, retries: 0,
  use: { baseURL: 'http://localhost:3100', browserName: 'chromium', launchOptions: { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/e2e-server.js', url: 'http://localhost:3100/api/health', reuseExistingServer: false }
});
