import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "json"],
      include: ["src/**/*.js"],
      exclude: [
        "src/**/*.test.js",
        "src/**/*.global.js",
        "src/vendor/**",
        "src/ui/index.js",
        "src/views/index.js",
      ],
      thresholds: {
        lines: 95,
      },
    },
  },
});
