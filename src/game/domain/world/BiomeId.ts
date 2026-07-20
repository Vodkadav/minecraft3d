/**
 * The biome id type, split out of `BiomeResources.ts` so
 * `domain/creatures/CreatureDefinition.ts` can reference it (E6.3
 * `biomeAffinity`) without creating a cycle: `BiomeResources.ts` derives its
 * per-biome creature lists FROM the creature registry, so the registry can't
 * import back from `BiomeResources.ts`. This file has no logic and no
 * dependencies — both sides import the type from here.
 */

export type BiomeId = "lowland" | "highland" | "alpine";
