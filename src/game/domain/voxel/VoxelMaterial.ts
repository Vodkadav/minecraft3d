/**
 * Voxel material ids — the shared contract between the domain seeding function
 * (OreGemSeeding, plan 8.4) and the engine palette (src/voxel/VoxelMaterials
 * VOXEL_MATERIAL_RGB, indexed by these ids). Kept in the domain so the seeding
 * logic names materials instead of magic numbers; the engine imports it to keep
 * the palette aligned.
 */

export const VoxelMaterial = {
  STONE: 0,
  TOPSOIL: 1,
  DEEP_ROCK: 2,
  ORE: 3,
  GEM: 4,
  GRASS: 5,
} as const;

export type VoxelMaterialId = (typeof VoxelMaterial)[keyof typeof VoxelMaterial];
