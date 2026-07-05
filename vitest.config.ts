import { defineConfig } from "vitest/config";

// Game-logic tests only — renderer-free, node environment. The LAAS engine
// (src/core, src/render, src/gpu, ...) is GPU/WebGPU and stays under the
// tools/ harness for local runs; it is intentionally out of the unit scope.
export default defineConfig({
  test: {
    include: ["src/game/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
