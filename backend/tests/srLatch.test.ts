/**
 * srLatch.test.ts — Set, reset, hold, and dominance behaviour.
 * Replaces SRLatch.tst verification script.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SRLatch } from '../src/fsm/srLatch';

describe('SRLatch', () => {
  describe('initial state', () => {
    it('defaults to Q=0', () => {
      const latch = new SRLatch();
      expect(latch.Q).toBe(0);
    });

    it('can be initialised to Q=1', () => {
      const latch = new SRLatch(1);
      expect(latch.Q).toBe(1);
    });
  });

  describe('set() — S=1, R=0', () => {
    it('from Q=0: set → Q=1', () => {
      const l = new SRLatch(0);
      l.set();
      expect(l.Q).toBe(1);
    });

    it('from Q=1: set → Q=1 (idempotent)', () => {
      const l = new SRLatch(1);
      l.set();
      expect(l.Q).toBe(1);
    });
  });

  describe('reset() — S=0, R=1', () => {
    it('from Q=1: reset → Q=0', () => {
      const l = new SRLatch(1);
      l.reset();
      expect(l.Q).toBe(0);
    });

    it('from Q=0: reset → Q=0 (idempotent)', () => {
      const l = new SRLatch(0);
      l.reset();
      expect(l.Q).toBe(0);
    });
  });

  describe('hold() — S=0, R=0', () => {
    it('hold while Q=0: stays 0', () => {
      const l = new SRLatch(0);
      l.hold();
      expect(l.Q).toBe(0);
    });

    it('hold while Q=1: stays 1', () => {
      const l = new SRLatch(1);
      l.hold();
      expect(l.Q).toBe(1);
    });
  });

  describe('set-dominant behaviour — S=1, R=1', () => {
    it('from Q=0: both asserted → Q=1 (set wins)', () => {
      const l = new SRLatch(0);
      l.tick(1, 1);
      expect(l.Q).toBe(1);
    });

    it('from Q=1: both asserted → Q=1 (set wins)', () => {
      const l = new SRLatch(1);
      l.tick(1, 1);
      expect(l.Q).toBe(1);
    });
  });

  describe('state sequences', () => {
    it('set → hold → reset → hold sequence', () => {
      const l = new SRLatch(0);
      expect(l.set()).toBe(1);
      expect(l.hold()).toBe(1);
      expect(l.reset()).toBe(0);
      expect(l.hold()).toBe(0);
    });

    it('voter lifecycle: set on auth, hold during voting, reset on commit', () => {
      const l = new SRLatch(0); // starts cleared
      l.set();                  // voter authenticated
      expect(l.Q).toBe(1);     // latch is set
      l.hold();                 // waiting for selection
      l.hold();
      expect(l.Q).toBe(1);
      l.reset();                // commit: vote recorded, latch cleared
      expect(l.Q).toBe(0);     // latch is now reset
      l.hold();                 // subsequent API calls: latch stays 0
      expect(l.Q).toBe(0);
    });
  });

  describe('fromPersisted', () => {
    it('restores Q=0 from false', () => {
      const l = SRLatch.fromPersisted(false);
      expect(l.Q).toBe(0);
    });

    it('restores Q=1 from true', () => {
      const l = SRLatch.fromPersisted(true);
      expect(l.Q).toBe(1);
    });
  });
});
