/**
 * Isosurface extraction for one voxel chunk (M8.2, research §3) using the
 * regular-cell tables of Eric Lengyel's Transvoxel Algorithm (modified
 * Marching Cubes). Pure math: lattice samples in, indexed triangles out —
 * no three.js, unit-tested headlessly.
 *
 * Sign convention matches the domain volume: negative = solid, positive = air
 * (0 counts as air). Triangles are wound counter-clockwise seen from the air
 * side, matching three.js front faces.
 *
 * Same-LOD chunk seams are crack-free because neighboring chunks interpolate
 * identical global lattice samples. Transition cells (LOD stitching between
 * resolutions) are a later [F] step — the tables are already generated.
 */

import {
  CHUNK_CELLS,
  chunkSampleOrigin,
  VOXEL_SIZE_M,
} from "../game/domain/voxel/VoxelGrid";
import {
  regularCellClass,
  regularCellCounts,
  regularCellIndices,
  regularVertexData,
} from "./TransvoxelTables";

/** Read-only view of the global sample lattice (integer indices, meters out). */
export interface GridSampler {
  sdf(ix: number, iy: number, iz: number): number;
  material(ix: number, iy: number, iz: number): number;
  edited(ix: number, iy: number, iz: number): boolean;
}

export interface ChunkMeshData {
  /** World-space meters, xyz per vertex. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Material id per vertex, taken from the solid side of the crossing. */
  readonly materials: Uint8Array;
  readonly indices: Uint32Array;
}

export interface ExtractOptions {
  /**
   * Mesh only cells with at least one edited corner sample. The engine uses
   * this so pristine surface cells stay owned by the CDLOD heightfield
   * (no duplicate surface, no z-fighting at the break-ground seam).
   */
  readonly onlyEditedCells?: boolean;
}

/** Corner i offset per Lengyel Figure 3.7: bit0 = +x, bit1 = +y, bit2 = +z. */
const CORNER_DX = [0, 1, 0, 1, 0, 1, 0, 1];
const CORNER_DY = [0, 0, 1, 1, 0, 0, 1, 1];
const CORNER_DZ = [0, 0, 0, 0, 1, 1, 1, 1];

