/**
 * Boot progress probe: boots a scene and prints every progress-message
 * transition until ready or fatal error — pinpoints WHERE a boot dies
 * (used to verify the M8 world-gen time-slicing fix on TDR-prone GPUs).
 *
 * Usage: npx tsx tools/boot-probe.ts [--scene world] [--preset high] [--timeout 300000]
 */

import { launchWebGPU, laasUrl } from './launch';

interface LaasHooks {
  ready: boolean;
  error: string | null;
  progress: number;
  progressMsg: string;
}

function str(v: string | undefined): string | undefined {
  return v;
}

async function main(): Promise<void> {
  const args = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith('--')) {
      args.set(a.slice(2), argv[i + 1] ?? '1');
      i++;
    }
  }
  const scene = str(args.get('scene')) ?? 'world';
  const timeoutMs = Number(args.get('timeout') ?? 300000);

  const { browser } = await launchWebGPU();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('[laas]') || msg.type() === 'error') {
      console.log(`[page:${msg.type()}] ${t.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => console.error('[pageerror]', err.message.slice(0, 300)));

  const urlOpts: Parameters<typeof laasUrl>[0] = { scene };
  const preset = str(args.get('preset'));
  if (preset) urlOpts.preset = preset;
  const url = laasUrl(urlOpts);
  console.log(`[probe] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const t0 = Date.now();
  let lastMsg = '';
  for (;;) {
    if (Date.now() - t0 > timeoutMs) {
      console.error(`[probe] TIMEOUT after ${timeoutMs} ms — last: ${lastMsg}`);
      process.exitCode = 1;
      break;
    }
    const s = await page
      .evaluate(() => {
        const h = (window as unknown as { __laas?: LaasHooks }).__laas;
        return h
          ? { ready: h.ready, error: h.error, progress: h.progress, msg: h.progressMsg }
          : null;
      })
      .catch(() => null);
    if (s) {
      const line = `${(s.progress * 100).toFixed(0).padStart(3)}%  ${s.msg}`;
      if (line !== lastMsg) {
        console.log(`[probe] +${((Date.now() - t0) / 1000).toFixed(1)}s  ${line}`);
        lastMsg = line;
      }
      if (s.error) {
        console.error(`[probe] FATAL: ${s.error.slice(0, 500)}`);
        process.exitCode = 1;
        break;
      }
      if (s.ready) {
        console.log(`[probe] READY in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await browser.close();
}

main().catch((e: unknown) => {
  console.error('[probe] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
