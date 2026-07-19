/**
 * Pure dedup/cooldown/priority rules for audio events (Workstream 1.1). The
 * cooldown state is an immutable record of last-played timestamps per event
 * id; `resolvePlay` decides whether a play request is allowed right now and
 * returns the next state — callers thread it through frame to frame. No
 * timers, no Web Audio: purely a function of (state, event, time).
 */

import { audioEventDef, type AudioEventId } from "./AudioEvents";

export interface CooldownState {
  readonly lastPlayedMs: Readonly<Partial<Record<AudioEventId, number>>>;
}

export function emptyCooldownState(): CooldownState {
  return { lastPlayedMs: {} };
}

export interface ResolvePlayResult {
  readonly allow: boolean;
  readonly state: CooldownState;
}

/** Should this event be allowed to play at `nowMs`, given its cooldown? */
export function resolvePlay(
  state: CooldownState,
  id: AudioEventId,
  nowMs: number,
): ResolvePlayResult {
  const def = audioEventDef(id);
  const last = state.lastPlayedMs[id];
  if (def.cooldownMs > 0 && last !== undefined && nowMs - last < def.cooldownMs) {
    return { allow: false, state };
  }
  return {
    allow: true,
    state: { lastPlayedMs: { ...state.lastPlayedMs, [id]: nowMs } },
  };
}

/** Among several event ids competing in the same tick, keep only the
 *  highest-priority one (ties keep the first). Empty input yields null. */
export function pickPriority(ids: readonly AudioEventId[]): AudioEventId | null {
  if (ids.length === 0) return null;
  let best = ids[0]!;
  let bestPriority = audioEventDef(best).priority;
  for (const id of ids.slice(1)) {
    const p = audioEventDef(id).priority;
    if (p > bestPriority) {
      best = id;
      bestPriority = p;
    }
  }
  return best;
}
