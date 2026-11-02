import { defineConfig } from "vitest/config";

// Unit tests only. End-to-end tests run with Playwright (see playwright.config.js).
export default defineConfig({
  test: { include: ["tests/unit/**/*.test.js"], environment: "node" },
});
