/**
 * srLatch.ts — SR Latch (voter enable latch)
 *
 * This is the hardware guarantee against double voting.
 *
 * ── Original SRLatch.hdl (DFF-based) ────────────────────────────────────────
 *   nextQ = S + (Q · ¬R)    (implemented with Not, And, Or, DFF)
 *   SET dominant: when S=1, nextQ=1 regardless of R.
 *
 * ── This implementation (NAND-gate style, as specified) ──────────────────────
 *   The equivalent gate formula derived from NAND primitives:
 *     nextQ = nand(¬S,  nand(Q_prev, ¬R))
 *           = nand(nand(S,S),  nand(Q_prev, nand(R,R)))
 *
 *   Verification:
 *     SET  (S=1,R=0,Q=0): nand(0, nand(0,1)) = nand(0,1) = 1 ✓
 *     RESET(S=0,R=1,Q=1): nand(1, nand(1,0)) = nand(1,1) = 0 ✓
 *     HOLD (S=0,R=0,Q=1): nand(1, nand(1,1)) = nand(1,0) = 1 ✓
 *     HOLD (S=0,R=0,Q=0): nand(1, nand(0,1)) = nand(1,1) = 0 ✓
 *     BOTH (S=1,R=1,Q=0): nand(0, nand(0,0)) = nand(0,1) = 1 ✓ (set-dominant)
 *
 * ── Lifecycle ────────────────────────────────────────────────────────────────
 *   SET   when voter authenticates AND election is OPEN AND hasVoted = false.
 *   RESET in S2_LOCKED (commit state), atomically with the tally write.
 *   While reset: EN=0, FSM cannot leave S0 — voter cannot reach ballot again.
 *
 * The resolved Q value is persisted in VotingSession.latch (boolean).
 *
 * This file has no database imports and no Express imports.
 */

import { nand, not, type Bit } from './gates';

export class SRLatch {
  private _q: Bit;

  constructor(initialQ: Bit = 0) {
    this._q = initialQ;
  }

  get Q(): Bit {
    return this._q;
  }

  /**
   * Apply one latch operation using cross-coupled NAND gates.
   * Formula: nextQ = nand(¬S, nand(Q_prev, ¬R))
   */
  tick(S: Bit, R: Bit): Bit {
    const nq = nand(not(S), nand(this._q, not(R)));
    this._q = nq;
    return this._q;
  }

  /** SET: S=1, R=0 → Q becomes 1 (voter authorized). */
  set(): Bit {
    return this.tick(1, 0);
  }

  /** RESET: S=0, R=1 → Q becomes 0 (commit complete, latch cleared). */
  reset(): Bit {
    return this.tick(0, 1);
  }

  /** HOLD: S=0, R=0 → Q unchanged. */
  hold(): Bit {
    return this.tick(0, 0);
  }

  /** Restore latch state from the persisted boolean in the database. */
  static fromPersisted(q: boolean): SRLatch {
    return new SRLatch(q ? 1 : 0);
  }
}
