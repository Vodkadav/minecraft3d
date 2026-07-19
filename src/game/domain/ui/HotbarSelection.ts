/**
 * Pure hotbar selection state (Workstream 3, task 3.3). 9 slots, 0-indexed;
 * number keys 1-9 select directly, mouse-wheel scroll steps with wrap-around.
 * No DOM, no inventory knowledge — the component composes this with the
 * Inventory model to render.
 */

export const HOTBAR_SIZE = 9;

export interface HotbarState {
  readonly selected: number;
}

export function initialHotbar(): HotbarState {
  return { selected: 0 };
}

/** Clamps to a valid slot; out-of-range indices are ignored (state unchanged). */
export function selectHotbarSlot(state: HotbarState, index: number): HotbarState {
  if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE) return state;
  return { selected: index };
}

/** Digit key 1-9 -> slot 0-8. Any other digit (e.g. 0) is ignored. */
export function selectHotbarByDigit(state: HotbarState, digit: number): HotbarState {
  if (!Number.isInteger(digit) || digit < 1 || digit > HOTBAR_SIZE) return state;
  return selectHotbarSlot(state, digit - 1);
}

/** Wheel deltaY: positive scrolls forward (next slot), negative backward — wraps around. */
export function scrollHotbar(state: HotbarState, deltaY: number): HotbarState {
  if (deltaY === 0) return state;
  const dir = deltaY > 0 ? 1 : -1;
  const next = (state.selected + dir + HOTBAR_SIZE) % HOTBAR_SIZE;
  return { selected: next };
}
