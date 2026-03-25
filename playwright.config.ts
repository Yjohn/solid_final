// playwright.config.ts  — place at project root alongside package.json

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Each test logs in separately — no globalSetup needed
  timeout:       120_000,   // 2 min per test (login + action + assertions)
  expect:        { timeout: 20_000 },

  fullyParallel: false,     // CSS pod state is shared — sequential only
  workers:       1,
  retries:       0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL:           'http://localhost:5173',
    headless:          false,        // must be false — OIDC redirects need real browser
    viewport:          { width: 1280, height: 800 },
    screenshot:        'on',         // screenshot every test
    video:             'retain-on-failure',
    trace:             'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],
});