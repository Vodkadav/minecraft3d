/**
 * M7.4 acceptance probe: two browser contexts, one hosted world, join by
 * room code, mutual avatar visibility.
 *
 *   A: menu → Solo → READY → read the room-code badge
 *   B: menu → Online → enter code → join → READY
 *   Assert: B booted with A's seed; each side sees one remote avatar.
 *
 * Creature sync (ADR 0003): B mirrors A's host-streamed creatures; a host kill
 * despawns on B; a joiner attack intent kills on the host. Driven through the
 * exposed spawn-field handle (__laasDbg.spawnField) so no input simulation.
 *
 * Timings are generous by design: trystero connects over public Nostr rails
 * (5–20 s) and the world scene takes ~45–75 s to boot on this box. The first
 * page load warms vite's dep optimizer (it reloads on first import of a new
 * dep), so a throwaway warmup page runs before the real contexts.
 *
 * Usage: npx tsx tools/net-probe.ts [--timeout 300000]
 */

import type { Page } from 'playwright';
import { launchWebGPU } from './launch';

const BASE_URL = 'http://localhost:5173/';
const BOOT_TIMEOUT_MS = Number(
  process.argv[process.argv.indexOf('--timeout') + 1] ?? NaN,
) || 300_000;
const AVATAR_TIMEOUT_MS = 60_000;

interface ProbeState {
  ready: boolean;
  error: string | null;
  progress: number;
  msg: string;
  seed: number | null;
}

function tapConsole(page: Page, tag: string): void {
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('[laas]') || t.startsWith('[net]') || msg.type() === 'error') {
      console.log(`[${tag}:${msg.type()}] ${t.slice(0, 240)}`);
    }
  });
  page.on('pageerror', (err) => console.error(`[${tag}:pageerror]`, err.message.slice(0, 240)));
}

async function readState(page: Page): Promise<ProbeState | null> {
  return page
    .evaluate(() => {
      const w = window as unknown as {
        __laas?: { ready: boolean; error: string | null; progress: number; progressMsg: string };
        __laasSeed?: number;
      };
      return w.__laas
        ? {
            ready: w.__laas.ready,
            error: w.__laas.error,
            progress: w.__laas.progress,
            msg: w.__laas.progressMsg,
            seed: w.__laasSeed ?? null,
          }
        : null;
    })
    .catch(() => null);
}

async function waitReady(page: Page, tag: string, timeoutMs: number): Promise<ProbeState> {
  const t0 = Date.now();
  let last = '';
  for (;;) {
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`${tag}: TIMEOUT after ${timeoutMs} ms (last: ${last})`);
    }
    const s = await readState(page);
    if (s) {
      const line = `${(s.progress * 100).toFixed(0)}% ${s.msg}`;
      if (line !== last) {
        console.log(`[${tag}] +${((Date.now() - t0) / 1000).toFixed(1)}s  ${line}`);
        last = line;
      }
      if (s.error) throw new Error(`${tag}: FATAL: ${s.error.slice(0, 400)}`);
      if (s.ready) return s;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function remoteAvatarCount(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const dbg = (window as unknown as { __laasDbg?: { engine?: unknown } }).__laasDbg;
      const engine = dbg?.engine as
        | { scene?: { getObjectByName(n: string): { children: unknown[] } | undefined } }
        | undefined;
      return engine?.scene?.getObjectByName('remote-players')?.children.length ?? 0;
    })
    .catch(() => 0);
}

