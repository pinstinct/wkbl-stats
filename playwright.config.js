import { defineConfig } from "playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VENV_PYTHON = path.join(ROOT_DIR, ".venv", "bin", "python3");
const SERVER_ENTRY = path.join(ROOT_DIR, "server.py");
const serverPythonCmd = `if [ -x "${VENV_PYTHON}" ]; then HOST=127.0.0.1 SKIP_INGEST=1 "${VENV_PYTHON}" "${SERVER_ENTRY}"; else HOST=127.0.0.1 SKIP_INGEST=1 python3 "${SERVER_ENTRY}"; fi`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `/bin/zsh -lc '${serverPythonCmd}'`,
    cwd: ROOT_DIR,
    url: "http://127.0.0.1:8000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
