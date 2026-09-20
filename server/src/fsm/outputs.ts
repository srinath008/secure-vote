/**
 * outputs.ts — Moore output decode (function of state only)
 *
 * Outputs are derived from Boolean expressions over Q1 and Q0.
 * They are Moore outputs: determined solely by the current state,
 * not by inputs — exactly as in the original EVMFSM.hdl design.
 *
 * Equations:
 *   IDLE_LAMP     = ¬Q1·¬Q0   → S0: not authorized
 *   BALLOT_ACTIVE = ¬Q1·Q0    → S1: candidate buttons enabled
 *   COMMIT        = Q1·¬Q0    → S2: tally increment (ONLY here)
 *   CONFIRM_LAMP  = Q1·Q0     → S3: show confirmation screen
 *
 * This file has no database imports and no Express imports.
 */

import { and, not, type Bit } from './gates';

export interface MooreOutputs {
  IDLE_LAMP: Bit;
  BALLOT_ACTIVE: Bit;
  COMMIT: Bit;
  CONFIRM_LAMP: Bit;
}

export function mooreOutputs(q1: Bit, q0: Bit): MooreOutputs {
  return {
    IDLE_LAMP:     and(not(q1), not(q0)),  // ¬Q1·¬Q0  (S0)
    BALLOT_ACTIVE: and(not(q1), q0),       // ¬Q1·Q0   (S1)
    COMMIT:        and(q1, not(q0)),       // Q1·¬Q0   (S2)
    CONFIRM_LAMP:  and(q1, q0),            // Q1·Q0    (S3)
  };
}
