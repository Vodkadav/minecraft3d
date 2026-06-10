/**
 * Hydrology pass: depression fill → flow accumulation → river carve → lakes
 * → moisture field. Runs on the sim grid after erosion.
 *
 * 1. FILL: iterative priority-flood relaxation — W converges to the filled
 *    DEM (every cell drains to the border via an ε-sloped path). Lakes are
 *    where W − H > δ.
 * 2. ACCUMULATION: particle tracing — rain particles descend the filled DEM
 *    via steepest descent, atomicAdd into a u32 accumulation grid.
 * 3. RIVERS: cells with accumulation above a threshold form the river
 *    network; carve a channel into H proportional to log(accum) and record
 *    water surface + flow direction for rendering/Phase-6 streams.
 * 4. MOISTURE: separable blur of (water presence + erosion wetness),
 *    distance-faded — drives biome classification and vegetation density.
 */

import type { ComputeNode, Renderer, StorageBufferNode } from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  Return,
  atomicAdd,
  atomicLoad,
  atomicStore,
  clamp,
  float,
  instanceIndex,
  instancedArray,
  max,
  min,
  smoothstep,
  uint,
  vec2,
} from 'three/tsl';
import { valleyFields, type MacroParams } from '../../world/MacroMap';
import { WORLD_SIZE } from '../../world/WorldConst';
import { bilerpFloatBuffer } from '../BufferSample';
import { hash12 } from '../noise/NoiseTSL';
import type { NB, NF, NI, NU } from '../TSLTypes';
import type { FloatBuffer } from './HeightSynthesis';

export type Vec2Buffer = StorageBufferNode<'vec2'>;

export interface FlowResult {
  /** filled water surface W (≥ H); lakes where W−H > δ */
  waterSurface: FloatBuffer;
  /** log-scaled flow accumulation 0..~1 */
  flowStrength: FloatBuffer;
  /** river water depth (m) at river cells, 0 elsewhere */
  riverDepth: FloatBuffer;
  /** flow direction (unit-ish vec2 per cell) */
  flowDir: Vec2Buffer;
  /** moisture 0..1 */
  moisture: FloatBuffer;
}

export interface FlowOpts {
  res: number;
  texel: number;
  seed: number;
  /** designed carving splines — enforced through erosion-deposited dams */
  mp: MacroParams;
  fillIters?: number;
  particles?: number;
  onProgress?: (msg: string, frac: number) => void;
}

/** open water requires real depth — shallow filled bowls become marsh, not ponds */
const LAKE_DELTA = 2.2;
const MARSH_DELTA = 0.15;

