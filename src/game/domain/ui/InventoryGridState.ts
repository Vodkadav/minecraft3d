/**
 * Pure inventory-grid view-state (Workstream 4, task 4.1): a 2D keyboard
 * cursor plus a "pick then place" two-step selection. `select()` is the one
 * state transition and is deliberately reused by every input method — mouse
 * click-click, keyboard Enter/Space-twice, and pointer drag-start/drag-end
 * (pointerdown selects the source, pointerup selects the target) all
 * funnel through it, so move/swap/merge semantics only exist once. No DOM,
 * no Inventory knowledge — the component composes this with the domain
 * inventory operations.
 */

export interface GridUiState {
  readonly cursor: number;
  /** The slot currently picked up, awaiting a target; null when idle. */
  readonly picked: number | null;
}

export function initialGridState(cursor = 0): GridUiState {
  return { cursor, picked: null };
}

/** Arrow-key cursor movement over a `cols`-wide grid of `capacity` slots. */
export function moveCursor(
  state: GridUiState,
  dx: number,
  dy: number,
  capacity: number,
  cols: number,
): GridUiState {
  if (capacity <= 0 || cols <= 0) return state;
  const row = Math.floor(state.cursor / cols);
  const col = state.cursor % cols;
  const rows = Math.ceil(capacity / cols);
  const nextCol = clamp(col + dx, 0, cols - 1);
  const nextRow = clamp(row + dy, 0, rows - 1);
  const next = nextRow * cols + nextCol;
  if (next < 0 || next >= capacity) return state;
  return { ...state, cursor: next };
}

export type SelectResult =
  | { readonly kind: "picked"; readonly index: number; readonly state: GridUiState }
  | { readonly kind: "cancelled"; readonly state: GridUiState }
  | { readonly kind: "moved"; readonly from: number; readonly to: number; readonly state: GridUiState };

/**
 * Selects `index`: nothing picked yet -> picks it up; picking the same slot
 * again -> cancels; picking a different slot -> resolves as a move (from the
 * previously-picked slot to this one) and the caller applies it to the
 * Inventory model.
 */
export function select(state: GridUiState, index: number): SelectResult {
  if (state.picked === null) {
    const next = { ...state, picked: index, cursor: index };
    return { kind: "picked", index, state: next };
  }
  const from = state.picked;
  const next: GridUiState = { ...state, picked: null, cursor: index };
  if (from === index) return { kind: "cancelled", state: next };
  return { kind: "moved", from, to: index, state: next };
}

/** Drops whatever is picked up without acting on it (e.g. Escape). */
export function cancelPick(state: GridUiState): GridUiState {
  return { ...state, picked: null };
}

/** Half the stack, rounded down, always leaving at least 1 behind and moving at least 1. */
export function splitCount(stackCount: number): number {
  return Math.max(1, Math.floor(stackCount / 2));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
