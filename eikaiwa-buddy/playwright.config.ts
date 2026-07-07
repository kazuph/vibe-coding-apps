import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const goodFixture = path.resolve("fixtures/hello-good.wav");

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8802",
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
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8802",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
