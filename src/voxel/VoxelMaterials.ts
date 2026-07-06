/**
 * Voxel material id -> albedo palette for the dig meshes. The ids and the
 * deterministic depth-seeded ore/gem function are the domain's
 * (game/domain/voxel: VoxelMaterial + OreGemSeeding, plan 8.4); this array only
 * gives each id a colour. Index order MUST match VoxelMaterial.* (asserted in
 * the test).
 */

export const VOXEL_MATERIAL_RGB: readonly [number, number, number][] = [
  [0.4, 0.375, 0.34], // 0 STONE
  [0.23, 0.175, 0.115], // 1 TOPSOIL
  [0.28, 0.27, 0.265], // 2 DEEP_ROCK
  [0.75, 0.6, 0.2], // 3 ORE — brassy vein
  [0.35, 0.7, 0.75], // 4 GEM — cyan crystal
  [0.07, 0.12, 0.04], // 5 GRASS — rim skin, blends the re-meshed dig edge
];
