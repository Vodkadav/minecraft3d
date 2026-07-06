/**
 * Pure slice arithmetic for boot-time compute time-slicing (renderer-free —
 * vitest covers this; the TSL/GPU half lives in SlicedCompute.ts).
 */

export interface SliceSpan {
  /** first linear thread index of the slice */
  base: number;
  /** threads in the slice (= slice size except for the final remainder) */
  count: number;
}

/** Contiguous, non-overlapping spans covering [0, total) in `slice` steps. */
export function sliceSpans(total: number, slice: number): SliceSpan[] {
  if (total <= 0 || slice <= 0) {
    throw new Error(`sliceSpans: total (${total}) and slice (${slice}) must be positive`);
  }
  const spans: SliceSpan[] = [];
  for (let base = 0; base < total; base += slice) {
    spans.push({ base, count: Math.min(slice, total - base) });
  }
  return spans;
}
