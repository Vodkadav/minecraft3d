/**
 * Boot-time compute time-slicing — the M8 world-gen device-loss fix.
 *
 * The Windows TDR GPU watchdog kills any submission the hardware can't
 * preempt within ~2 s; the gen-time mega-dispatches (16.8M-thread macro
 * synthesis, multi-million-thread scatter, the 260-step flow trace) exceed it
 * on mid GPUs and the whole device is lost mid-boot. Render presets can't
 * help — they cut raster cost, not this compute burst.
 *
 * Fix, mirroring ProbeGI's per-frame probe budget: every heavy kernel runs as
 * bounded slices (a uint uniform offsets instanceIndex; the guard clamps the
 * tail), and a device fence between submissions keeps the queue at one
 * command buffer so the watchdog always sees preemptible progress. This also
 * carries low-end/mobile devices — the same budgets, just more slices.
 */

import { Fn, If, Return, instanceIndex, uniform } from 'three/tsl';
import type { ComputeNode, Renderer } from 'three/webgpu';
import { uint } from 'three/tsl';
import type { NU } from './TSLTypes';
import { sliceSpans } from './SliceMath';

/** Threads/submission for heavy-per-thread kernels (macro synthesis, biome). */
export const SYNTH_SLICE = 1 << 20;
/** Scatter kernels are fatter (multi-texture site sampling + clump fields). */
export const SCATTER_SLICE = 1 << 16;
/** The flow trace marches up to 260 steps × 4 bilinear reads per thread. */
export const TRACE_SLICE = 1 << 17;

/**
 * Await true GPU completion of everything submitted so far. computeAsync only
 * encodes + submits — without a fence the whole gen pipeline queues up with
 * zero backpressure and the boot UI never paints.
 */
export async function gpuFence(renderer: Renderer): Promise<void> {
  const device = (renderer.backend as unknown as { device?: GPUDevice }).device;
  if (device) await device.queue.onSubmittedWorkDone();
}

export interface SlicedKernel {
  /** Run all slices, fencing between submissions. */
  run(renderer: Renderer, onSlice?: (done: number, total: number) => void): Promise<void>;
}

/**
 * Build a compute kernel dispatched in bounded slices. `body` receives the
 * GLOBAL thread index (slice base + local instanceIndex); the out-of-range
 * guard is applied here — bodies must not re-guard.
 */
export function slicedCompute(
  total: number,
  slice: number,
  name: string,
  body: (i: NU) => void,
): SlicedKernel {
  const base = uniform(uint(0));
  const node: ComputeNode = Fn(() => {
    const i = instanceIndex.add(base) as NU;
    If(i.greaterThanEqual(uint(total)), () => {
      Return();
    });
    body(i);
  })().compute(Math.min(slice, total));
  node.setName(name);
  const spans = sliceSpans(total, slice);
  return {
    async run(renderer, onSlice) {
      for (const s of spans) {
        base.value = s.base;
        await renderer.computeAsync(node);
        await gpuFence(renderer);
        onSlice?.(s.base + s.count, total);
      }
    },
  };
}
