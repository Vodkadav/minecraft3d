/**
 * Resource-node STATE and yield rules — the harvestable-object domain. Spawn
 * *placement* in the world is a later milestone (M5); this models only whether a
 * node can be harvested, what it drops, and how it respawns.
 *
 * Everything is deterministic: `harvest` takes a numeric roll in [0,1) instead of
 * reaching for `Math.random`, so a seeded caller (or a test) gets reproducible
 * drops. Failures are Result values (err-explicit-result-handling).
 */

import { err, ok, type Result } from "../Result";
import type { ItemStack } from "../inventory/Inventory";

export interface YieldRule {
  readonly itemId: string;
  readonly min: number;
  readonly max: number;
}

export interface ResourceNodeType {
  readonly id: string;
  readonly yields: readonly YieldRule[];
  /** Milliseconds to respawn after harvest; 0 means the node depletes for good. */
  readonly respawnMs: number;
}

export interface ResourceNode {
  readonly type: ResourceNodeType;
  readonly available: boolean;
  readonly respawnRemainingMs: number;
}

export type NodeStatus = "available" | "respawning" | "depleted";

export type GatherError = { readonly kind: "NotHarvestable"; readonly nodeTypeId: string };

export interface HarvestResult {
  readonly yields: readonly ItemStack[];
  readonly node: ResourceNode;
}

export function makeNode(type: ResourceNodeType): ResourceNode {
  return { type, available: true, respawnRemainingMs: 0 };
}

export function nodeStatus(node: ResourceNode): NodeStatus {
  if (node.available) return "available";
  return node.respawnRemainingMs > 0 ? "respawning" : "depleted";
}

function rollCount(rule: YieldRule, roll: number): number {
  const clamped = Math.min(Math.max(roll, 0), 0.999999);
  const span = rule.max - rule.min + 1;
  const count = rule.min + Math.floor(clamped * span);
  return Math.min(count, rule.max);
}

export function harvest(node: ResourceNode, roll: number): Result<HarvestResult, GatherError> {
  if (!node.available) return err({ kind: "NotHarvestable", nodeTypeId: node.type.id });

  const yields = node.type.yields.map((rule) => ({
    itemId: rule.itemId,
    count: rollCount(rule, roll),
  }));

  const depleted: ResourceNode = {
    type: node.type,
    available: false,
    respawnRemainingMs: node.type.respawnMs,
  };
  return ok({ yields, node: depleted });
}

export function tick(node: ResourceNode, elapsedMs: number): ResourceNode {
  if (node.available || node.respawnRemainingMs <= 0) return node;

  const remaining = node.respawnRemainingMs - elapsedMs;
  if (remaining <= 0) return { type: node.type, available: true, respawnRemainingMs: 0 };
  return { type: node.type, available: false, respawnRemainingMs: remaining };
}
