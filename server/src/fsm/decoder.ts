/**
 * decoder.ts — 2-to-4 decoder
 *
 * Mirrors Decoder2to4.hdl (enable is always 1 for FSM use):
 *   IN  sel0, sel1, enable
 *   OUT out0, out1, out2, out3
 *
 * Boolean equations (one-hot output):
 *   D0 = ¬SEL1·¬SEL0
 *   D1 = ¬SEL1·SEL0
 *   D2 = SEL1·¬SEL0
 *   D3 = SEL1·SEL0
 *
 * Used to select which tally register receives the increment in S2_LOCKED,
 * and to identify which candidate is highlighted as locked in the UI.
 *
 * This file has no database imports and no Express imports.
 */

import { and, not, type Bit } from './gates';

export type OneHot4 = [Bit, Bit, Bit, Bit];

export function decode2to4(sel: 0 | 1 | 2 | 3): OneHot4 {
  const SEL1 = ((sel >> 1) & 1) as Bit;
  const SEL0 = (sel & 1) as Bit;

  const D0 = and(not(SEL1), not(SEL0));  // ¬SEL1·¬SEL0 → slot 0
  const D1 = and(not(SEL1), SEL0);       // ¬SEL1·SEL0  → slot 1
  const D2 = and(SEL1, not(SEL0));       // SEL1·¬SEL0  → slot 2
  const D3 = and(SEL1, SEL0);            // SEL1·SEL0   → slot 3

  return [D0, D1, D2, D3];
}
