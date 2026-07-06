import { describe, expect, it } from "vitest";
import {
  CHUNK_CELLS,
  VOXEL_SIZE_M,
} from "../game/domain/voxel/VoxelGrid";
import {
  extractChunkMesh,
  type ChunkMeshData,
  type GridSampler,
} from "./SurfaceExtractor";

/** Analytic sampler: sdf in meters over global lattice indices (negative = solid). */
function sampler(
  sdfM: (xM: number, yM: number, zM: number) => number,
  material: (xM: number, yM: number, zM: number) => number = () => 0,
  edited: () => boolean = () => true,
): GridSampler {
  return {
    sdf: (ix, iy, iz) => sdfM(ix * VOXEL_SIZE_M, iy * VOXEL_SIZE_M, iz * VOXEL_SIZE_M),
    material: (ix, iy, iz) =>
      material(ix * VOXEL_SIZE_M, iy * VOXEL_SIZE_M, iz * VOXEL_SIZE_M),
    edited,
  };
}

function triangleCount(mesh: ChunkMeshData): number {
  return mesh.indices.length / 3;
}

function vertex(mesh: ChunkMeshData, i: number): [number, number, number] {
  return [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
}

describe("extractChunkMesh — trivial fields", () => {
  it("produces no geometry in uniform air", () => {
    const mesh = extractChunkMesh(sampler(() => 1), 0, 0, 0);
    expect(mesh.indices.length).toBe(0);
    expect(mesh.positions.length).toBe(0);
  });

  it("produces no geometry in uniform solid", () => {
    const mesh = extractChunkMesh(sampler(() => -1), 0, 0, 0);
    expect(mesh.indices.length).toBe(0);
  });
});

describe("extractChunkMesh — horizontal plane", () => {
  const planeY = 4.25;
  const field = sampler((_x, y) => y - planeY);

  it("meshes two triangles per surface cell", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    expect(triangleCount(mesh)).toBe(CHUNK_CELLS * CHUNK_CELLS * 2);
  });

  it("places every vertex on the plane", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      expect(vertex(mesh, i)[1]).toBeCloseTo(planeY, 5);
    }
  });

  it("covers the full chunk footprint in area", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    const side = CHUNK_CELLS * VOXEL_SIZE_M;
    expect(meshArea(mesh)).toBeCloseTo(side * side, 3);
  });

  it("orients shading normals up (toward air)", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    for (let i = 0; i < mesh.normals.length / 3; i++) {
      expect(mesh.normals[i * 3 + 1]).toBeGreaterThan(0.99);
    }
  });

  it("winds triangles counter-clockwise seen from the air side (three.js front face)", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    for (let t = 0; t < triangleCount(mesh); t++) {
      const n = geometricNormal(mesh, t);
      expect(n[1]).toBeGreaterThan(0);
    }
  });

  it("shares vertices between adjacent triangles (indexed dedup)", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    expect(mesh.positions.length / 3).toBeLessThan(mesh.indices.length / 2);
  });
});

describe("extractChunkMesh — sphere", () => {
  const center = [4, 4, 4] as const;
  const radius = 2.6;
  const field = sampler(
    (x, y, z) => Math.hypot(x - center[0], y - center[1], z - center[2]) - radius,
  );
  // solid inside the sphere -> surface is the sphere boundary

  it("is watertight: every undirected edge borders exactly two triangles", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    expect(triangleCount(mesh)).toBeGreaterThan(0);

    const edgeUse = new Map<string, number>();
    for (let t = 0; t < triangleCount(mesh); t++) {
      const [a, b, c] = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      }
    }
    for (const uses of edgeUse.values()) expect(uses).toBe(2);
  });

  it("points every triangle outward (solid inside, air outside)", () => {
    const mesh = extractChunkMesh(field, 0, 0, 0);
    for (let t = 0; t < triangleCount(mesh); t++) {
      const n = geometricNormal(mesh, t);
      const centroid = triangleCentroid(mesh, t);
      const outward = [
        centroid[0] - center[0],
        centroid[1] - center[1],
        centroid[2] - center[2],
      ];
      const dot = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2];
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("tags vertices with the solid-side material", () => {
    const ORE = 7;
    const oreField = sampler(
      (x, y, z) => Math.hypot(x - center[0], y - center[1], z - center[2]) - radius,
      () => ORE,
    );
    const mesh = extractChunkMesh(oreField, 0, 0, 0);
    expect(mesh.materials.length).toBe(mesh.positions.length / 3);
    for (const m of mesh.materials) expect(m).toBe(ORE);
  });
});

describe("extractChunkMesh — edited-cell masking", () => {
  const planeY = 4.25;

  it("emits nothing when no cell corner is edited", () => {
    const field = sampler((_x, y) => y - planeY, () => 0, () => false);
    const mesh = extractChunkMesh(field, 0, 0, 0, { onlyEditedCells: true });
    expect(mesh.indices.length).toBe(0);
  });

  it("meshes only cells with at least one edited corner", () => {
    const field: GridSampler = {
      sdf: (_ix, iy) => iy * VOXEL_SIZE_M - planeY,
      material: () => 0,
      edited: (ix) => ix <= 4,
    };
    const full = extractChunkMesh(field, 0, 0, 0);
    const masked = extractChunkMesh(field, 0, 0, 0, { onlyEditedCells: true });
    expect(masked.indices.length).toBeGreaterThan(0);
    expect(masked.indices.length).toBeLessThan(full.indices.length);
  });
});

describe("extractChunkMesh — chunk seams", () => {
  it("emits identical vertex positions along the shared face of two chunks", () => {
    // A tilted plane crossing both chunks, not axis-aligned.
    const field = sampler((x, y, z) => y - 3.1 - 0.2 * x - 0.13 * z);
    const a = extractChunkMesh(field, 0, 0, 0);
    const b = extractChunkMesh(field, 1, 0, 0);

    const faceX = CHUNK_CELLS * VOXEL_SIZE_M;
    const onFace = (mesh: ChunkMeshData) => {
      const set = new Set<string>();
      for (let i = 0; i < mesh.positions.length / 3; i++) {
        const [x, y, z] = vertex(mesh, i);
        if (Math.abs(x - faceX) < 1e-6) set.add(`${y.toFixed(6)},${z.toFixed(6)}`);
      }
      return set;
    };

    const facesA = onFace(a);
    const facesB = onFace(b);
    expect(facesA.size).toBeGreaterThan(0);
    expect(facesA).toEqual(facesB);
  });
});

function geometricNormal(mesh: ChunkMeshData, t: number): [number, number, number] {
  const [i0, i1, i2] = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
  const v0 = vertex(mesh, i0);
  const v1 = vertex(mesh, i1);
  const v2 = vertex(mesh, i2);
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  return [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
}

function triangleCentroid(mesh: ChunkMeshData, t: number): [number, number, number] {
  const [i0, i1, i2] = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
  const v0 = vertex(mesh, i0);
  const v1 = vertex(mesh, i1);
  const v2 = vertex(mesh, i2);
  return [
    (v0[0] + v1[0] + v2[0]) / 3,
    (v0[1] + v1[1] + v2[1]) / 3,
    (v0[2] + v1[2] + v2[2]) / 3,
  ];
}

function meshArea(mesh: ChunkMeshData): number {
  let area = 0;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const n = geometricNormal(mesh, t);
    area += Math.hypot(n[0], n[1], n[2]) / 2;
  }
  return area;
}
