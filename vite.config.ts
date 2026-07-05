import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  plugins: [
    // Installable PWA: precache the built JS/WASM/asset bundle for offline boot.
    // SW is production-only (devOptions.enabled:false) so `npm run dev` and the
    // desktop render path are untouched. Manifest is generated + linked here.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "LAAS — Procedural Survival World",
        short_name: "LAAS",
        description:
          "A fully procedural open world in the browser (WebGPU). Desktop-first, installable.",
        display: "standalone",
        orientation: "landscape",
        background_color: "#06080a",
        theme_color: "#06080a",
        start_url: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm}"],
        // the three.js/WebGPU bundle is ~1.1 MB — lift the 2 MB default ceiling
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4096,
  },
  server: {
    port: 5173,
    strictPort: true,
    // tool-driven file writes are missed by fsevents on this setup; poll so
    // the module graph never serves stale code (cost: dev-only CPU)
    watch: { usePolling: true, interval: 200 },
  },
  esbuild: {
    target: "esnext",
  },
  base: command === "build" ? "/minecraft3d/" : "/",
}));
