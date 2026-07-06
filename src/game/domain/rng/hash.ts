/**
 * Deterministic integer hashing for seed-driven world content — the domain-layer
 * primitive the plan calls `hash(seed, cell, depth)` (ore/gem veins 8.4, hidden
 * treasures 8.7, later seeded spawns 5.2). Pure, renderer-free, and independent
 * of the engine's GPU hashes (pcg2d/cyrb53 live in src/gpu / src/core, which the
 * domain layer may not import — arch-layered-ports).
 *
 * MurmurHash3-style mix over a variadic int list: order-sensitive, good
 * avalanche, and stable across runs and machines (integer ops only, no floats
 * in the mix). Callers quantize world coordinates to integer cells first.
 */

/** Hash any number of 32-bit integers to a uniform uint32 in [0, 2^32). */
export function hash32(...ints: readonly number[]): number {
  let h = 0x811c9dc5 | 0;
  for (const n of ints) {
    let k = n | 0;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash to a uniform float in [0, 1) — the eligibility roll for veins/treasures. */
export function hashUnitFloat(...ints: readonly number[]): number {
  return hash32(...ints) / 4294967296;
}
