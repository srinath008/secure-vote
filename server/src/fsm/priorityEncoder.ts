/**
 * priorityEncoder.ts — 4-input priority encoder (74LS148 equivalent)
 *
 * Mirrors PriorityEncoder.hdl:
 *   IN  c0, c1, c2, c3   (candidate button lines)
 *   OUT out0, out1, valid
 *
 * Behaviour: if more than one button is asserted, the HIGHEST index wins.
 * This mirrors the hardware and guarantees a single deterministic selection
 * even under a malformed or malicious multi-select request.
 *
 * ── Spec Boolean equations (authoritative) ──────────────────────────────────
 *   valid = B0 + B1 + B2 + B3
 *   SEL1  = B3 + B2                    (MSB of encoded output)
 *   SEL0  = B3 + (B1·¬B2)             (LSB of encoded output)
 *
 * ── Discrepancy with PriorityEncoder.hdl ────────────────────────────────────
 *   The HDL uses `out0 = c1 OR c3` which gives the wrong result when both
 *   c1=1 and c2=1 (yields SEL=3 instead of correct SEL=2).
 *   The spec equations above are correct for all 16 input combinations and
 *   are used here. (Verified in priorityEncoder.test.ts against all 16 cases.)
 *
 * This file has no database imports and no Express imports.
 */

import { and, not, or, type Bit } from './gates';

export interface EncoderOutput {
  V: Bit;              // valid: at least one button pressed
  sel: 0 | 1 | 2 | 3; // encoded candidate index (0–3)
  SEL1: Bit;           // MSB of encoded output
  SEL0: Bit;           // LSB of encoded output
}

export function priorityEncode(b: [Bit, Bit, Bit, Bit]): EncoderOutput {
  const [b0, b1, b2, b3] = b;

  // valid = B0 + B1 + B2 + B3
  const V = or(b0, b1, b2, b3);

  // SEL1 = B3 + B2
  const SEL1 = or(b3, b2);

  // SEL0 = B3 + (B1 · ¬B2)
  const SEL0 = or(b3, and(b1, not(b2)));

  const sel = ((SEL1 << 1) | SEL0) as 0 | 1 | 2 | 3;

  return { V, sel, SEL1, SEL0 };
}
