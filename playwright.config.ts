import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  [
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].find(existsSync);
export default defineConfig({
  testDir: "./browser",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath, args: ["--no-sandbox"] },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node --use-env-proxy --import tsx server/index.ts",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    env: {
      HOST: "127.0.0.1",
      PORT: "4173",
      APP_ORIGIN: "http://127.0.0.1:4173",
      APP_PASSWORD: "",
      COOKIE_SECURE: "false",
      ENABLE_SCHEDULER: "false",
      DATABASE_PATH: join(tmpdir(), `hedgeway-browser-${Date.now()}.sqlite`),
      OPENAI_API_KEY: "",
      UPSTOX_ACCESS_TOKEN: "",
      KITE_API_KEY: "",
      KITE_API_SECRET: "",
    },
  },
});
