import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Only the pure logic modules are unit tested. Route handlers and React
    // components need a database and a browser environment respectively, and
    // are covered by the type-checked build rather than by mocks that would
    // mostly assert the shape of the mocks.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json so tests import modules
    // exactly the way the app does.
    alias: { "@": resolve(__dirname, ".") },
  },
});
