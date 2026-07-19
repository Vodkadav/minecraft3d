/**
 * Contextual keyhint state (Workstream 6.5) — pure "have I shown this
 * first-time prompt yet?" tracking. A hint is dismissed permanently the
 * moment it's shown; the UI layer decides *when* the triggering condition
 * (first food in inventory, first tamable in reach) is true and calls
 * `markKeyhintShown` once it renders the prompt.
 */

export const KEYHINT_IDS = ["eat", "tame"] as const;
export type KeyhintId = (typeof KEYHINT_IDS)[number];

export interface KeyhintState {
  readonly shown: readonly KeyhintId[];
}

export function emptyKeyhintState(): KeyhintState {
  return { shown: [] };
}

export function shouldShowKeyhint(state: KeyhintState, id: KeyhintId): boolean {
  return !state.shown.includes(id);
}

export function markKeyhintShown(state: KeyhintState, id: KeyhintId): KeyhintState {
  if (state.shown.includes(id)) return state;
  return { shown: [...state.shown, id] };
}
