import { describe, expect, it } from 'vitest';
import { sliceSpans } from './SliceMath';

describe('sliceSpans', () => {
  it('covers an exact multiple with full slices', () => {
    expect(sliceSpans(8, 4)).toEqual([
      { base: 0, count: 4 },
      { base: 4, count: 4 },
    ]);
  });

  it('shortens the final slice to the remainder', () => {
    expect(sliceSpans(10, 4)).toEqual([
      { base: 0, count: 4 },
      { base: 4, count: 4 },
      { base: 8, count: 2 },
    ]);
  });

  it('emits a single span when total fits one slice', () => {
    expect(sliceSpans(3, 4)).toEqual([{ base: 0, count: 3 }]);
  });

  it('spans exactly cover the total with no overlap', () => {
    const spans = sliceSpans(16_777_216, 1 << 20);
    let expectedBase = 0;
    for (const s of spans) {
      expect(s.base).toBe(expectedBase);
      expectedBase += s.count;
    }
    expect(expectedBase).toBe(16_777_216);
  });

  it('rejects a non-positive slice or total', () => {
    expect(() => sliceSpans(10, 0)).toThrow();
    expect(() => sliceSpans(0, 4)).toThrow();
  });
});
