/**
 * nextState.ts — Combinational next-state logic
 *
 * Implements the Boolean equations from the build spec §3.4 EXACTLY.
 * A switch statement MUST NOT replace these equations.
 * The unit tests in nextState.test.ts verify the equations, not a switch.
 *
 * ── HDL signal → spec signal mapping ────────────────────────────────────────
 *   auth  (SRLatch Q output)        → EN   (enable / authorize)
 *   sel   (priority encoder valid)  → V    (valid selection present)
 *   lock  (done / acknowledge pin)  → ACK  (acknowledge)
 *
 * ── Spec equations (authoritative) ─────────────────────────────────────────
 *   Q1_next = (¬Q1·Q0·V) + (Q1·¬Q0) + (Q1·Q0·¬ACK)
 *   Q0_next = (¬Q1·¬Q0·EN) + (¬Q1·Q0·¬V) + (Q1·¬Q0) + (Q1·Q0·¬ACK)
 *
 * ── Discrepancy with original NextState.hdl (documented) ────────────────────
 *   The HDL's d1 = q1 + (¬q1·q0·sel) keeps Q1=1 in S3 regardless of lock.
 *   The HDL's d0 has a (q1·q0) term (S3 never exits) and (q1·¬q0·lock)
 *   (S2→S3 requires lock pulse).
 *
 *   In the software model the spec makes S2→S3 unconditional (engine.ts
 *   advances it in one request) and S3→S0 is properly gated by ACK.
 *   The spec equations are the authoritative definition for this build.
 *
 * This file has no database imports and no Express imports.
 */

import { and, not, or, type Bit } from './gates';

export function nextState(
  q1: Bit,
  q0: Bit,
  EN: Bit,
  V: Bit,
  ACK: Bit
): [Bit, Bit] {
  // Q1_next = (¬Q1·Q0·V) + (Q1·¬Q0) + (Q1·Q0·¬ACK)
  const nq1 = or(
    and(and(not(q1), q0), V),          // S1→S2: in S1 with valid selection
    and(q1, not(q0)),                  // S2: in S2, Q1 carries through (unconditional advance)
    and(and(q1, q0), not(ACK))         // S3 hold: in S3 without acknowledge
  );

  // Q0_next = (¬Q1·¬Q0·EN·1) + (¬Q1·Q0·¬V) + (Q1·¬Q0) + (Q1·Q0·¬ACK)
  // The ·1 factor on the first term is explicit to mirror the gate-level derivation
  const nq0 = or(
    and(and(and(not(q1), not(q0)), EN), 1 as Bit), // S0→S1: idle + authorized
    and(and(not(q1), q0), not(V)),                  // S1 hold: enabled but no selection
    and(q1, not(q0)),                               // S2: Q0 carries through (unconditional)
    and(and(q1, q0), not(ACK))                      // S3 hold: confirm + no acknowledge
  );

  return [nq1, nq0];
}
