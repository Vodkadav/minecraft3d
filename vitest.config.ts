import { defineConfig } from "vitest/config";

// Game-logic + pure voxel-math tests — renderer-free, node environment. The
// LAAS engine (src/core, src/render, src/gpu, ...) is GPU/WebGPU and stays
// under the tools/ harness for local runs; it is intentionally out of the unit
// scope. src/voxel is the M8 hybrid-terrain subsystem: its meshing math is
// pure TS and unit-tested; only its three.js adapter is GPU-side.
export default defineConfig({
  test: {
    include: ["src/game/**/*.test.ts", "src/voxel/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
