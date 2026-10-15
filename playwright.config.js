import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1, // each spec starts and stops the one test server on 4213
  globalSetup: './e2e/global-setup.js',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4213', viewport: { width: 1400, height: 900 }, video: 'retain-on-failure' },
});
