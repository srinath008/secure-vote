/**
 * states.ts — State encoding constants and helpers
 *
 * The state register is 2 bits (Q1, Q0), encoding 4 states:
 *
 *   Q1 Q0 | Code | Name         | Meaning
 *   ------+------+--------------+------------------------------------------
 *    0  0  |  0   | S0_IDLE      | No voter authorized. Ballot inactive.
 *    0  1  |  1   | S1_ENABLED   | Voter authorized and latched. Ballot active.
 *    1  0  |  2   | S2_LOCKED    | Selection captured. Tally commit occurs HERE.
 *    1  1  |  3   | S3_CONFIRM   | Vote recorded. Awaiting acknowledgement.
 *
 * Hardware counterpart: StateReg.hdl (2 DFFs storing Q1, Q0).
 *
 * This file has no database imports and no Express imports.
 */

import type { Bit } from './gates';

export const S0_IDLE    = 0 as const;
export const S1_ENABLED = 1 as const;
export const S2_LOCKED  = 2 as const;
export const S3_CONFIRM = 3 as const;

export type StateCode = 0 | 1 | 2 | 3;

export const STATE_NAMES: Record<StateCode, string> = {
  0: 'S0_IDLE',
  1: 'S1_ENABLED',
  2: 'S2_LOCKED',
  3: 'S3_CONFIRM',
};

/** Encode (Q1, Q0) bit pair to a state code 0–3. */
export function encodeState(q1: Bit, q0: Bit): StateCode {
  return ((q1 << 1) | q0) as StateCode;
}

/** Decode a state code 0–3 to the [Q1, Q0] bit pair. */
export function decodeState(code: StateCode): [Bit, Bit] {
  return [(code >> 1) as Bit, (code & 1) as Bit];
}
