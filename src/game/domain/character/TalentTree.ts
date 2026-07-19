/**
 * Talent tree (Phase E1.3). A modest, additive tree — reducer modeled on
 * `progression/ProgressionState.ts` (a small data-defined node list plus a
 * pure evaluation/allocation function; no engine, no I/O). Each node is
 * single-rank (cozy-simple: no rank-grinding) and grants one passive bonus
 * that only ever adds capability. `respecTalents` is a free, total refund —
 * the same "never punishes the player" posture as `CharacterStats.respecStats`.
 */

import { err, ok, type Result } from "../Result";

export type TalentBonusKind = "attackPower" | "gatherPower" | "maxHealth" | "maxEnergy" | "loot";

export interface TalentBonus {
  readonly kind: TalentBonusKind;
  readonly amount: number;
}

export interface TalentNode {
  readonly id: string;
  readonly nameKey: string;
  readonly descKey: string;
  readonly requiredLevel: number;
  readonly prereqs: readonly string[];
  readonly bonus: TalentBonus;
}

/** The default modest tree (cozy: five friendly, low-friction nodes; two
 *  independent opening branches converging on a shared capstone). */
export const TALENT_NODES: readonly TalentNode[] = [
  {
    id: "strongArms",
    nameKey: "talent.strongArms.name",
    descKey: "talent.strongArms.desc",
    requiredLevel: 1,
    prereqs: [],
    bonus: { kind: "attackPower", amount: 0.05 },
  },
  {
    id: "quickHands",
    nameKey: "talent.quickHands.name",
    descKey: "talent.quickHands.desc",
    requiredLevel: 1,
    prereqs: [],
    bonus: { kind: "gatherPower", amount: 0.05 },
  },
  {
    id: "toughSkin",
    nameKey: "talent.toughSkin.name",
    descKey: "talent.toughSkin.desc",
    requiredLevel: 3,
    prereqs: ["strongArms"],
    bonus: { kind: "maxHealth", amount: 0.05 },
  },
  {
    id: "deepBreath",
    nameKey: "talent.deepBreath.name",
    descKey: "talent.deepBreath.desc",
    requiredLevel: 3,
    prereqs: ["quickHands"],
    bonus: { kind: "maxEnergy", amount: 0.05 },
  },
  {
    id: "luckyFinds",
    nameKey: "talent.luckyFinds.name",
    descKey: "talent.luckyFinds.desc",
    requiredLevel: 5,
    prereqs: ["toughSkin", "deepBreath"],
    bonus: { kind: "loot", amount: 0.1 },
  },
];

export interface TalentTreeState {
  /** Node id -> rank (0 or 1 — every node in the default tree is single-rank). */
  readonly ranks: Readonly<Record<string, number>>;
  readonly unspentPoints: number;
}

export function emptyTalentTree(unspentPoints = 0): TalentTreeState {
  return { ranks: {}, unspentPoints };
}

export type TalentError =
  | { readonly kind: "UnknownNode"; readonly nodeId: string }
  | { readonly kind: "NoPointsAvailable" }
  | { readonly kind: "LevelTooLow"; readonly nodeId: string; readonly requiredLevel: number }
  | { readonly kind: "PrereqsNotMet"; readonly nodeId: string }
  | { readonly kind: "AlreadyMaxRank"; readonly nodeId: string };

function completedIds(state: TalentTreeState): ReadonlySet<string> {
  return new Set(Object.keys(state.ranks).filter((id) => (state.ranks[id] ?? 0) > 0));
}

function prereqsMet(node: TalentNode, completed: ReadonlySet<string>): boolean {
  return node.prereqs.every((id) => completed.has(id));
}

/** Allocate one point into a node: validates unknown id, budget, level gate,
 *  prereqs, and max-rank, in that order, before mutating anything. */
export function allocateTalent(
  nodes: readonly TalentNode[],
  state: TalentTreeState,
  nodeId: string,
  level: number,
): Result<TalentTreeState, TalentError> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return err({ kind: "UnknownNode", nodeId });
  if (state.unspentPoints <= 0) return err({ kind: "NoPointsAvailable" });
  if (level < node.requiredLevel) {
    return err({ kind: "LevelTooLow", nodeId, requiredLevel: node.requiredLevel });
  }
  if ((state.ranks[nodeId] ?? 0) >= 1) return err({ kind: "AlreadyMaxRank", nodeId });
  if (!prereqsMet(node, completedIds(state))) return err({ kind: "PrereqsNotMet", nodeId });

  return ok({
    ranks: { ...state.ranks, [nodeId]: 1 },
    unspentPoints: state.unspentPoints - 1,
  });
}

/** Free, total respec: every allocated node clears and every spent point
 *  returns to the unspent pool. */
export function respecTalents(state: TalentTreeState): TalentTreeState {
  const spent = Object.values(state.ranks).reduce((sum, rank) => sum + rank, 0);
  return { ranks: {}, unspentPoints: state.unspentPoints + spent };
}

/** Adds points to the unspent pool (e.g. from a level-up grant). A no-op for
 *  non-positive amounts. */
export function grantTalentPoints(state: TalentTreeState, amount: number): TalentTreeState {
  if (amount <= 0) return state;
  return { ...state, unspentPoints: state.unspentPoints + amount };
}

/** The active bonuses granted by every currently-allocated node. */
export function activeBonuses(
  nodes: readonly TalentNode[],
  state: TalentTreeState,
): readonly TalentBonus[] {
  return nodes.filter((n) => (state.ranks[n.id] ?? 0) > 0).map((n) => n.bonus);
}

/** Sum of active bonus amounts of one kind — 0 if none allocated. */
export function totalBonus(
  nodes: readonly TalentNode[],
  state: TalentTreeState,
  kind: TalentBonusKind,
): number {
  return activeBonuses(nodes, state)
    .filter((b) => b.kind === kind)
    .reduce((sum, b) => sum + b.amount, 0);
}

/** True when a node can be allocated right now (used to render an
 *  enabled/disabled node in the tree UI without needing the full Result). */
export function canAllocateTalent(
  nodes: readonly TalentNode[],
  state: TalentTreeState,
  nodeId: string,
  level: number,
): boolean {
  return allocateTalent(nodes, state, nodeId, level).ok;
}
