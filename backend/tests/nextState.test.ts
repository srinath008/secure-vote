/**
 * nextState.test.ts — Exhaustive: 4 states × 8 input combos = 32 assertions.
 * Replaces NextState.tst verification script.
 *
 * Expected values are pre-computed from the Boolean equations in §3.4 and
 * cross-checked against the NextState.out reference output from the HDL sim.
 *
 * Input key: EN = authorize, V = valid-selection, ACK = acknowledge
 */

import { describe, it, expect } from 'vitest';
import { nextState } from '../src/fsm/nextState';
import type { Bit } from '../src/fsm/gates';

type Case = {
  q1: Bit; q0: Bit;
  EN: Bit; V: Bit; ACK: Bit;
  expQ1: Bit; expQ0: Bit;
  label: string;
};

const cases: Case[] = [
  // ── S0_IDLE (q1=0, q0=0) ──────────────────────────────────────────────────
  // EN=0 → stays S0 regardless of V, ACK
  { q1:0, q0:0, EN:0, V:0, ACK:0, expQ1:0, expQ0:0, label:'S0 EN=0,V=0,ACK=0 → S0' },
  { q1:0, q0:0, EN:0, V:0, ACK:1, expQ1:0, expQ0:0, label:'S0 EN=0,V=0,ACK=1 → S0' },
  { q1:0, q0:0, EN:0, V:1, ACK:0, expQ1:0, expQ0:0, label:'S0 EN=0,V=1,ACK=0 → S0' },
  { q1:0, q0:0, EN:0, V:1, ACK:1, expQ1:0, expQ0:0, label:'S0 EN=0,V=1,ACK=1 → S0' },
  // EN=1 → advance to S1 regardless of V, ACK
  { q1:0, q0:0, EN:1, V:0, ACK:0, expQ1:0, expQ0:1, label:'S0 EN=1,V=0,ACK=0 → S1' },
  { q1:0, q0:0, EN:1, V:0, ACK:1, expQ1:0, expQ0:1, label:'S0 EN=1,V=0,ACK=1 → S1' },
  { q1:0, q0:0, EN:1, V:1, ACK:0, expQ1:0, expQ0:1, label:'S0 EN=1,V=1,ACK=0 → S1' },
  { q1:0, q0:0, EN:1, V:1, ACK:1, expQ1:0, expQ0:1, label:'S0 EN=1,V=1,ACK=1 → S1' },

  // ── S1_ENABLED (q1=0, q0=1) ───────────────────────────────────────────────
  // V=0 → stays S1
  { q1:0, q0:1, EN:0, V:0, ACK:0, expQ1:0, expQ0:1, label:'S1 V=0,EN=0,ACK=0 → S1' },
  { q1:0, q0:1, EN:0, V:0, ACK:1, expQ1:0, expQ0:1, label:'S1 V=0,EN=0,ACK=1 → S1' },
  { q1:0, q0:1, EN:1, V:0, ACK:0, expQ1:0, expQ0:1, label:'S1 V=0,EN=1,ACK=0 → S1' },
  { q1:0, q0:1, EN:1, V:0, ACK:1, expQ1:0, expQ0:1, label:'S1 V=0,EN=1,ACK=1 → S1' },
  // V=1 → advance to S2
  { q1:0, q0:1, EN:0, V:1, ACK:0, expQ1:1, expQ0:0, label:'S1 V=1,EN=0,ACK=0 → S2' },
  { q1:0, q0:1, EN:0, V:1, ACK:1, expQ1:1, expQ0:0, label:'S1 V=1,EN=0,ACK=1 → S2' },
  { q1:0, q0:1, EN:1, V:1, ACK:0, expQ1:1, expQ0:0, label:'S1 V=1,EN=1,ACK=0 → S2' },
  { q1:0, q0:1, EN:1, V:1, ACK:1, expQ1:1, expQ0:0, label:'S1 V=1,EN=1,ACK=1 → S2' },

  // ── S2_LOCKED (q1=1, q0=0) ────────────────────────────────────────────────
  // Unconditional: always → S3 regardless of EN, V, ACK
  { q1:1, q0:0, EN:0, V:0, ACK:0, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (000)' },
  { q1:1, q0:0, EN:0, V:0, ACK:1, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (001)' },
  { q1:1, q0:0, EN:0, V:1, ACK:0, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (010)' },
  { q1:1, q0:0, EN:0, V:1, ACK:1, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (011)' },
  { q1:1, q0:0, EN:1, V:0, ACK:0, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (100)' },
  { q1:1, q0:0, EN:1, V:0, ACK:1, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (101)' },
  { q1:1, q0:0, EN:1, V:1, ACK:0, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (110)' },
  { q1:1, q0:0, EN:1, V:1, ACK:1, expQ1:1, expQ0:1, label:'S2 unconditional → S3 (111)' },

  // ── S3_CONFIRM (q1=1, q0=1) ───────────────────────────────────────────────
  // ACK=0 → stays S3
  { q1:1, q0:1, EN:0, V:0, ACK:0, expQ1:1, expQ0:1, label:'S3 ACK=0,EN=0,V=0 → S3' },
  { q1:1, q0:1, EN:0, V:1, ACK:0, expQ1:1, expQ0:1, label:'S3 ACK=0,EN=0,V=1 → S3' },
  { q1:1, q0:1, EN:1, V:0, ACK:0, expQ1:1, expQ0:1, label:'S3 ACK=0,EN=1,V=0 → S3' },
  { q1:1, q0:1, EN:1, V:1, ACK:0, expQ1:1, expQ0:1, label:'S3 ACK=0,EN=1,V=1 → S3' },
  // ACK=1 → advance to S0
  { q1:1, q0:1, EN:0, V:0, ACK:1, expQ1:0, expQ0:0, label:'S3 ACK=1,EN=0,V=0 → S0' },
  { q1:1, q0:1, EN:0, V:1, ACK:1, expQ1:0, expQ0:0, label:'S3 ACK=1,EN=0,V=1 → S0' },
  { q1:1, q0:1, EN:1, V:0, ACK:1, expQ1:0, expQ0:0, label:'S3 ACK=1,EN=1,V=0 → S0' },
  { q1:1, q0:1, EN:1, V:1, ACK:1, expQ1:0, expQ0:0, label:'S3 ACK=1,EN=1,V=1 → S0' },
];

describe('nextState — 32 exhaustive state × input combinations', () => {
  for (const { q1, q0, EN, V, ACK, expQ1, expQ0, label } of cases) {
    it(label, () => {
      const [nq1, nq0] = nextState(q1, q0, EN, V, ACK);
      expect(nq1).toBe(expQ1);
      expect(nq0).toBe(expQ0);
    });
  }
});

describe('nextState — HDL output cross-check (NextState.out reference)', () => {
  // The original NextState.tst checks these specific rows.
  // Note: HDL uses auth=EN, sel=V, lock=ACK naming.
  it('q1=0,q0=0,auth=1,sel=0,lock=0 → d1=0,d0=1 (S0+EN→S1)', () => {
    expect(nextState(0, 0, 1, 0, 0)).toEqual([0, 1]);
  });
  it('q1=0,q0=0,auth=0,sel=0,lock=0 → d1=0,d0=0 (S0+no-EN→S0)', () => {
    expect(nextState(0, 0, 0, 0, 0)).toEqual([0, 0]);
  });
  it('q1=0,q0=1,auth=0,sel=1,lock=0 → d1=1,d0=0 (S1+V→S2)', () => {
    expect(nextState(0, 1, 0, 1, 0)).toEqual([1, 0]);
  });
  it('q1=0,q0=1,auth=0,sel=0,lock=0 → d1=0,d0=1 (S1+no-V→S1)', () => {
    expect(nextState(0, 1, 0, 0, 0)).toEqual([0, 1]);
  });
  it('q1=1,q0=0 → always d1=1,d0=1 (S2 unconditional)', () => {
    expect(nextState(1, 0, 0, 0, 0)).toEqual([1, 1]);
  });
  it('q1=1,q0=1 → d1=1,d0=1 (S3 hold, no ACK)', () => {
    expect(nextState(1, 1, 0, 0, 0)).toEqual([1, 1]);
  });
  it('q1=1,q0=1,ACK=1 → d1=0,d0=0 (S3+ACK→S0)', () => {
    expect(nextState(1, 1, 0, 0, 1)).toEqual([0, 0]);
  });
});
