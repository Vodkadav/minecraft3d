/**
 * Research tree (Phase E6.4). Reducer modeled on `progression/ProgressionState.ts`
 * (a pure fold over events) and `character/TalentTree.ts` (prereq-gated node
 * allocation) — no engine, no I/O. Unlike talents, research points are never
 * granted directly: they're *derived* on demand from the existing
 * `ProgressionEvents` stream (`earnedResearchPoints`), so a `ResearchState`
 * only ever needs to remember what's been spent, not what's been earned —
 * identical to how `unlockedTierFor` derives the crafting-tier gate from
 * `completedObjectives` rather than storing it.
 *
 * Cozy: research is **permanent, additive-only progression** — every effect
 * only adds capability (extra stat bonus, or an `unlockTier` gate raised),
 * and there is deliberately no `respecResearch` (unlike stats/talents,
 * nothing is ever un-learned).
 *
 * Unlock effects unify with the existing crafting gate rather than inventing
 * a parallel one: a `statBonus` effect reuses `TalentBonusKind`/`totalBonus`'s
 * shape (`researchTotalBonus` mirrors `TalentTree.totalBonus`), and an
 * `unlockTier` effect is the exact same numeric gate `Crafting.ts`/
 * `Objectives.ts` already check — `researchUnlockedTierFor` mirrors
 * `ProgressionState.unlockedTierFor` so a caller combines both sources with
 * a single `Math.max` (see `GameHud.ts`), never a second gate.
 */

import { err, ok, type Result } from "../Result";
import type { TalentBonusKind } from "../character/TalentTree";
import type { ProgressionState } from "../progression/ProgressionState";

/** How many gather-ish events (dig+harvest+craft) earn one research point —
 *  "gathering" from the brief. */
const POINTS_PER_GATHER_TICK = 5;
/** Each completed objective (the tutorial/discovery chain) earns points —
 *  "discovery" from the brief. */
const POINTS_PER_OBJECTIVE = 2;
/** Each unlocked achievement earns points — "achievements" from the brief. */
const POINTS_PER_ACHIEVEMENT = 3;

export type ResearchEffect =
  | { readonly kind: "unlockTier"; readonly tier: number }
  | { readonly kind: "statBonus"; readonly stat: TalentBonusKind; readonly amount: number };

export type ResearchBranch = "gathering" | "crafting" | "vitality";

export interface ResearchNode {
  readonly id: string;
  readonly nameKey: string;
  readonly descKey: string;
  readonly branch: ResearchBranch;
  readonly cost: number;
  readonly prereqs: readonly string[];
  readonly effect: ResearchEffect;
}

export interface ResearchState {
  readonly unlockedNodeIds: readonly string[];
  readonly spentPoints: number;
}

export function emptyResearchState(): ResearchState {
  return { unlockedNodeIds: [], spentPoints: 0 };
}

/** Fold the progression stream into a research-point total — gathering
 *  (event counts), discovery (completed objectives), and achievements, each
 *  a simple linear rate. Purely derived, never stored. */
export function earnedResearchPoints(progression: ProgressionState): number {
  const gatherEvents = progression.counts.dig + progression.counts.harvest + progression.counts.craft;
  const gatherPoints = Math.floor(gatherEvents / POINTS_PER_GATHER_TICK);
  const objectivePoints = progression.completedObjectives.length * POINTS_PER_OBJECTIVE;
  const achievementPoints = progression.unlockedAchievements.length * POINTS_PER_ACHIEVEMENT;
  return gatherPoints + objectivePoints + achievementPoints;
}

/** Unspent research points right now — earned minus already spent. Never
 *  negative (spending is always gated by this at allocation time). */
export function availableResearchPoints(progression: ProgressionState, state: ResearchState): number {
  return Math.max(0, earnedResearchPoints(progression) - state.spentPoints);
}

export type ResearchError =
  | { readonly kind: "UnknownNode"; readonly nodeId: string }
  | { readonly kind: "AlreadyUnlocked"; readonly nodeId: string }
  | { readonly kind: "PrereqsNotMet"; readonly nodeId: string }
  | { readonly kind: "InsufficientPoints"; readonly nodeId: string; readonly need: number; readonly have: number };

function prereqsMet(node: ResearchNode, unlocked: ReadonlySet<string>): boolean {
  return node.prereqs.every((id) => unlocked.has(id));
}

/** Unlock one node: validates unknown id, already-unlocked, prereqs, and
 *  point budget, in that order, before mutating anything. */
export function unlockResearchNode(
  nodes: readonly ResearchNode[],
  state: ResearchState,
  progression: ProgressionState,
  nodeId: string,
): Result<ResearchState, ResearchError> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return err({ kind: "UnknownNode", nodeId });

  const unlocked = new Set(state.unlockedNodeIds);
  if (unlocked.has(nodeId)) return err({ kind: "AlreadyUnlocked", nodeId });
  if (!prereqsMet(node, unlocked)) return err({ kind: "PrereqsNotMet", nodeId });

  const have = availableResearchPoints(progression, state);
  if (have < node.cost) {
    return err({ kind: "InsufficientPoints", nodeId, need: node.cost, have });
  }

  return ok({
    unlockedNodeIds: [...state.unlockedNodeIds, nodeId],
    spentPoints: state.spentPoints + node.cost,
  });
}

export function canUnlockResearchNode(
  nodes: readonly ResearchNode[],
  state: ResearchState,
  progression: ProgressionState,
  nodeId: string,
): boolean {
  return unlockResearchNode(nodes, state, progression, nodeId).ok;
}

/** The UI's three-state read: "unlocked" (already spent), "affordable"
 *  (prereqs met and enough points right now), or "locked" (either prereqs
 *  unmet or not enough points yet) — the exact tri-state the ResearchScreen
 *  brief asks for. */
export type ResearchNodeStatus = "locked" | "affordable" | "unlocked";

export function researchNodeStatus(
  nodes: readonly ResearchNode[],
  state: ResearchState,
  progression: ProgressionState,
  nodeId: string,
): ResearchNodeStatus {
  if (state.unlockedNodeIds.includes(nodeId)) return "unlocked";
  return canUnlockResearchNode(nodes, state, progression, nodeId) ? "affordable" : "locked";
}

/** The highest `unlockTier` effect among unlocked nodes, 0 if none — mirrors
 *  `ProgressionState.unlockedTierFor` exactly so callers combine the two
 *  sources with `Math.max`, never a second parallel gate. */
export function researchUnlockedTierFor(
  nodes: readonly ResearchNode[],
  unlockedNodeIds: readonly string[],
): number {
  const unlocked = new Set(unlockedNodeIds);
  let tier = 0;
  for (const node of nodes) {
    if (node.effect.kind !== "unlockTier") continue;
    if (!unlocked.has(node.id)) continue;
    tier = Math.max(tier, node.effect.tier);
  }
  return tier;
}

/** Sum of `statBonus` amounts of one kind among unlocked nodes — mirrors
 *  `TalentTree.totalBonus`. 0 if none unlocked. */
export function researchTotalBonus(
  nodes: readonly ResearchNode[],
  state: ResearchState,
  stat: TalentBonusKind,
): number {
  const unlocked = new Set(state.unlockedNodeIds);
  return nodes
    .filter((n) => unlocked.has(n.id) && n.effect.kind === "statBonus" && n.effect.stat === stat)
    .reduce((sum, n) => sum + (n.effect as { amount: number }).amount, 0);
}
