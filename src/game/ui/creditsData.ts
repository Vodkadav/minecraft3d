/**
 * Credits data (Workstream 10.3) — curated from `package.json` (runtime
 * dependencies) and `CREDITS.md` (third-party assets/algorithms), read once
 * by hand rather than parsed at build time (both files are small and change
 * rarely; a parser would be more machinery than the content warrants).
 * Keep in sync when either source file changes.
 */

export interface CreditEntry {
  readonly name: string;
  readonly note: string;
  readonly url: string;
}

/** Mirrors `dependencies` in package.json — the tech the shipped game runs on. */
export const TECH_CREDITS: readonly CreditEntry[] = [
  { name: "three.js", note: "WebGPU/WebGL 3D engine", url: "https://threejs.org/" },
  { name: "trystero", note: "serverless peer-to-peer networking", url: "https://github.com/dmotz/trystero" },
  { name: "vite", note: "build tooling", url: "https://vite.dev/" },
];

/** Mirrors CREDITS.md — third-party assets and algorithms with provenance. */
export const ASSET_CREDITS: readonly CreditEntry[] = [
  {
    name: "Transvoxel algorithm",
    note: "Eric Lengyel — MIT-licensed voxel meshing tables",
    url: "https://transvoxel.org/",
  },
  {
    name: "Deer + Wolf models",
    note: "Quaternius, Ultimate Animated Animal Pack — CC0",
    url: "https://quaternius.com/packs/ultimateanimatedanimals.html",
  },
  {
    name: "Knight model",
    note: "Kay Lousberg, KayKit Adventurers Character Pack — CC0",
    url: "https://kaylousberg.itch.io/kaykit-adventurers",
  },
];