export function extractChunkMesh(
  sampler: GridSampler,
  cx: number,
  cy: number,
  cz: number,
  options: ExtractOptions = {},
): ChunkMeshData {
  const ox = chunkSampleOrigin(cx);
  const oy = chunkSampleOrigin(cy);
  const oz = chunkSampleOrigin(cz);

  const positions: number[] = [];
  const normals: number[] = [];
  const materials: number[] = [];
  const indices: number[] = [];
  /** Global edge/corner key -> emitted vertex index (dedup across cells). */
  const vertexCache = new Map<string, number>();

  const d = new Float64Array(8);
  const gx = new Int32Array(8);
  const gy = new Int32Array(8);
  const gz = new Int32Array(8);

  for (let lz = 0; lz < CHUNK_CELLS; lz++) {
    for (let ly = 0; ly < CHUNK_CELLS; ly++) {
      for (let lx = 0; lx < CHUNK_CELLS; lx++) {
        let caseCode = 0;
        let anyEdited = false;
        for (let i = 0; i < 8; i++) {
          gx[i] = ox + lx + CORNER_DX[i];
          gy[i] = oy + ly + CORNER_DY[i];
          gz[i] = oz + lz + CORNER_DZ[i];
          d[i] = sampler.sdf(gx[i], gy[i], gz[i]);
          if (d[i] < 0) caseCode |= 1 << i;
        }
        if (caseCode === 0 || caseCode === 255) continue;
        if (options.onlyEditedCells) {
          for (let i = 0; i < 8 && !anyEdited; i++) {
            anyEdited = sampler.edited(gx[i], gy[i], gz[i]);
          }
          if (!anyEdited) continue;
        }

        const cellClass = regularCellClass[caseCode];
        const counts = regularCellCounts[cellClass];
        const vertexCount = counts >> 4;
        const triangleCount = counts & 0x0f;

        const cellVertices = new Array<number>(vertexCount);
        for (let v = 0; v < vertexCount; v++) {
          const edgeCode = regularVertexData[caseCode * 12 + v];
          const cornerA = (edgeCode >> 4) & 0x0f;
          const cornerB = edgeCode & 0x0f;
          cellVertices[v] = emitVertex(
            sampler,
            vertexCache,
            positions,
            normals,
            materials,
            gx[cornerA],
            gy[cornerA],
            gz[cornerA],
            d[cornerA],
            gx[cornerB],
            gy[cornerB],
            gz[cornerB],
            d[cornerB],
          );
        }

        const indexBase = cellClass * 15;
        for (let t = 0; t < triangleCount; t++) {
          const a = cellVertices[regularCellIndices[indexBase + t * 3]];
          const b = cellVertices[regularCellIndices[indexBase + t * 3 + 1]];
          const c = cellVertices[regularCellIndices[indexBase + t * 3 + 2]];
          if (a === b || b === c || c === a) continue; // collapsed at a corner
          indices.push(a, b, c);
        }
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    materials: Uint8Array.from(materials),
    indices: Uint32Array.from(indices),
  };
}

function emitVertex(
  sampler: GridSampler,
  cache: Map<string, number>,
  positions: number[],
  normals: number[],
  materials: number[],
  ax: number,
  ay: number,
  az: number,
  da: number,
  bx: number,
  by: number,
  bz: number,
  db: number,
): number {
  const span = da - db;
  let t = Math.abs(span) < 1e-12 ? 0.5 : da / span;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  // Cache key: collapsed vertices key on the lattice corner, others on the
  // undirected edge (lower endpoint first) — global, so cells share vertices.
  let key: string;
  if (t === 0) key = `c${ax},${ay},${az}`;
  else if (t === 1) key = `c${bx},${by},${bz}`;
  else {
    key =
      ax < bx || ay < by || az < bz
        ? `e${ax},${ay},${az}|${bx},${by},${bz}`
        : `e${bx},${by},${bz}|${ax},${ay},${az}`;
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const gxF = ax + (bx - ax) * t;
  const gyF = ay + (by - ay) * t;
  const gzF = az + (bz - az) * t;

  const index = positions.length / 3;
  positions.push(gxF * VOXEL_SIZE_M, gyF * VOXEL_SIZE_M, gzF * VOXEL_SIZE_M);

  const normal = gradientNormal(sampler, gxF, gyF, gzF);
  normals.push(normal[0], normal[1], normal[2]);

  // Material from the more-solid endpoint of the crossing.
  materials.push(
    da <= db ? sampler.material(ax, ay, az) : sampler.material(bx, by, bz),
  );

  cache.set(key, index);
  return index;
}

/** Trilinear SDF at fractional lattice coords. */
function sdfTrilinear(sampler: GridSampler, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const wx = i & 1 ? fx : 1 - fx;
    const wy = i & 2 ? fy : 1 - fy;
    const wz = i & 4 ? fz : 1 - fz;
    const weight = wx * wy * wz;
    if (weight === 0) continue;
    value +=
      weight * sampler.sdf(x0 + (i & 1), y0 + ((i >> 1) & 1), z0 + ((i >> 2) & 1));
  }
  return value;
}

/** Central-difference gradient — SDF grows toward air, so this faces outward. */
function gradientNormal(
  sampler: GridSampler,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const eps = 0.5;
  const nx = sdfTrilinear(sampler, x + eps, y, z) - sdfTrilinear(sampler, x - eps, y, z);
  const ny = sdfTrilinear(sampler, x, y + eps, z) - sdfTrilinear(sampler, x, y - eps, z);
  const nz = sdfTrilinear(sampler, x, y, z + eps) - sdfTrilinear(sampler, x, y, z - eps);
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-12) return [0, 1, 0];
  return [nx / length, ny / length, nz / length];
}
