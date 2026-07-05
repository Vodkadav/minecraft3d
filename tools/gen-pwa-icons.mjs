// Generates the PWA icon set from an inline SVG (no binary assets checked in by
// hand). Run: node tools/gen-pwa-icons.mjs  → writes public/icons/*.png
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT = new URL("../public/icons/", import.meta.url);

// A procedural-terrain motif: horizon + ridgeline in the boot palette.
function svg({ pad }) {
  const s = 512;
  const m = Math.round(s * pad); // safe-area padding for maskable
  const inner = s - m * 2;
  const y = (v) => m + inner * v;
  const x = (v) => m + inner * v;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#06080a"/>
  <rect x="${m}" y="${m}" width="${inner}" height="${inner}" rx="${Math.round(inner * 0.14)}" fill="#0b1512"/>
  <path d="M ${x(0)} ${y(1)} L ${x(0.28)} ${y(0.5)} L ${x(0.46)} ${y(0.72)} L ${x(0.68)} ${y(0.34)} L ${x(1)} ${y(1)} Z" fill="#5fae8f"/>
  <circle cx="${x(0.76)}" cy="${y(0.26)}" r="${inner * 0.08}" fill="#c8d8d0"/>
</svg>`;
}

await mkdir(OUT, { recursive: true });
const render = (name, size, pad) =>
  sharp(Buffer.from(svg({ pad })))
    .resize(size, size)
    .png()
    .toFile(new URL(name, OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

await render("icon-192.png", 192, 0.06);
await render("icon-512.png", 512, 0.06);
await render("icon-maskable-512.png", 512, 0.18);
console.log("wrote public/icons/{icon-192,icon-512,icon-maskable-512}.png");
