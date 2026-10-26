import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"

const port = 4331
const origin = `http://127.0.0.1:${port}`
// A fresh database per run: the suite relies on its first account becoming admin.
const data = join(tmpdir(), `fresh-playground-e2e-${Date.now()}`)

/** Runs against the production build (`npm run build`), which also serves the service worker. */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  outputDir: "../test-results",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]]
    : "list",
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    cwd: "..",
    url: `${origin}/health/ready`,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      LOG_LEVEL: "Warn",
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-any-deployment-123456",
      DATABASE_PATH: join(data, "app.db"),
      STORAGE_PATH: join(data, "uploads"),
      MAIL_TRANSPORT: "disabled",
      AUTH_MAGIC_LINK: "false",
    },
  },
})
