import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const goodFixture = path.resolve("fixtures/hello-good.wav");
const port = Number(process.env.E2E_PORT ?? 18802);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const webServer = process.env.E2E_BASE_URL ? undefined : {
  command: `mkdir -p /tmp/eikaiwa-wrangler-home /tmp/eikaiwa-xdg && HOME=/tmp/eikaiwa-wrangler-home XDG_CONFIG_HOME=/tmp/eikaiwa-xdg npx wrangler dev --local --port ${port} --live-reload=false --show-interactive-dev-session=false --log-level warn`,
  url: baseURL,
  reuseExistingServer: false,
  timeout: 120_000
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${goodFixture}`
      ]
    }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"], channel: "chrome", viewport: { width: 375, height: 812 } } }
  ],
  webServer
});
