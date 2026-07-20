/**
 * Boot smoke test: drives the REAL no-flags player path (bare URL → main menu →
 * "Solo (offline)" → in-world), then asserts the player actually landed in
 * gameplay — engine reached ready, a canvas is present, and NO overlay/tooltip
 * is stuck visible. Regression guard for the "stacked overlays over a black
 * screen, Close does nothing" boot bug (a CSS `[hidden]` cascade defect the
 * happy-dom unit suite cannot see). Screenshots the result for eyeballing.
 *
 * Requires the dev server on :5173 (`npm run dev`) for the WebGPU secure
 * context, same as `shoot.ts`.
 *
 * Usage:  npm run dev   # in one terminal
 *         npx tsx tools/bootsmoke.ts [--out shots/bootsmoke.png]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { launchWebGPU } from './launch';

function parseOut(argv: string[]): string {
  const i = argv.indexOf('--out');
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : 'shots/bootsmoke.png';
}

async function main(): Promise<void> {
  const out = parseOut(process.argv.slice(2));
  const failures: string[] = [];
  const { browser } = await launchWebGPU();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // tsx/esbuild injects a `__name` helper into evaluate() bodies; shim it so
  // page-side arrow callbacks don't ReferenceError in the browser context.
  await page.addInitScript(() => {
    (globalThis as unknown as Record<string, unknown>).__name = (f: unknown) => f;
  });
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });

  // Menu mounts client-side; wait for the Solo button, then start a solo world.
  const started = await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) => /solo/i.test(b.textContent ?? '')),
      undefined,
      { timeout: 30000, polling: 200 },
    )
    .then(() =>
      page.evaluate(() => {
        const solo = [...document.querySelectorAll('button')].find((b) =>
          /solo/i.test(b.textContent ?? ''),
        );
        if (solo) {
          solo.click();
          return true;
        }
        return false;
      }),
    )
    .catch(() => false);
  if (!started) failures.push('never found/clicked a "Solo" button in the menu');

  // Engine must reach ready (fail-loud sets __laas.error on a fatal boot).
  const ready = await page
    .waitForFunction(() => window.__laas && (window.__laas.ready || window.__laas.error !== null), undefined, {
      timeout: 120000,
      polling: 300,
    })
    .then(() => page.evaluate(() => ({ ready: window.__laas.ready, error: window.__laas.error })))
    .catch(async () => ({
      ready: false,
      error: `timeout (last progress: ${await page.evaluate(() => window.__laas?.progressMsg ?? 'no hooks')})`,
    }));
  if (!ready.ready) failures.push(`engine never became ready: ${ready.error ?? 'unknown'}`);
  if (ready.error) failures.push(`engine reported fatal error: ${ready.error}`);

  // Let the first frames settle, then assert nothing is stuck over the world.
  await page.waitForTimeout(3000);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });

  const state = await page.evaluate(() => {
    const shown = (el: Element): boolean =>
      !(el as HTMLElement).hidden && getComputedStyle(el as HTMLElement).display !== 'none';
    const overlays = [...document.querySelectorAll('.lw-inv-overlay, [role="dialog"]')].filter(shown);
    const tooltips = [...document.querySelectorAll('[role="tooltip"], [class*="tooltip" i]')].filter(shown);
    const canvas = document.querySelector('canvas');
    return {
      strayOverlays: overlays.map((o) => (o as HTMLElement).className || o.getAttribute('aria-label') || 'dialog'),
      strayTooltips: tooltips.length,
      hasCanvas: !!canvas,
    };
  });
  if (!state.hasCanvas) failures.push('no <canvas> in the document after boot (world not mounted)');
  if (state.strayOverlays.length > 0)
    failures.push(`${state.strayOverlays.length} overlay(s) stuck visible in gameplay: ${state.strayOverlays.join(', ')}`);
  if (state.strayTooltips > 0) failures.push(`${state.strayTooltips} tooltip(s) stuck visible in gameplay`);

  await browser.close();

  if (failures.length > 0) {
    console.error(`[bootsmoke] FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`[bootsmoke] screenshot: ${out}`);
    process.exit(1);
  }
  console.log(`[bootsmoke] OK — reached gameplay, no stray overlays. screenshot: ${out}`);
}

main().catch((e: unknown) => {
  console.error('[bootsmoke] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