async function waitForAvatar(page: Page, tag: string): Promise<number> {
  const t0 = Date.now();
  for (;;) {
    const n = await remoteAvatarCount(page);
    if (n >= 1) {
      console.log(`[${tag}] remote avatars: ${n} (+${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      return n;
    }
    if (Date.now() - t0 > AVATAR_TIMEOUT_MS) {
      throw new Error(`${tag}: no remote avatar after ${AVATAR_TIMEOUT_MS} ms`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function creatureIds(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const sf = (window as unknown as { __laasDbg?: { spawnField?: { creatureIds: string[] } } })
        .__laasDbg?.spawnField;
      return sf ? [...sf.creatureIds] : [];
    })
    .catch(() => []);
}

/** Poll until a creature id present on A is also mirrored on B (or time out). */
async function waitSharedCreature(a: Page, b: Page): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    const [ia, ib] = await Promise.all([creatureIds(a), creatureIds(b)]);
    const shared = ia.find((id) => ib.includes(id));
    if (shared) {
      console.log(`[probe] shared creature ${shared} (A=${ia.length} B=${ib.length})`);
      return shared;
    }
    if (Date.now() - t0 > 30_000) {
      throw new Error(`no shared creature after 30s (A=${ia.length} B=${ib.length})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Fire N attacks at `id` through `page`'s spawn-field handle (host or joiner). */
async function attack(page: Page, id: string, via: 'applyInteract' | 'onInteractIntent'): Promise<void> {
  await page.evaluate(
    ({ id, via }) => {
      const sf = (
        window as unknown as {
          __laasDbg?: {
            spawnField?: {
              applyInteract(a: string, t: string): void;
              onInteractIntent?: ((a: string, t: string) => void) | null;
            };
          };
        }
      ).__laasDbg?.spawnField;
      if (!sf) return;
      for (let i = 0; i < 24; i++) {
        if (via === 'applyInteract') sf.applyInteract('attack', id);
        else sf.onInteractIntent?.('attack', id);
      }
    },
    { id, via },
  );
}

/** B sends a mount intent for a WILD (untamed) shared creature over the real
 *  wire — cheaply proves the mount/dismount plumbing round-trips (Protocol →
 *  HostSession → SpawnFieldView) without needing a live multi-feed tame
 *  sequence. The host must reject it (not tamed), so A's riddenIds stays
 *  empty (ADR 0003 addendum). */
async function mountIntent(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const sf = (
      window as unknown as {
        __laasDbg?: { spawnField?: { onInteractIntent?: ((a: string, t: string) => void) | null } };
      }
    ).__laasDbg?.spawnField;
    sf?.onInteractIntent?.('mount', id);
  }, id);
}

async function riddenIds(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const sf = (window as unknown as { __laasDbg?: { spawnField?: { riddenIds: string[] } } })
        .__laasDbg?.spawnField;
      return sf ? [...sf.riddenIds] : [];
    })
    .catch(() => []);
}

async function dyingIds(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const sf = (window as unknown as { __laasDbg?: { spawnField?: { dyingIds: string[] } } })
        .__laasDbg?.spawnField;
      return sf ? [...sf.dyingIds] : [];
    })
    .catch(() => []);
}

/** Poll until `id` is absent from BOTH sides' creature sets (host death-clip lag).
 *  Also asserts the joiner (B) played the death clip — i.e. it saw `id` in
 *  `dyingIds` at some point before the id was fully removed — so a kill isn't
 *  just an instant vanish on the joiner (ADR 0003 follow-up). */
