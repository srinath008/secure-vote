/**
 * decoder.test.ts — All 4 input selections produce correct one-hot output.
 * Replaces Decoder2to4 verification.
 */

import { describe, it, expect } from 'vitest';
import { decode2to4 } from '../src/fsm/decoder';

describe('decode2to4 — all 4 selections', () => {
  it('sel=0 → [1,0,0,0] one-hot', () => {
    expect(decode2to4(0)).toEqual([1, 0, 0, 0]);
  });

  it('sel=1 → [0,1,0,0] one-hot', () => {
    expect(decode2to4(1)).toEqual([0, 1, 0, 0]);
  });

  it('sel=2 → [0,0,1,0] one-hot', () => {
    expect(decode2to4(2)).toEqual([0, 0, 1, 0]);
  });

  it('sel=3 → [0,0,0,1] one-hot', () => {
    expect(decode2to4(3)).toEqual([0, 0, 0, 1]);
  });

  it('output is always one-hot (exactly one 1)', () => {
    for (let sel = 0; sel <= 3; sel++) {
      const out = decode2to4(sel as 0|1|2|3);
      const sum = out.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1);
    }
  });

  it('asserted line matches sel index', () => {
    for (let sel = 0; sel <= 3; sel++) {
      const out = decode2to4(sel as 0|1|2|3);
      expect(out[sel]).toBe(1);
    }
  });
});
