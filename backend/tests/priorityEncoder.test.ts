/**
 * priorityEncoder.test.ts — All 16 input combinations.
 * Replaces PriorityEncoder.tst verification script.
 *
 * Invariants verified:
 *   - Highest-index asserted button always wins
 *   - valid=1 iff at least one button is pressed
 *   - valid=0 and sel=0 when all buttons off
 */

import { describe, it, expect } from 'vitest';
import { priorityEncode, type EncoderOutput } from '../src/fsm/priorityEncoder';
import type { Bit } from '../src/fsm/gates';

type B4 = [Bit, Bit, Bit, Bit];

/** Helper: integer 0–15 → [b0,b1,b2,b3] bit vector */
function toBits(n: number): B4 {
  return [
    ((n >> 0) & 1) as Bit,
    ((n >> 1) & 1) as Bit,
    ((n >> 2) & 1) as Bit,
    ((n >> 3) & 1) as Bit,
  ];
}

/** Expected highest-set-bit index, or 0 if none set */
function expectedSel(b: B4): 0 | 1 | 2 | 3 {
  for (let i = 3; i >= 0; i--) {
    if (b[i] === 1) return i as 0 | 1 | 2 | 3;
  }
  return 0;
}

describe('priorityEncode — all 16 input combinations', () => {
  for (let n = 0; n < 16; n++) {
    const b = toBits(n);
    const label = `b=[${b.join(',')}] (n=${n})`;

    it(`valid flag: ${label}`, () => {
      const { V } = priorityEncode(b);
      const anySet = b.some(bit => bit === 1);
      expect(V).toBe(anySet ? 1 : 0);
    });

    it(`selection: ${label}`, () => {
      const { sel, V } = priorityEncode(b);
      if (V === 0) {
        // No button pressed — sel is irrelevant, V is what matters
        expect(V).toBe(0);
      } else {
        expect(sel).toBe(expectedSel(b));
      }
    });
  }
});

describe('priorityEncode — specific priority cases', () => {
  it('single button 0: sel=0, V=1', () => {
    const r = priorityEncode([1, 0, 0, 0]);
    expect(r.V).toBe(1);
    expect(r.sel).toBe(0);
  });

  it('single button 1: sel=1, V=1', () => {
    const r = priorityEncode([0, 1, 0, 0]);
    expect(r.V).toBe(1);
    expect(r.sel).toBe(1);
  });

  it('single button 2: sel=2, V=1', () => {
    const r = priorityEncode([0, 0, 1, 0]);
    expect(r.V).toBe(1);
    expect(r.sel).toBe(2);
  });

  it('single button 3: sel=3, V=1', () => {
    const r = priorityEncode([0, 0, 0, 1]);
    expect(r.V).toBe(1);
    expect(r.sel).toBe(3);
  });

  it('B1+B2 simultaneously: B2 wins (sel=2)', () => {
    const r = priorityEncode([0, 1, 1, 0]);
    expect(r.sel).toBe(2);
  });

  it('all buttons: B3 wins (sel=3)', () => {
    const r = priorityEncode([1, 1, 1, 1]);
    expect(r.V).toBe(1);
    expect(r.sel).toBe(3);
  });

  it('no buttons: V=0', () => {
    const r = priorityEncode([0, 0, 0, 0]);
    expect(r.V).toBe(0);
  });
});