export async function runFlowRivers(
  renderer: Renderer,
  height: FloatBuffer,
  erosionWater: FloatBuffer,
  opts: FlowOpts,
): Promise<FlowResult> {
  const { res, seed } = opts;
  const N = res * res;
  const fillIters = opts.fillIters ?? 700;
  const particles = opts.particles ?? 3_000_000;

  const wA = instancedArray(N, 'float');
  const wB = instancedArray(N, 'float');
  const accumU = instancedArray(N, 'uint').toAtomic();
  const flowStrength = instancedArray(N, 'float');
  const riverDepth = instancedArray(N, 'float');
  const flowDir = instancedArray(N, 'vec2');
  const moistA = instancedArray(N, 'float');
  const moistB = instancedArray(N, 'float');

  const guard = (body: () => void) =>
    Fn<void>(() => {
      If(instanceIndex.greaterThanEqual(N), () => {
        Return();
      });
      body();
    });
  const cellXY = (): { x: NI; y: NI; i: NI } => {
    const i = instanceIndex.toInt();
    return { x: i.mod(res), y: i.div(res), i };
  };
  const at = (x: NI, y: NI, ox: number, oy: number): NI => {
    const cx = clamp(float(x).add(ox), 0, res - 1).toInt();
    const cy = clamp(float(y).add(oy), 0, res - 1).toInt();
    return cy.mul(res).add(cx);
  };
  const OFFS: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ];

  // --- 1. depression fill (multigrid: relaxation propagates ~1 cell/iter,
  //        so converge coarse first, then refine) -----------------------------
  const initMisc = guard(() => {
    const { i } = cellXY();
    moistA.element(i).assign(0);
    atomicStore(accumU.element(i), uint(0));
    flowStrength.element(i).assign(0);
    riverDepth.element(i).assign(0);
    flowDir.element(i).assign(vec2(0));
  })().compute(N);
  initMisc.setName('flowInitMisc');

  // ENFORCE the designed channels BEFORE the fill: erosion deposits bars/dams
  // across the trench (real rivers keep their channels open by continuous
  // flow we don't simulate). The macro spline floor is authoritative.
  const enforceK = guard(() => {
    const { x, y, i } = cellXY();
    const wpos = vec2(float(x).add(0.5), float(y).add(0.5))
      .div(res)
      .sub(0.5)
      .mul(WORLD_SIZE);
    const vf = valleyFields(wpos, opts.mp);
    // fade enforcement across the lake exactly like the synthesis trench,
    // otherwise we'd cut the outlet sill and drain the lake
    const dLake = wpos.sub(vec2(opts.mp.lakeC[0], opts.mp.lakeC[1])).length();
    const tLake = smoothstep(opts.mp.lakeR, opts.mp.lakeR * 0.25, dLake);
    const trenchFade = smoothstep(0.5, 0.12, tLake);
    const mainCore = vf.valleyDist.lessThan(22);
    const tribCore = vf.tribDist.lessThan(9);
    const enforced = min(
      mainCore.select(vf.valleyFloor.sub(float(15.2).mul(trenchFade)), float(1e9)),
      tribCore.select(vf.tribFloor.add(0.4), float(1e9)),
    );
    height.element(i).assign(min(height.element(i), enforced));
  })().compute(N);
  enforceK.setName('channelEnforce');
  await renderer.computeAsync([initMisc, enforceK]);

  interface FillLevel {
    res: number;
    iters: number;
    h: FloatBuffer;
    wA: FloatBuffer;
    wB: FloatBuffer;
  }
  const levels: FillLevel[] = [];
  {
    // coarse levels are nearly free — converge hard there so only local
    // refinement remains at fine levels (relaxation moves ~1 cell/iter)
    const specs = [
      { res: res >> 3, iters: 3000 },
      { res: res >> 2, iters: 1300 },
      { res: res >> 1, iters: 700 },
      { res, iters: Math.max(700, fillIters) },
    ];
    for (const s of specs) {
      levels.push({
        res: s.res,
        iters: s.iters,
        h: s.res === res ? height : instancedArray(s.res * s.res, 'float'),
        wA: s.res === res ? wA : instancedArray(s.res * s.res, 'float'),
        wB: s.res === res ? wB : instancedArray(s.res * s.res, 'float'),
      });
    }
  }

  const lvlHelpers = (lres: number) => ({
    xy: () => {
      const i = instanceIndex.toInt();
      return { x: i.mod(lres), y: i.div(lres), i };
    },
    at: (x: NI, y: NI, ox: number, oy: number): NI => {
      const cx = clamp(float(x).add(ox), 0, lres - 1).toInt();
      const cy = clamp(float(y).add(oy), 0, lres - 1).toInt();
      return cy.mul(lres).add(cx);
    },
    border: (x: NI, y: NI): NB =>
      float(x)
        .lessThan(1)
        .or(float(x).greaterThan(lres - 2))
        .or(float(y).lessThan(1))
        .or(float(y).greaterThan(lres - 2)),
    guard: (body: () => void) =>
      Fn<void>(() => {
        If(instanceIndex.greaterThanEqual(lres * lres), () => {
          Return();
        });
        body();
      }),
  });

  // min-downsample height pyramid (min preserves drainage channels)
  for (let li = levels.length - 2; li >= 0; li--) {
    const fine = levels[li + 1] as FillLevel;
    const coarse = levels[li] as FillLevel;
    const H = lvlHelpers(coarse.res);
    const k = H.guard(() => {
      const { x, y, i } = H.xy();
      const fx = float(x).mul(2).toInt();
      const fy = float(y).mul(2).toInt();
      const fres = fine.res;
      const i00 = fy.mul(fres).add(fx);
      const i10 = fy.mul(fres).add(clamp(float(fx).add(1), 0, fres - 1).toInt());
      const i01 = clamp(float(fy).add(1), 0, fres - 1).toInt().mul(fres).add(fx);
      const i11 = clamp(float(fy).add(1), 0, fres - 1)
        .toInt()
        .mul(fres)
        .add(clamp(float(fx).add(1), 0, fres - 1).toInt());
      coarse.h
        .element(i)
        .assign(
          min(min(fine.h.element(i00), fine.h.element(i10)), min(fine.h.element(i01), fine.h.element(i11))),
        );
    })().compute(coarse.res * coarse.res);
    k.setName(`fillDown_${coarse.res}`);
    await renderer.computeAsync(k);
  }

  // relax each level, seeding W from the coarser solution
  for (let li = 0; li < levels.length; li++) {
    const lvl = levels[li] as FillLevel;
    const H = lvlHelpers(lvl.res);
    const coarser = li > 0 ? (levels[li - 1] as FillLevel) : null;

    const initW = H.guard(() => {
      const { x, y, i } = H.xy();
      const h = lvl.h.element(i).toVar();
      let start: NF;
      if (coarser) {
        const g = vec2(float(x).add(0.5), float(y).add(0.5))
          .div(lvl.res)
          .mul(coarser.res)
          .sub(0.5);
        start = max(h, bilerpFloatBuffer(coarser.wA, coarser.res, g));
      } else {
        start = h.add(4000);
      }
      const w0 = H.border(x, y).select(h, start);
      lvl.wA.element(i).assign(w0);
      lvl.wB.element(i).assign(w0);
    })().compute(lvl.res * lvl.res);
    initW.setName(`fillInit_${lvl.res}`);
    await renderer.computeAsync(initW);

    const mkStep = (src: FloatBuffer, dst: FloatBuffer): ComputeNode => {
      const k = H.guard(() => {
        const { x, y, i } = H.xy();
        const h = lvl.h.element(i).toVar();
        If(H.border(x, y), () => {
          dst.element(i).assign(h);
          Return();
        });
        let lowest: NF = float(1e9);
        for (const [ox, oy] of OFFS) {
          // small ε keeps flats draining; large ε visibly tilts lake surfaces
          const eps = 0.0045 * Math.hypot(ox, oy);
          lowest = min(lowest, src.element(H.at(x, y, ox, oy)).add(eps));
        }
        dst.element(i).assign(max(h, min(src.element(i), lowest)));
      })().compute(lvl.res * lvl.res);
      k.setName(`fillStep_${lvl.res}`);
      return k;
    };
    const stepAB = mkStep(lvl.wA, lvl.wB);
    const stepBA = mkStep(lvl.wB, lvl.wA);

    const BATCH = 32;
    for (let it = 0; it < lvl.iters; it += BATCH) {
      const nodes: ComputeNode[] = [];
      for (let k = 0; k < Math.min(BATCH, lvl.iters - it); k++) {
        nodes.push((it + k) % 2 === 0 ? stepAB : stepBA);
      }
      await renderer.computeAsync(nodes);
      opts.onProgress?.(
        `hydrology: filling depressions (${lvl.res}²)`,
        (li + it / lvl.iters) / levels.length,
      );
    }
    // ensure result is in wA for the next level's seed
    if (lvl.iters % 2 === 1) {
      const copyK = H.guard(() => {
        const { i } = H.xy();
        lvl.wA.element(i).assign(lvl.wB.element(i));
      })().compute(lvl.res * lvl.res);
      await renderer.computeAsync(copyK);
    }
  }
  const W = wA;

  // --- 2. flow accumulation by particle tracing -------------------------------
  const STEPS = 260;
  const traceK = Fn<void>(() => {
    If(instanceIndex.greaterThanEqual(particles), () => {
      Return();
    });
    const pid = instanceIndex.toFloat();
    // jittered-grid spawn (decorrelated, full coverage)
    const cells = float(N);
    const spawn = pid.mul(cells.div(particles)).floor().toVar();
    const jx = hash12(vec2(pid, seed % 1000)).toVar();
    const jy = hash12(vec2(pid.add(0.5), (seed >> 8) % 1000)).toVar();
    const px = spawn.mod(res).add(jx).toVar();
    const py = spawn.div(res).floor().add(jy).toVar();

    // steepest-descent walk on the filled DEM (runtime loop — not unrolled)
    Loop(STEPS, () => {
      const xi = clamp(px, 1, res - 2).toInt();
      const yi = clamp(py, 1, res - 2).toInt();
      const i = yi.mul(res).add(xi);
      atomicAdd(accumU.element(i), uint(1));
      const wHere = W.element(i).toVar();
      // pick lowest of 8 neighbors (unrolled fold)
      let bestDrop: NF = float(-1e9);
      let bx: NF = float(0);
      let by: NF = float(0);
      for (const [ox, oy] of OFFS) {
        const wn = W.element(at(xi, yi, ox, oy));
        const drop = wHere.sub(wn).div(Math.hypot(ox, oy));
        const better = drop.greaterThan(bestDrop);
        bx = better.select(float(ox), bx);
        by = better.select(float(oy), by);
        bestDrop = max(bestDrop, drop);
      }
      // stop in flats/lakes; stop at borders
      If(bestDrop.lessThanEqual(1e-5), () => {
        Break();
      });
      px.addAssign(bx);
      py.addAssign(by);
      If(
        px.lessThan(1).or(px.greaterThan(res - 2)).or(py.lessThan(1)).or(py.greaterThan(res - 2)),
        () => {
          Break();
        },
      );
    });
  })().compute(particles);
  traceK.setName('flowTrace');
  opts.onProgress?.('hydrology: tracing flow', 0.55);
  await renderer.computeAsync(traceK);

  // --- 3. rivers: strength, carve depth, direction, lakes ---------------------
  const RIVER_T = particles / N + 14; // accumulation threshold (≈ +14 upstream cells)
  const carveK = guard(() => {
    const { x, y, i } = cellXY();
    // @types/three models AtomicFunctionNode without value semantics; at
    // runtime atomicLoad yields a u32 expression — cast for the converter
    const acc = float(atomicLoad(accumU.element(i)) as unknown as NU).toVar();
    const lakeD = W.element(i).sub(height.element(i)).toVar();
    const isLake = lakeD.greaterThan(LAKE_DELTA);
    const t = clamp(acc.div(RIVER_T), 1e-5, 60).toVar();
    const strength = clamp(t.log2().mul(0.18), 0, 1).mul(t.greaterThan(1).select(1, 0)).toVar();
    flowStrength.element(i).assign(isLake.select(float(1), strength));
    // carve: up to ~7 m for the largest rivers, soft-edged via neighbors later
    const depth = strength.pow(1.4).mul(7);
    const hNew = height.element(i).sub(depth);
    height.element(i).assign(hNew);
    riverDepth.element(i).assign(
      isLake.select(lakeD, strength.greaterThan(0.01).select(depth.mul(0.45).add(0.12), float(0))),
    );
    // flow direction: downhill gradient of W
    const wl = W.element(at(x, y, -1, 0));
    const wr = W.element(at(x, y, 1, 0));
    const wd = W.element(at(x, y, 0, -1));
    const wu = W.element(at(x, y, 0, 1));
    const g = vec2(wl.sub(wr), wd.sub(wu));
    flowDir.element(i).assign(g.div(g.length().max(1e-5)));
    // moisture source: lakes + marshes + rivers + residual erosion water
    const marsh = lakeD.greaterThan(MARSH_DELTA).select(float(0.8), float(0));
    const src = isLake
      .select(float(1), max(strength.mul(0.85), marsh))
      .add(clamp(erosionWater.element(i).mul(2), 0, 0.35));
    moistA.element(i).assign(clamp(src, 0, 1));
  })().compute(N);
  carveK.setName('riverCarve');
  opts.onProgress?.('hydrology: carving rivers', 0.7);
  await renderer.computeAsync(carveK);

  // --- 4. moisture: separable max-blur then average-blur ----------------------
  const R = 10; // taps each side; effective radius ~R·texel·passes
  const makeBlur = (src: FloatBuffer, dst: FloatBuffer, dx: number, dy: number): ComputeNode => {
    const k = guard(() => {
      const { x, y, i } = cellXY();
      let sum: NF = float(0);
      let wsum = 0;
      for (let o = -R; o <= R; o++) {
        const wgt = 1 - Math.abs(o) / (R + 1);
        sum = sum.add(src.element(at(x, y, o * dx, o * dy)).mul(wgt));
        wsum += wgt;
      }
      dst.element(i).assign(sum.div(wsum));
    })().compute(N);
    k.setName('moistBlur');
    return k;
  };
  opts.onProgress?.('hydrology: moisture field', 0.85);
  await renderer.computeAsync([
    makeBlur(moistA, moistB, 1, 0),
    makeBlur(moistB, moistA, 0, 1),
    makeBlur(moistA, moistB, 1, 0),
    makeBlur(moistB, moistA, 0, 1),
  ]);

  return {
    waterSurface: W,
    flowStrength,
    riverDepth,
    flowDir,
    moisture: moistA,
  };
}