async function waitGone(a: Page, b: Page, id: string, label: string): Promise<void> {
  const t0 = Date.now();
  let sawDyingOnB = false;
  for (;;) {
    const [ia, ib, dyingB] = await Promise.all([creatureIds(a), creatureIds(b), dyingIds(b)]);
    if (dyingB.includes(id)) sawDyingOnB = true;
    if (!ia.includes(id) && !ib.includes(id)) {
      console.log(`[probe] PASS ${label}: ${id} despawned on both (+${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      if (!sawDyingOnB) {
        throw new Error(`${label}: ${id} vanished on B without ever playing the death clip`);
      }
      console.log(`[probe] PASS ${label}-death-clip: B played the death clip before ${id} was removed`);
      return;
    }
    if (Date.now() - t0 > 15_000) {
      throw new Error(`${label}: ${id} still present after 15s (A=${ia.includes(id)} B=${ib.includes(id)})`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  const { browser } = await launchWebGPU();

  // vite dep-optimization warmup — a fresh dep import reloads the page once
  console.log('[probe] warming up vite');
  const warm = await browser.newPage();
  await warm.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await warm.waitForTimeout(8000);
  await warm.close();

  // ---- context A: host a Solo world ----
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pageA = await ctxA.newPage();
  tapConsole(pageA, 'A');
  await pageA.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  // aria-label overrides the accessible name — match on the visible text
  await pageA.locator('button:has-text("Solo")').click({ timeout: 60_000 });
  console.log('[probe] A: Solo clicked, booting…');
  const tBootA = Date.now();
  const stateA = await waitReady(pageA, 'A', BOOT_TIMEOUT_MS);
  console.log(`[probe] A READY in ${((Date.now() - tBootA) / 1000).toFixed(1)}s`);

  const code = (
    await pageA.locator('#laas-room-code').textContent({ timeout: 15_000 })
  )?.trim();
  if (!code) throw new Error('A: no room-code badge');
  console.log(`[probe] A: room code ${code}, seed ${stateA.seed}`);

  // ---- context B: join by code ----
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pageB = await ctxB.newPage();
  tapConsole(pageB, 'B');
  await pageB.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await pageB.locator('button:has-text("Online")').click({ timeout: 60_000 });
  await pageB.locator('.laas-code-input').fill(code, { timeout: 30_000 });
  const tJoin = Date.now();
  await pageB.locator('button:has-text("Join with code")').click();
  console.log('[probe] B: join clicked (welcome + boot may take minutes)…');
  // B shares the GPU with A's live render loop — its boot runs several times
  // slower than a lone boot (impostor captures especially), so double up
  const stateB = await waitReady(pageB, 'B', BOOT_TIMEOUT_MS * 2 + 60_000);
  console.log(`[probe] B READY in ${((Date.now() - tJoin) / 1000).toFixed(1)}s after join click`);

  // ---- assertions ----
  const failures: string[] = [];
  if (stateB.seed !== stateA.seed) {
    failures.push(`seed mismatch: A=${stateA.seed} B=${stateB.seed}`);
  } else {
    console.log(`[probe] PASS seed: B booted with A's seed (${stateA.seed})`);
  }

  try {
    await waitForAvatar(pageB, 'B');
    console.log('[probe] PASS avatar: B sees the host');
  } catch (e) {
    failures.push(String(e instanceof Error ? e.message : e));
  }
  try {
    await waitForAvatar(pageA, 'A');
    console.log('[probe] PASS avatar: A sees the joiner');
  } catch (e) {
    failures.push(String(e instanceof Error ? e.message : e));
  }

  // ---- creature sync (ADR 0003) ----
  try {
    // host kills one of its creatures → despawns on A (after its death clip)
    // and on B (dropped from the stream)
    const hostTarget = await waitSharedCreature(pageA, pageB);
    await attack(pageA, hostTarget, 'applyInteract');
    await waitGone(pageA, pageB, hostTarget, 'host-kill');

    // B fires an attack intent → the host resolves it, the kill streams back
    const joinTarget = await waitSharedCreature(pageA, pageB);
    await attack(pageB, joinTarget, 'onInteractIntent');
    await waitGone(pageA, pageB, joinTarget, 'joiner-intent-kill');
  } catch (e) {
    failures.push(String(e instanceof Error ? e.message : e));
  }

  // ---- joiner mounting wiring (ADR 0003 addendum) ----
  try {
    const mountTarget = await waitSharedCreature(pageA, pageB);
    await mountIntent(pageB, mountTarget);
    await new Promise((r) => setTimeout(r, 500)); // let the intent round-trip
    const ridden = await riddenIds(pageA);
    if (ridden.includes(mountTarget)) {
      throw new Error(`mount-reject: host let B ride an untamed creature (${mountTarget})`);
    }
    console.log('[probe] PASS mount-reject: host rejected an untamed mount intent');
  } catch (e) {
    failures.push(String(e instanceof Error ? e.message : e));
  }

  await browser.close();
  const total = ((Date.now() - started) / 1000).toFixed(1);
  if (failures.length > 0) {
    for (const f of failures) console.error(`[probe] FAIL ${f}`);
    console.error(`[probe] FAIL after ${total}s`);
    process.exit(1);
  }
  console.log(`[probe] PASS — host+join+mutual avatars in ${total}s`);
}

main().catch((e: unknown) => {
  console.error('[probe] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
