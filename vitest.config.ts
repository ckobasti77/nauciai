import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Matches the "@/*" path alias in tsconfig, so a tested module can import the way the
  // rest of the codebase does instead of dropping to a relative path to stay testable.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "edge-runtime",
    include: ["app/**/*.test.ts", "convex/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
