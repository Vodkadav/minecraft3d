/**
 * Architecture enforcement for the *survival game* layers only
 * (`src/game/{domain,application,infrastructure,ui}`).
 *
 * The LAAS engine (src/core, src/render, src/gpu, src/world, src/sky,
 * src/vegetation, src/debug, src/main.ts) is a finished ~21k-line WebGPU
 * artifact and is intentionally NOT reshaped into this model — the game code
 * is additive and sits beside it. These rules keep the *new* code layered:
 *   domain ← application ← infrastructure ← ui   (top depends down, never up)
 */

const ENGINE = "^src/(core|render|gpu|world|sky|vegetation|debug)/|^src/main\\.ts$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "game-domain-is-pure",
      comment:
        "Game domain must depend on nothing but itself — no other game layer, no engine, no three.js.",
      severity: "error",
      from: { path: "^src/game/domain/" },
      to: {
        path: [
          "^src/game/(application|infrastructure|ui)/",
          "^three",
          ENGINE,
        ],
      },
    },
    {
      name: "game-application-no-downward",
      comment:
        "Application (use cases + ports) must not import infrastructure or ui — the composition root wires those in.",
      severity: "error",
      from: { path: "^src/game/application/" },
      to: { path: "^src/game/(infrastructure|ui)/" },
    },
    {
      name: "game-ui-no-infrastructure",
      comment:
        "UI consumes application ports + domain types only; concrete adapters are injected at the composition root.",
      severity: "error",
      from: { path: "^src/game/ui/" },
      to: { path: "^src/game/infrastructure/" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies are forbidden across the game layers.",
      severity: "error",
      from: { path: "^src/game/" },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".js"] },
  },
};
