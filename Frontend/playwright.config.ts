import { defineConfig, devices } from "@playwright/test";

export const VIEWPORTS = [
  { name: "w1280", width: 1280, height: 620 },
  { name: "w1366", width: 1366, height: 768 },
  { name: "w1536", width: 1536, height: 730 },
  { name: "w1920", width: 1920, height: 1080 },
  { name: "w390", width: 390, height: 844 },
] as const;

const startServers = !!process.env.PW_START_SERVERS;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  use: {
    baseURL: "http://localhost:3000", // must be localhost: the backend CORS list has no 127.0.0.1
    trace: "retain-on-failure",
    reducedMotion: "reduce",
    permissions: ["camera", "microphone"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  projects: VIEWPORTS.map((v) => ({
    name: v.name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: v.width, height: v.height },
      ...(v.width < 500 ? { isMobile: true, hasTouch: true } : {}),
    },
  })),
  webServer: startServers
    ? [
        {
          command: "uv run uvicorn app.main:app --port 8000",
          cwd: "../Backend",
          url: "http://localhost:8000/docs",
          reuseExistingServer: true,
          timeout: 120_000,
          // SQLite file outside the tracked data/thos.db so e2e never dirties it.
          env: { THOS_DATABASE_PATH: "./data/e2e.db", THOS_SEED_DEMO_DATA: "true" },
        },
        { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 180_000 },
      ]
    : undefined,
});
