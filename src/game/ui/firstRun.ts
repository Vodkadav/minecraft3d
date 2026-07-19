/**
 * First-run touch (Workstream 10.3): a gentle nudge toward "Solo" the very
 * first time the menu loads, using the same localStorage seam every other
 * menu-side, non-domain concern already uses directly (e.g. persisted
 * settings). Pure predicate + a tiny storage-writing helper so the predicate
 * stays unit-testable without touching `window`/`localStorage`.
 */

const FIRST_RUN_KEY = "diggy.hasLaunched";

/** True the very first time (no stored flag yet, or an empty one). */
export function isFirstRun(rawFlag: string | null): boolean {
  return rawFlag !== "1";
}

/** Best-effort — a storage failure (private mode, quota) never blocks play. */
export function markLaunched(storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(FIRST_RUN_KEY, "1");
  } catch (e) {
    console.warn("[menu] first-run flag not persisted (storage unavailable):", e);
  }
}

export function readFirstRunFlag(storage: Pick<Storage, "getItem"> = localStorage): string | null {
  try {
    return storage.getItem(FIRST_RUN_KEY);
  } catch (e) {
    console.warn("[menu] first-run flag unreadable (storage unavailable):", e);
    return null;
  }
}
