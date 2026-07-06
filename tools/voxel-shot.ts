/**
 * M8 voxel-terrain verification: boots ?voxel=1, digs programmatically via the
 * __laasDbg.voxels handle, screenshots the hole + cavern, then reloads to
 * prove the digs persisted (OPFS/IndexedDB round-trip).
 *
 * Usage: npm run dev (in another shell), then: npx tsx tools/voxel-shot.ts
 */

import { mkdirSync } from 'node:fs';
import { launchWebGPU, laasUrl } from './launch';

// default: the lightweight voxeldev proving ground (full LAAS world gen
// device-loses on some Windows/AMD combos); pass --scene world for the real
// terrain once the environment can run it (?voxel=1 is forwarded either way)
const SCENE = process.argv.includes('--scene')
  ? process.argv[process.argv.indexOf('--scene') + 1]
  : 'voxeldev';
const URL_OPTS = {
  scene: SCENE,
  seed: 1,
  hud: false,
  freeze: true,
  extra: { voxel: '1' },
};

async function main(): Promise<void> {
  mkdirSync('shots', { recursive: true });
  const { browser } = await launchWebGPU();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().startsWith('[voxel]')) {
      console.log(`[page:${msg.type()}] ${msg.text()}`);
    }
  });

  const url = laasUrl(URL_OPTS);
  console.log(`[voxel-shot] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__laas && (window.__laas.ready || window.__laas.error !== null),
    undefined,
    { timeout: 180000, polling: 250 },
  );
  const bootError = await page.evaluate(() => window.__laas.error);
  if (bootError) throw new Error(`boot failed: ${bootError}`);

  // dig a hole ahead of the walk spawn, then a deeper cavern pocket below it
  const dug = await page.evaluate(() => {
    const dbg = (
      window as unknown as {
        __laasDbg?: {
          engine?: {
            camera: { position: { x: number; y: number; z: number } };
            heightfield?: { heightAtCpu(x: number, z: number): number };
          };
          surface?: { heightAt(x: number, z: number): number };
          voxels?: {
            carveAt(x: number, y: number, z: number, r: number): void;
            flushSave(): void;
            group: { children: unknown[] };
          };
        };
      }
    ).__laasDbg;
    const engine = dbg?.engine;
    const voxels = dbg?.voxels;
    const heightAt = dbg?.surface
      ? (x: number, z: number) => dbg.surface!.heightAt(x, z)
      : engine?.heightfield
        ? (x: number, z: number) => engine.heightfield!.heightAtCpu(x, z)
        : null;
    if (!engine || !voxels || !heightAt) {
      return { ok: false as const, why: 'debug handles missing' };
    }
    const p = engine.camera.position;
    // voxeldev spawns facing -z (yaw 0); world spawn faces yaw −0.78 (+x,−z).
    // A target ~8 m ahead works for both framings.
    const tx = p.x + 1.5;
    const tz = p.z - 8;
    const g = heightAt(tx, tz);
    voxels.carveAt(tx, g - 0.6, tz, 2.2); // punch through the surface
    voxels.carveAt(tx + 1.2, g - 3.4, tz - 1.2, 2.6); // open the cavern below
    voxels.carveAt(tx + 2.8, g - 6.0, tz - 2.8, 2.6); // and deeper
    return { ok: true as const, chunkMeshes: voxels.group.children.length, ground: g };
  });
  console.log('[voxel-shot] dig:', JSON.stringify(dug));
  if (!dug.ok) throw new Error(dug.why);
  if (dug.chunkMeshes === 0) throw new Error('no chunk meshes after carving');

  await page.evaluate(async () => window.__laas.settle && (await window.__laas.settle(32)));
  await page.screenshot({ path: 'shots/voxel-dig.png' });
  console.log('[voxel-shot] wrote shots/voxel-dig.png');

  // persist, reload, and confirm the digs come back without re-carving
  await page.evaluate(() => {
    (
      window as unknown as { __laasDbg?: { voxels?: { flushSave(): void } } }
    ).__laasDbg?.voxels?.flushSave();
  });
  await page.waitForTimeout(800);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__laas && (window.__laas.ready || window.__laas.error !== null),
    undefined,
    { timeout: 180000, polling: 250 },
  );
  const reloadError = await page.evaluate(() => window.__laas.error);
  if (reloadError) throw new Error(`reload failed: ${reloadError}`);
  const restored = await page.evaluate(
    () =>
      (
        window as unknown as {
          __laasDbg?: { voxels?: { group: { children: unknown[] } } };
        }
      ).__laasDbg?.voxels?.group.children.length ?? 0,
  );
  console.log(`[voxel-shot] restored chunk meshes after reload: ${restored}`);
  if (restored === 0) throw new Error('digs did not survive the reload');

  await page.evaluate(async () => window.__laas.settle && (await window.__laas.settle(32)));
  await page.screenshot({ path: 'shots/voxel-dig-reloaded.png' });
  console.log('[voxel-shot] wrote shots/voxel-dig-reloaded.png');

  if (errors.length > 0) throw new Error(`page errors:\n${errors.join('\n')}`);
  await browser.close();
  console.log('[voxel-shot] OK — carve, mesh, hole, persist, reload all verified');
}

main().catch((e: unknown) => {
  console.error('[voxel-shot] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
