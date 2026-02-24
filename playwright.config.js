const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'PORT=5000 REQUIRE_API_AUTH=false node src/server.js',
      port: 5000,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI
    },
    {
      command: 'PORT=3000 BROWSER=none REACT_APP_API_BASE_URL=http://127.0.0.1:5000 npm start',
      port: 3000,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
