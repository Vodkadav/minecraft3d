import { defineConfig } from "vitest/config";

// Game-logic + pure voxel-math tests — renderer-free, node environment. The
// LAAS engine (src/core, src/render, src/gpu, ...) is GPU/WebGPU and stays
// under the tools/ harness for local runs; it is intentionally out of the unit
// scope. src/voxel is the M8 hybrid-terrain subsystem: its meshing math is
// pure TS and unit-tested; only its three.js adapter is GPU-side. src/gpu is
// included for the pure (TSL-free) helpers only, e.g. time-slice math.
// FlyCamera's walk-mode ground physics is the one src/core surface that's
// pure/renderer-free (three's PerspectiveCamera is plain math, no GPU) — its
// test opts into happy-dom per-file (`@vitest-environment` pragma) since it
// needs a DOM element/window for pointer-lock + key listeners.
export default defineConfig({
  test: {
    include: [
      "src/game/**/*.test.ts",
      "src/voxel/**/*.test.ts",
      "src/gpu/**/*.test.ts",
      "src/spawn/**/*.test.ts",
      "src/net/**/*.test.ts",
      "src/core/FlyCamera.test.ts",
    ],
    environment: "node",
    globals: false,
  },
});
