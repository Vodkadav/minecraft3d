import { describe, expect, it } from 'vitest';
import { VoxelMaterial } from '../game/domain/voxel/VoxelMaterial';
import { VOXEL_MATERIAL_RGB } from './VoxelMaterials';

describe('VOXEL_MATERIAL_RGB', () => {
  it('has one colour per domain material id, in id order', () => {
    const ids = Object.values(VoxelMaterial);
    expect(VOXEL_MATERIAL_RGB).toHaveLength(ids.length);
    for (const id of ids) {
      const rgb = VOXEL_MATERIAL_RGB[id];
      expect(rgb, `material ${id} has a palette entry`).toBeDefined();
      expect(rgb).toHaveLength(3);
      for (const c of rgb) expect(c).toBeGreaterThanOrEqual(0);
    }
  });
});
